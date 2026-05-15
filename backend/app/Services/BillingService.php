<?php

namespace App\Services;

use App\Models\CreditTransaction;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class BillingService
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function packages(): array
    {
        return array_values(config('billing.packages', []));
    }

    /**
     * @return array{user: User, transaction: CreditTransaction, package: array<string, mixed>}
     */
    public function checkout(User $user, string $packageId): array
    {
        $package = config("billing.packages.{$packageId}");

        if (! is_array($package)) {
            throw new InvalidArgumentException('Paket tidak ditemukan.');
        }

        return DB::transaction(function () use ($user, $package): array {
            $lockedUser = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $credits = (int) $package['credits'];

            $lockedUser->increment('credits_balance', $credits);

            if ($package['type'] === 'subscription') {
                $startsAt = $lockedUser->subscription_expiry && $lockedUser->subscription_expiry->isFuture()
                    ? $lockedUser->subscription_expiry
                    : Carbon::now();

                $lockedUser->forceFill([
                    'subscription_tier' => 'premium',
                    'subscription_expiry' => $startsAt->copy()->addMonths((int) $package['duration_months']),
                ])->save();
            }

            $transaction = CreditTransaction::create([
                'user_id' => $lockedUser->id,
                'type' => $package['type'] === 'subscription' ? 'subscription' : 'topup',
                'amount' => $credits,
                'description' => "{$package['name']} - Rp ".number_format((int) $package['price'], 0, ',', '.'),
            ]);

            return [
                'user' => $lockedUser->fresh(),
                'transaction' => $transaction,
                'package' => $package,
            ];
        });
    }
}
