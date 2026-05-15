<?php

namespace App\Http\Controllers;

use App\Exceptions\InsufficientCreditsException;
use App\Exceptions\AiInvalidOutputException;
use App\Exceptions\AiProviderException;
use App\Http\Requests\GenerateExamRequest;
use App\Services\ExamGenerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ExamController extends Controller
{
    public function __construct(
        private readonly ExamGenerationService $examGenerationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $exams = $user->examSessions()
            ->withCount('questions')
            ->latest()
            ->paginate(10);

        return response()->json(array_merge($exams->toArray(), [
            'total_questions' => $user->examSessions()->withCount('questions')->get()->sum('questions_count'),
        ]));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $exam = $request->user()
            ->examSessions()
            ->with('questions')
            ->findOrFail($id);

        return response()->json([
            'exam' => $exam,
            'questions' => $exam->questions,
        ]);
    }

    public function generate(GenerateExamRequest $request): JsonResponse
    {
        try {
            $result = $this->examGenerationService->generate(
                $request->user(),
                $request->validated(),
            );
        } catch (InsufficientCreditsException $exception) {
            return response()->json([
                'error' => 'insufficient_credits',
                'message' => $exception->getMessage(),
                'credits_balance' => $exception->creditsBalance,
                'credits_required' => $exception->creditsRequired,
            ], 402);
        } catch (AiInvalidOutputException $exception) {
            return response()->json([
                'error' => 'ai_invalid_output',
                'message' => $exception->getMessage(),
            ], 422);
        } catch (AiProviderException $exception) {
            return response()->json([
                'error' => 'ai_provider_failed',
                'message' => $exception->getMessage(),
            ], 503);
        }

        return response()->json([
            'message' => "Berhasil membuat {$result['exam']->credits_consumed} soal!",
            'exam' => $result['exam'],
            'questions' => $result['questions'],
            'credits_remaining' => $result['credits_remaining'],
        ], 201);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $exam = $request->user()->examSessions()->findOrFail($id);
        $exam->delete();

        return response()->json(['message' => 'Sesi ujian berhasil dihapus.']);
    }

    public function questionIllustration(Request $request, int $examId, int $questionId): BinaryFileResponse|JsonResponse
    {
        $exam = $request->user()
            ->examSessions()
            ->findOrFail($examId);

        $question = $exam->questions()->whereKey($questionId)->firstOrFail();
        $image = $question->illustration_image;

        if (! is_string($image) || $image === '') {
            return response()->json(['message' => 'Gambar ilustrasi tidak tersedia.'], 404);
        }

        if (str_starts_with($image, 'data:image/')) {
            $base64 = (string) str($image)->after(',');
            $bytes = base64_decode($base64, true);

            if ($bytes === false) {
                return response()->json(['message' => 'Gambar ilustrasi tidak valid.'], 404);
            }

            return response($bytes, 200, [
                'Content-Type' => 'image/png',
                'Cache-Control' => 'private, max-age=3600',
            ]);
        }

        $path = public_path('generated/illustrations/' . basename($image));

        if (! is_file($path)) {
            return response()->json(['message' => 'File gambar ilustrasi tidak ditemukan.'], 404);
        }

        return response()->file($path, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    public function updateQuestion(Request $request, int $examId, int $questionId): JsonResponse
    {
        $validated = $request->validate([
            'question_type' => ['required', 'string', 'max:100'],
            'cognitive_level' => ['nullable', 'string', 'max:100'],
            'difficulty' => ['nullable', 'string', 'max:100'],
            'question_content' => ['required', 'string'],
            'options' => ['nullable', 'array'],
            'options.*' => ['nullable', 'string'],
            'correct_answer' => ['required', 'string'],
            'illustration_prompt' => ['nullable', 'string'],
            'illustration_image' => ['nullable', 'string'],
        ]);

        $exam = $request->user()
            ->examSessions()
            ->with('questions')
            ->findOrFail($examId);

        $question = $exam->questions()->whereKey($questionId)->firstOrFail();

        $question->update([
            'question_type' => $validated['question_type'],
            'cognitive_level' => $validated['cognitive_level'] ?? null,
            'difficulty' => $validated['difficulty'] ?? null,
            'question_content' => $validated['question_content'],
            'options' => $validated['options'] ?? null,
            'correct_answer' => $validated['correct_answer'],
            'illustration_prompt' => $validated['illustration_prompt'] ?? null,
            'illustration_image' => $validated['illustration_image'] ?? $question->illustration_image,
        ]);

        return response()->json([
            'message' => 'Soal berhasil diperbarui.',
            'question' => $question->fresh(),
        ]);
    }
}
