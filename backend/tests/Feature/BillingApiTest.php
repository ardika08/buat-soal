<?php

namespace Tests\Feature;

use App\Models\CreditTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BillingApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_list_billing_packages(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/billing/packages')
            ->assertOk()
            ->assertJsonCount(4, 'packages')
            ->assertJsonPath('packages.0.id', 'topup-50');
    }

    public function test_user_can_top_up_credits(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'credits_balance' => 0,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/billing/checkout', [
            'package_id' => 'topup-50',
        ])
            ->assertOk()
            ->assertJsonPath('user.credits_balance', 50)
            ->assertJsonPath('user.subscription_tier', 'free')
            ->assertJsonPath('package.id', 'topup-50');

        $this->assertDatabaseHas(CreditTransaction::class, [
            'user_id' => $user->id,
            'type' => 'topup',
            'amount' => 50,
        ]);
    }

    public function test_user_can_activate_six_month_premium_subscription(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'credits_balance' => 5,
            'subscription_expiry' => null,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/billing/checkout', [
            'package_id' => 'premium-6m',
        ])
            ->assertOk()
            ->assertJsonPath('user.credits_balance', 1005)
            ->assertJsonPath('user.subscription_tier', 'premium')
            ->assertJsonPath('package.id', 'premium-6m');

        $fresh = $user->fresh();

        $this->assertNotNull($fresh->subscription_expiry);
        $this->assertTrue($fresh->subscription_expiry->isFuture());
        $this->assertDatabaseHas(CreditTransaction::class, [
            'user_id' => $user->id,
            'type' => 'subscription',
            'amount' => 1000,
        ]);
    }

    public function test_unknown_package_returns_404(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/billing/checkout', [
            'package_id' => 'missing-package',
        ])->assertNotFound();
    }
}
