<?php

namespace App\Services\Ai;

use App\Exceptions\AiInvalidOutputException;

class QuestionOutputValidator
{
    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>  $requestData
     * @return array<int, array<string, mixed>>
     */
    public function validate(array $payload, array $requestData, int $totalQuestions): array
    {
        $questions = $payload['questions'] ?? null;

        if (! is_array($questions) || count($questions) !== $totalQuestions) {
            throw new AiInvalidOutputException('Jumlah soal dari AI tidak sesuai permintaan.');
        }

        $expectedTypes = $this->expectedTypes($requestData['formats']);
        $validated = [];

        foreach (array_values($questions) as $index => $question) {
            if (! is_array($question)) {
                throw new AiInvalidOutputException('Format soal dari AI tidak valid.');
            }

            foreach (['question_type', 'cognitive_level', 'difficulty', 'question_content', 'correct_answer'] as $field) {
                if (! isset($question[$field]) || trim((string) $question[$field]) === '') {
                    throw new AiInvalidOutputException("Field {$field} wajib diisi.");
                }
            }

            $requiresOptions = in_array($expectedTypes[$index]['id'], ['pg', 'pgk'], true);
            $options = $question['options'] ?? null;

            if ($requiresOptions && (! is_array($options) || count($options) < 2)) {
                throw new AiInvalidOutputException('Pilihan jawaban wajib ada untuk PG/PGK.');
            }

            $answer = $this->cleanAnswer((string) $question['correct_answer']);

            if ($requiresOptions && is_array($options)) {
                [$options, $answer] = $this->shuffleOptions($options, $answer);
            }

            $validated[] = [
                'question_type' => (string) $question['question_type'],
                'cognitive_level' => (string) $question['cognitive_level'],
                'difficulty' => (string) $question['difficulty'],
                'question_content' => (string) $question['question_content'],
                'options' => is_array($options) ? $options : null,
                'correct_answer' => $answer,
                'illustration_prompt' => isset($question['illustration_prompt']) && trim((string) $question['illustration_prompt']) !== ''
                    ? (string) $question['illustration_prompt']
                    : null,
            ];
        }

        return $validated;
    }

    /**
     * @param  array<int, array<string, mixed>>  $formats
     * @return array<int, array{id: string, label: string}>
     */
    private function expectedTypes(array $formats): array
    {
        $types = [];

        foreach ($formats as $format) {
            for ($i = 0; $i < (int) $format['count']; $i++) {
                $types[] = [
                    'id' => (string) $format['id'],
                    'label' => (string) $format['label'],
                ];
            }
        }

        return $types;
    }

    private function cleanAnswer(string $answer): string
    {
        return trim((string) preg_replace('/^\s*(rubrik\s+jawaban|rubrik|pedoman\s+jawaban|kunci\s+jawaban)\s*[:：\-.]\s*/iu', '', $answer));
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array{0: array<string, string>, 1: string}
     */
    private function shuffleOptions(array $options, string $answer): array
    {
        $entries = collect($options)
            ->map(fn (mixed $value, string|int $key): array => [
                'old_key' => strtoupper((string) $key),
                'value' => (string) $value,
            ])
            ->values();

        $correctValues = collect(preg_split('/\s*,\s*/', strtoupper($answer)) ?: [])
            ->filter()
            ->map(function (string $key) use ($entries): ?string {
                return $entries->firstWhere('old_key', $key)['value'] ?? null;
            })
            ->filter()
            ->values();

        if ($correctValues->isEmpty() && $answer !== '') {
            $matched = $entries->first(fn (array $entry): bool => trim($entry['value']) === trim($answer));

            if ($matched) {
                $correctValues = collect([$matched['value']]);
            }
        }

        $letters = range('A', chr(ord('A') + $entries->count() - 1));

        if ($correctValues->count() === 1) {
            $correctValue = (string) $correctValues->first();
            $targetLetter = $letters[array_rand($letters)];
            $newOptions = [];
            $remainingValues = $entries
                ->reject(fn (array $entry): bool => $entry['value'] === $correctValue)
                ->pluck('value')
                ->shuffle()
                ->values();

            foreach ($letters as $letter) {
                $newOptions[$letter] = $letter === $targetLetter
                    ? $correctValue
                    : (string) $remainingValues->shift();
            }

            return [$newOptions, $targetLetter];
        }

        $shuffled = $entries->shuffle()->values();
        $newOptions = [];
        $newAnswers = [];

        foreach ($shuffled as $index => $entry) {
            $letter = $letters[$index];
            $newOptions[$letter] = $entry['value'];

            if ($correctValues->contains($entry['value'])) {
                $newAnswers[] = $letter;
            }
        }

        return [
            $newOptions,
            $newAnswers !== [] ? implode(',', $newAnswers) : $answer,
        ];
    }
}
