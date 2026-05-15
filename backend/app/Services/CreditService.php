<?php

namespace App\Services;

use App\Exceptions\InsufficientCreditsException;
use App\Models\CreditTransaction;
use App\Models\User;

class CreditService
{
    public function assertSufficient(User $user, int $requiredCredits): void
    {
        if ($user->credits_balance < $requiredCredits) {
            throw new InsufficientCreditsException($user->credits_balance, $requiredCredits);
        }
    }

    public function deduct(User $user, int $amount, string $description): void
    {
        $this->assertSufficient($user, $amount);

        $user->decrement('credits_balance', $amount);

        CreditTransaction::create([
            'user_id' => $user->id,
            'type' => 'deduction',
            'amount' => -$amount,
            'description' => $description,
        ]);
    }
}
