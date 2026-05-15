<?php

namespace App\Services\Ai;

use App\Exceptions\AiProviderException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Throwable;

class OpenAiQuestionProvider implements AiProvider
{
    public function __construct(
        private readonly AiPromptBuilder $promptBuilder,
    ) {}

    public function generate(array $data, int $totalQuestions): array
    {
        $apiKey = config('ai.openai.api_key');
        $model = config('ai.openai.model');
        $baseUrl = rtrim((string) config('ai.openai.base_url'), '/');

        if (! $apiKey) {
            throw new AiProviderException('OPENAI_API_KEY belum dikonfigurasi.');
        }

        try {
            $userContent = [
                [
                    'type' => 'input_text',
                    'text' => $this->promptBuilder->build($data, $totalQuestions),
                ],
            ];

            if (($data['reference_file'] ?? null) instanceof UploadedFile) {
                $pdf = base64_encode(file_get_contents($data['reference_file']->getRealPath()));
                $userContent[] = [
                    'type' => 'input_file',
                    'filename' => $data['reference_file']->getClientOriginalName(),
                    'file_data' => "data:application/pdf;base64,{$pdf}",
                ];
            }

            $response = Http::timeout(90)
                ->withToken((string) $apiKey)
                ->retry(1, 500)
                ->post("{$baseUrl}/responses", [
                    'model' => $model,
                    'input' => [
                        [
                            'role' => 'system',
                            'content' => 'Anda adalah penyusun soal ujian sekolah. Jawab hanya dengan JSON sesuai schema.',
                        ],
                        [
                            'role' => 'user',
                            'content' => $userContent,
                        ],
                    ],
                    'text' => [
                        'format' => [
                            'type' => 'json_schema',
                            'name' => 'exam_questions',
                            'strict' => true,
                            'schema' => $this->promptBuilder->schema(),
                        ],
                    ],
                ]);
        } catch (Throwable $exception) {
            throw new AiProviderException('OpenAI API tidak dapat dihubungi.');
        }

        if ($response->failed()) {
            throw new AiProviderException('OpenAI API mengembalikan error.');
        }

        $text = $this->extractText($response->json());

        if ($text === null) {
            throw new AiProviderException('OpenAI API tidak mengembalikan teks JSON.');
        }

        return $this->decodeJson($text);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function extractText(array $payload): ?string
    {
        $outputText = $payload['output_text'] ?? null;

        if (is_string($outputText) && trim($outputText) !== '') {
            return $outputText;
        }

        foreach (($payload['output'] ?? []) as $output) {
            foreach (($output['content'] ?? []) as $content) {
                $text = $content['text'] ?? null;
                if (is_string($text) && trim($text) !== '') {
                    return $text;
                }
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeJson(string $text): array
    {
        $decoded = json_decode($text, true);

        return is_array($decoded) ? $decoded : [];
    }
}
