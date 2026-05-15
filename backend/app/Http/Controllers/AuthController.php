<?php

namespace App\Http\Controllers;

use App\Models\CreditTransaction;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Register a new user.
     * New users get 10 free credits automatically.
     */
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
            'subscription_tier' => 'free',
            'credits_balance' => 10,
        ]);

        // Log the bonus credit transaction
        CreditTransaction::create([
            'user_id' => $user->id,
            'type' => 'bonus',
            'amount' => 10,
            'description' => 'Kredit gratis selamat datang untuk pengguna baru.',
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'Registrasi berhasil!',
            'user' => $this->formatUser($user),
            'token' => $token,
        ], 201);
    }

    /**
     * Login an existing user.
     */
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Email atau password tidak valid.'],
            ]);
        }

        // Revoke old tokens and issue a new one
        $user->tokens()->delete();
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'Login berhasil!',
            'user' => $this->formatUser($user),
            'token' => $token,
        ]);
    }

    /**
     * Login or register with Google Identity Services ID token.
     */
    public function google(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'credential' => 'required|string',
        ]);

        $clientId = config('services.google.client_id');

        if (! $clientId) {
            return response()->json([
                'message' => 'GOOGLE_CLIENT_ID belum dikonfigurasi di backend.',
            ], 503);
        }

        $google = Http::timeout(15)->get('https://oauth2.googleapis.com/tokeninfo', [
            'id_token' => $validated['credential'],
        ]);

        if ($google->failed()) {
            throw ValidationException::withMessages([
                'credential' => ['Token Google tidak valid atau sudah kedaluwarsa.'],
            ]);
        }

        $profile = $google->json();

        $emailVerified = ($profile['email_verified'] ?? null) === true || ($profile['email_verified'] ?? null) === 'true';

        if (($profile['aud'] ?? null) !== $clientId || ! $emailVerified) {
            throw ValidationException::withMessages([
                'credential' => ['Token Google tidak sesuai aplikasi ini.'],
            ]);
        }

        $user = User::where('email', $profile['email'])->first();
        $isNewUser = false;

        if (! $user) {
            $isNewUser = true;
            $user = User::create([
                'name' => $profile['name'] ?? $profile['email'],
                'email' => $profile['email'],
                'email_verified_at' => now(),
                'password' => Str::password(32),
                'subscription_tier' => 'free',
                'credits_balance' => 10,
            ]);

            CreditTransaction::create([
                'user_id' => $user->id,
                'type' => 'bonus',
                'amount' => 10,
                'description' => 'Kredit gratis selamat datang untuk pengguna Google baru.',
            ]);
        }

        $user->tokens()->delete();
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => $isNewUser ? 'Registrasi Google berhasil!' : 'Login Google berhasil!',
            'user' => $this->formatUser($user),
            'token' => $token,
        ], $isNewUser ? 201 : 200);
    }

    /**
     * Logout — revoke the current token.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logout berhasil.']);
    }

    /**
     * Get the authenticated user's profile.
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $this->formatUser($request->user()),
        ]);
    }

    // ─── Helpers ────────────────────────────────────────────────────

    private function formatUser(User $user): array
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
