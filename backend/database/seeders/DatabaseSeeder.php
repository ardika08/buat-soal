<?php

namespace Database\Seeders;

use App\Models\CreditTransaction;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Demo user for development/testing
        $user = User::firstOrCreate(
            ['email' => 'guru@demo.com'],
            [
                'name' => 'Guru Demo',
                'password' => Hash::make('password123'),
                'subscription_tier' => 'free',
                'credits_balance' => 100, // extra credits for testing
            ]
        );

        // Only seed transaction if user was just created
        if ($user->wasRecentlyCreated) {
            CreditTransaction::create([
                'user_id' => $user->id,
                'type' => 'bonus',
                'amount' => 100,
                'description' => 'Kredit demo awal untuk pengembangan.',
            ]);
        }
    }
}
