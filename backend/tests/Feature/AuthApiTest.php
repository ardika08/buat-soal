<?php

namespace Tests\Feature;

use App\Models\CreditTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.google.client_id' => 'google-client-id.test']);
    }

    public function test_register_gives_user_ten_free_credits_and_bonus_transaction(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Bu Sari',
            'email' => 'sari@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('user.email', 'sari@example.com')
            ->assertJsonPath('user.subscription_tier', 'free')
            ->assertJsonPath('user.credits_balance', 10)
            ->assertJsonStructure(['token']);

        $user = User::where('email', 'sari@example.com')->firstOrFail();

        $this->assertDatabaseHas(CreditTransaction::class, [
            'user_id' => $user->id,
            'type' => 'bonus',
            'amount' => 10,
        ]);
    }

    public function test_login_me_and_logout_work_with_sanctum_token(): void
    {
        User::factory()->create([
            'name' => 'Pak Budi',
            'email' => 'budi@example.com',
            'password' => 'password123',
        ]);

        $login = $this->postJson('/api/auth/login', [
            'email' => 'budi@example.com',
            'password' => 'password123',
        ]);

        $token = $login
            ->assertOk()
            ->assertJsonPath('user.email', 'budi@example.com')
            ->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.name', 'Pak Budi');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/auth/logout')
            ->assertOk()
            ->assertJsonPath('message', 'Logout berhasil.');
    }

    public function test_google_auth_registers_new_user_with_ten_credits(): void
    {
        Http::fake([
            'oauth2.googleapis.com/*' => Http::response([
                'aud' => 'google-client-id.test',
                'email' => 'google-user@example.com',
                'email_verified' => 'true',
                'name' => 'Google User',
            ]),
        ]);

        $response = $this->postJson('/api/auth/google', [
            'credential' => 'valid-google-id-token',
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('user.email', 'google-user@example.com')
            ->assertJsonPath('user.credits_balance', 10)
            ->assertJsonStructure(['token']);

        $user = User::where('email', 'google-user@example.com')->firstOrFail();

        $this->assertDatabaseHas(CreditTransaction::class, [
            'user_id' => $user->id,
            'type' => 'bonus',
            'amount' => 10,
        ]);
    }

    public function test_google_auth_logs_in_existing_user_without_duplicate_bonus(): void
    {
        $user = User::factory()->create([
            'email' => 'google-user@example.com',
            'credits_balance' => 7,
        ]);

        Http::fake([
            'oauth2.googleapis.com/*' => Http::response([
                'aud' => 'google-client-id.test',
                'email' => 'google-user@example.com',
                'email_verified' => true,
                'name' => 'Google User',
            ]),
        ]);

        $this->postJson('/api/auth/google', [
            'credential' => 'valid-google-id-token',
        ])
            ->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.credits_balance', 7)
            ->assertJsonStructure(['token']);

        $this->assertDatabaseCount(CreditTransaction::class, 0);
        $this->assertSame(7, $user->fresh()->credits_balance);
    }

    public function test_google_auth_rejects_wrong_audience(): void
    {
        Http::fake([
            'oauth2.googleapis.com/*' => Http::response([
                'aud' => 'other-client-id',
                'email' => 'google-user@example.com',
                'email_verified' => 'true',
                'name' => 'Google User',
            ]),
        ]);

        $this->postJson('/api/auth/google', [
            'credential' => 'wrong-app-token',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['credential']);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }
}
