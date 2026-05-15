<?php

namespace App\Services\Ai;

use App\Exceptions\AiInvalidOutputException;
use App\Models\User;

class AiQuestionGenerator
{
    public function __construct(
        private readonly GeminiQuestionProvider $geminiProvider,
        private readonly OpenAiQuestionProvider $openAiProvider,
        private readonly QuestionOutputValidator $validator,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @return array<int, array<string, mixed>>
     */
    public function generate(User $user, array $data, int $totalQuestions): array
    {
        $provider = $this->providerFor($user);
        $lastInvalidOutput = null;

        for ($attempt = 0; $attempt < 2; $attempt++) {
            $payload = $provider->generate($data, $totalQuestions);

            try {
                return $this->validator->validate($payload, $data, $totalQuestions);
            } catch (AiInvalidOutputException $exception) {
                $lastInvalidOutput = $exception;
            }
        }

        throw $lastInvalidOutput ?? new AiInvalidOutputException();
    }

    private function providerFor(User $user): AiProvider
    {
        $provider = $this->hasPremiumAccess($user)
            ? config('ai.premium_provider', 'openai')
            : config('ai.free_provider', 'gemini');

        return match ($provider) {
            'openai' => $this->openAiProvider,
            'gemini' => $this->geminiProvider,
            default => $this->geminiProvider,
        };
    }

    private function hasPremiumAccess(User $user): bool
    {
        if ($user->subscription_tier !== 'premium') {
            return false;
        }

        return $user->subscription_expiry === null || $user->subscription_expiry->isFuture();
    }
}
