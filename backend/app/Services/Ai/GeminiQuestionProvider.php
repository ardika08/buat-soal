<?php

namespace App\Services\Ai;

use App\Exceptions\AiProviderException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Throwable;

class GeminiQuestionProvider implements AiProvider
{
    public function __construct(
        private readonly AiPromptBuilder $promptBuilder,
    ) {}

    public function generate(array $data, int $totalQuestions): array
    {
        $apiKey = config('ai.gemini.api_key');
        $model = config('ai.gemini.model');
        $baseUrl = rtrim((string) config('ai.gemini.base_url'), '/');

        if (! $apiKey) {
            throw new AiProviderException('GEMINI_API_KEY belum dikonfigurasi.');
        }

        try {
            $parts = [
                ['text' => $this->promptBuilder->build($data, $totalQuestions)],
            ];

            if (($data['reference_file'] ?? null) instanceof UploadedFile) {
                $parts[] = [
                    'inline_data' => [
                        'mime_type' => 'application/pdf',
                        'data' => base64_encode(file_get_contents($data['reference_file']->getRealPath())),
                    ],
                ];
            }

            $response = Http::timeout(90)
                ->withHeaders(['x-goog-api-key' => (string) $apiKey])
                ->retry(1, 500)
                ->post("{$baseUrl}/models/{$model}:generateContent", [
                    'contents' => [
                        [
                            'role' => 'user',
                            'parts' => $parts,
                        ],
                    ],
                    'generationConfig' => [
                        'temperature' => 0.3,
                        'responseMimeType' => 'application/json',
                        'responseJsonSchema' => $this->promptBuilder->schema(),
                    ],
                ]);
        } catch (Throwable $exception) {
            throw new AiProviderException('Gemini API tidak dapat dihubungi.');
        }

        if ($response->failed()) {
            throw new AiProviderException('Gemini API mengembalikan error.');
        }

        $text = data_get($response->json(), 'candidates.0.content.parts.0.text');

        if (! is_string($text) || trim($text) === '') {
            throw new AiProviderException('Gemini API tidak mengembalikan teks JSON.');
        }

        return $this->decodeJson($text);
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
