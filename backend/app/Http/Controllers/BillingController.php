<?php

namespace App\Http\Controllers;

use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

class BillingController extends Controller
{
    public function __construct(
        private readonly BillingService $billingService,
    ) {}

    public function packages(): JsonResponse
    {
        return response()->json([
            'packages' => $this->billingService->packages(),
        ]);
    }

    public function checkout(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'package_id' => ['required', 'string'],
        ]);

        try {
            $result = $this->billingService->checkout($request->user(), $validated['package_id']);
        } catch (InvalidArgumentException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], 404);
        }

        return response()->json([
            'message' => 'Paket berhasil diaktifkan.',
            'package' => $result['package'],
            'transaction' => $result['transaction'],
            'user' => $this->formatUser($result['user']),
        ]);
    }

    private function formatUser($user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'subscription_tier' => $user->subscription_tier,
            'credits_balance' => $user->credits_balance,
            'subscription_expiry' => $user->subscription_expiry?->toDateTimeString(),
        ];
    }
}
