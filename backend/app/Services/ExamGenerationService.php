<?php

namespace App\Services;

use App\Models\ExamSession;
use App\Models\User;
use App\Services\Ai\AiQuestionGenerator;
use App\Services\Ai\IllustrationImageGenerator;
use Illuminate\Support\Facades\DB;

class ExamGenerationService
{
    public function __construct(
        private readonly CreditService $creditService,
        private readonly AiQuestionGenerator $questionGenerator,
        private readonly IllustrationImageGenerator $illustrationImageGenerator,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @return array{exam: ExamSession, questions: mixed, credits_remaining: int}
     */
    public function generate(User $user, array $data): array
    {
        $totalQuestions = $this->totalQuestions($data['formats']);

        $this->creditService->assertSufficient($user, $totalQuestions);

        $generatedQuestions = $this->questionGenerator->generate($user, $data, $totalQuestions);
        $generatedQuestions = $this->attachIllustrationImages($generatedQuestions, $data);

        if (DB::connection()->getDriverName() === 'mysql') {
            DB::connection()->reconnect();
        }

        return DB::transaction(function () use ($user, $data, $totalQuestions, $generatedQuestions): array {
            $lockedUser = User::whereKey($user->id)->lockForUpdate()->firstOrFail();

            $this->creditService->assertSufficient($lockedUser, $totalQuestions);

            $exam = ExamSession::create([
                'user_id' => $lockedUser->id,
                'curriculum' => $data['curriculum'],
                'exam_type' => $data['exam_type'],
                'class_phase' => $data['class_phase'],
                'subject' => $data['subject'],
                'semester' => $data['semester'],
                'time_allocation' => $data['time_allocation'],
                'reference_type' => $data['reference_type'],
                'difficulty' => $data['difficulty'],
                'cognitive_levels' => $data['cognitive_levels'],
                'pg_options' => $data['pg_options'] ?? null,
                'include_illustration' => $data['include_illustration'] ?? false,
                'topics' => $data['topics'],
                'credits_consumed' => $totalQuestions,
            ]);

            foreach ($generatedQuestions as $index => $question) {
                $exam->questions()->create([
                    'order_number' => $index + 1,
                    'question_type' => $question['question_type'],
                    'cognitive_level' => $question['cognitive_level'],
                    'difficulty' => $question['difficulty'],
                    'question_content' => $question['question_content'],
                    'options' => $question['options'] ?? null,
                    'correct_answer' => $question['correct_answer'],
                    'illustration_prompt' => $question['illustration_prompt'] ?? null,
                    'illustration_image' => $question['illustration_image'] ?? null,
                ]);
            }

            $this->creditService->deduct(
                $lockedUser,
                $totalQuestions,
                "Generate {$totalQuestions} soal: {$data['subject']} - {$data['exam_type']}",
            );

            return [
                'exam' => $exam->fresh(),
                'questions' => $exam->questions()->get(),
                'credits_remaining' => $lockedUser->fresh()->credits_balance,
            ];
        });
    }

    /**
     * @param  array<int, array<string, mixed>>  $formats
     */
    private function totalQuestions(array $formats): int
    {
        return collect($formats)->sum(fn (array $format): int => (int) $format['count']);
    }

    /**
     * @param  array<int, array<string, mixed>>  $questions
     * @param  array<string, mixed>  $data
     * @return array<int, array<string, mixed>>
     */
    private function attachIllustrationImages(array $questions, array $data): array
    {
        if (! ($data['include_illustration'] ?? false)) {
            return $questions;
        }

        $expectedTypes = $this->expectedTypes($data['formats']);
        $maxIllustrations = max(0, (int) config('ai.illustrations.max_per_exam', 5));
        $generatedCount = 0;

        return collect($questions)
            ->map(function (array $question, int $index) use ($expectedTypes, $maxIllustrations, &$generatedCount): array {
                $isMultipleChoice = ($expectedTypes[$index]['id'] ?? null) === 'pg';
                $hasPrompt = isset($question['illustration_prompt']) && trim((string) $question['illustration_prompt']) !== '';

                if (! $isMultipleChoice || ! $hasPrompt || $generatedCount >= $maxIllustrations) {
                    $question['illustration_prompt'] = null;
                    $question['illustration_image'] = null;

                    return $question;
                }

                $generatedCount++;
                $question['illustration_image'] = $this->illustrationImageGenerator->generate($question['illustration_prompt']);

                return $question;
            })
            ->all();
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
}
