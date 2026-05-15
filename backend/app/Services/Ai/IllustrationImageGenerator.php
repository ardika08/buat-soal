<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class IllustrationImageGenerator
{
    public function generate(?string $prompt): ?string
    {
        $prompt = trim((string) $prompt);

        if ($prompt === '' || ! config('ai.illustrations.enabled')) {
            return null;
        }

        $apiKey = config('ai.openai.api_key');

        if (! $apiKey) {
            Log::warning('Illustration generation skipped because OPENAI_API_KEY is missing.');

            return null;
        }

        try {
            $response = Http::timeout((int) config('ai.illustrations.timeout'))
                ->withToken((string) $apiKey)
                ->acceptJson()
                ->post(rtrim((string) config('ai.openai.base_url'), '/') . '/images/generations', [
                    'model' => config('ai.illustrations.model'),
                    'prompt' => $this->buildPrompt($prompt),
                    'size' => config('ai.illustrations.size'),
                    'quality' => config('ai.illustrations.quality'),
                    'n' => 1,
                ]);

            if ($response->failed()) {
                Log::warning('Illustration generation failed.', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return null;
            }

            $base64 = data_get($response->json(), 'data.0.b64_json');

            if (! is_string($base64) || $base64 === '') {
                return null;
            }

            return $this->storeImage($base64);
        } catch (Throwable $exception) {
            Log::warning('Illustration generation threw an exception.', [
                'message' => $exception->getMessage(),
            ]);

            return null;
        }
    }

    private function buildPrompt(string $prompt): string
    {
        return implode("\n", [
            'Buat ilustrasi edukatif untuk soal ujian sekolah dasar.',
            'Gaya: hitam putih, line art sederhana, jelas, ramah anak, komposisi sederhana, tanpa teks, tanpa watermark.',
            'Konten harus aman untuk anak dan relevan dengan instruksi berikut:',
            $prompt,
        ]);
    }

    private function storeImage(string $base64): ?string
    {
        $bytes = base64_decode($base64, true);

        if ($bytes === false || $bytes === '') {
            return null;
        }

        $directory = public_path('generated/illustrations');
        File::ensureDirectoryExists($directory);

        $filename = Str::uuid() . '.png';
        File::put($directory . DIRECTORY_SEPARATOR . $filename, $bytes);

        return rtrim((string) config('ai.illustrations.public_url'), '/') . '/generated/illustrations/' . $filename;
    }
}
