<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\ExamController;
use Illuminate\Support\Facades\Route;

// ── Public Auth Routes ────────────────────────────────────────────────────────
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/google', [AuthController::class, 'google']);
});

// ── Protected Routes (Sanctum token required) ─────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    // Auth
    Route::prefix('auth')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
    });

    // Exams
    Route::prefix('exams')->group(function () {
        Route::get('/', [ExamController::class, 'index']);
        Route::post('/generate', [ExamController::class, 'generate']);
        Route::get('/{id}', [ExamController::class, 'show']);
        Route::get('/{examId}/questions/{questionId}/illustration', [ExamController::class, 'questionIllustration']);
        Route::put('/{examId}/questions/{questionId}', [ExamController::class, 'updateQuestion']);
        Route::delete('/{id}', [ExamController::class, 'destroy']);
    });

    Route::prefix('billing')->group(function () {
        Route::get('/packages', [BillingController::class, 'packages']);
        Route::post('/checkout', [BillingController::class, 'checkout']);
    });
});
