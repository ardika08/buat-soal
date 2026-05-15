<?php

namespace Tests\Feature;

use App\Models\CreditTransaction;
use App\Models\ExamSession;
use App\Models\Question;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExamApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'ai.free_provider' => 'gemini',
            'ai.premium_provider' => 'openai',
            'ai.gemini.api_key' => 'test-gemini-key',
            'ai.gemini.model' => 'gemini-2.5-flash-lite',
            'ai.openai.api_key' => 'test-openai-key',
            'ai.openai.model' => 'gpt-5.4-mini',
        ]);
    }

    public function test_generate_creates_exam_questions_deducts_credits_and_logs_transaction(): void
    {
        $user = User::factory()->create(['credits_balance' => 20]);
        Sanctum::actingAs($user);

        $this->fakeGeminiSuccess(3);

        $response = $this->postJson('/api/exams/generate', $this->payload([
            'formats' => [
                ['id' => 'pg', 'label' => 'Pilihan Ganda', 'count' => 2],
                ['id' => 'uraian', 'label' => 'Uraian', 'count' => 1],
            ],
        ]));

        $response
            ->assertCreated()
            ->assertJsonPath('exam.credits_consumed', 3)
            ->assertJsonPath('credits_remaining', 17)
            ->assertJsonCount(3, 'questions');

        $examId = $response->json('exam.id');

        $this->assertDatabaseHas(ExamSession::class, [
            'id' => $examId,
            'user_id' => $user->id,
            'subject' => 'Matematika',
            'credits_consumed' => 3,
        ]);

        $this->assertDatabaseCount(Question::class, 3);
        $this->assertDatabaseHas(CreditTransaction::class, [
            'user_id' => $user->id,
            'type' => 'deduction',
            'amount' => -3,
        ]);

        $this->assertSame(17, $user->fresh()->credits_balance);

        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), 'generativelanguage.googleapis.com'));
    }

    public function test_generate_returns_402_and_does_not_persist_when_credits_are_insufficient(): void
    {
        $user = User::factory()->create(['credits_balance' => 2]);
        Sanctum::actingAs($user);

        $this->postJson('/api/exams/generate', $this->payload([
            'formats' => [
                ['id' => 'pg', 'label' => 'Pilihan Ganda', 'count' => 3],
            ],
        ]))
            ->assertStatus(402)
            ->assertJsonPath('error', 'insufficient_credits')
            ->assertJsonPath('credits_balance', 2)
            ->assertJsonPath('credits_required', 3);

        $this->assertDatabaseCount(ExamSession::class, 0);
        $this->assertDatabaseCount(Question::class, 0);
        $this->assertDatabaseCount(CreditTransaction::class, 0);
        $this->assertSame(2, $user->fresh()->credits_balance);
        Http::assertNothingSent();
    }

    public function test_free_user_can_spend_ten_trial_credits_with_gemini(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'free',
            'credits_balance' => 10,
        ]);
        Sanctum::actingAs($user);

        $this->fakeGeminiSuccess(10);

        $this->postJson('/api/exams/generate', $this->payload([
            'formats' => [
                ['id' => 'pg', 'label' => 'Pilihan Ganda', 'count' => 10],
            ],
        ]))
            ->assertCreated()
            ->assertJsonCount(10, 'questions')
            ->assertJsonPath('credits_remaining', 0);

        $this->assertSame(0, $user->fresh()->credits_balance);
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), 'generativelanguage.googleapis.com'));
    }

    public function test_premium_user_uses_openai_provider(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'premium',
            'credits_balance' => 20,
        ]);
        Sanctum::actingAs($user);

        $this->fakeOpenAiSuccess(2);

        $this->postJson('/api/exams/generate', $this->payload([
            'formats' => [
                ['id' => 'pg', 'label' => 'Pilihan Ganda', 'count' => 2],
            ],
        ]))
            ->assertCreated()
            ->assertJsonCount(2, 'questions')
            ->assertJsonPath('credits_remaining', 18);

        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://api.openai.com/v1/responses');
    }

    public function test_generate_stores_openai_illustration_image_when_prompt_exists(): void
    {
        $user = User::factory()->create(['credits_balance' => 20]);
        Sanctum::actingAs($user);

        $imageBase64 = base64_encode('fake-png-bytes');

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->geminiBody([
                'questions' => [
                    [
                        'question_type' => 'Pilihan Ganda',
                        'cognitive_level' => 'C1 - Mengingat',
                        'difficulty' => 'Mudah',
                        'question_content' => 'Gerak lokomotor adalah ...',
                        'options' => [
                            'A' => 'diam',
                            'B' => 'berjalan',
                            'C' => 'duduk',
                            'D' => 'tidur',
                        ],
                        'correct_answer' => 'B',
                        'illustration_prompt' => 'Anak berjalan di lapangan sekolah.',
                    ],
                ],
            ])),
            'api.openai.com/v1/images/generations' => Http::response([
                'data' => [
                    ['b64_json' => $imageBase64],
                ],
            ]),
        ]);

        $this->postJson('/api/exams/generate', $this->payload())
            ->assertCreated()
            ->assertJsonPath('questions.0.illustration_image', fn (?string $value): bool => is_string($value) && str_contains($value, '/generated/illustrations/'));

        $question = Question::query()->where('illustration_prompt', 'Anak berjalan di lapangan sekolah.')->firstOrFail();
        $this->assertStringContainsString('/generated/illustrations/', (string) $question->illustration_image);
        $this->assertLessThan(255, strlen((string) $question->illustration_image));

        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://api.openai.com/v1/images/generations');
    }

    public function test_illustration_generation_is_limited_to_multiple_choice_and_max_count(): void
    {
        config(['ai.illustrations.max_per_exam' => 1]);

        $user = User::factory()->create(['credits_balance' => 20]);
        Sanctum::actingAs($user);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->geminiBody([
                'questions' => [
                    $this->questionWithPrompt('Pilihan Ganda', 'Prompt PG pertama'),
                    $this->questionWithPrompt('Pilihan Ganda', 'Prompt PG kedua'),
                    $this->questionWithPrompt('Uraian', 'Prompt uraian'),
                ],
            ])),
            'api.openai.com/v1/images/generations' => Http::response([
                'data' => [
                    ['b64_json' => base64_encode('only-one-image')],
                ],
            ]),
        ]);

        $response = $this->postJson('/api/exams/generate', $this->payload([
            'formats' => [
                ['id' => 'pg', 'label' => 'Pilihan Ganda', 'count' => 2],
                ['id' => 'uraian', 'label' => 'Uraian', 'count' => 1],
            ],
        ]))
            ->assertCreated();

        $this->assertNotNull($response->json('questions.0.illustration_image'));
        $this->assertNull($response->json('questions.1.illustration_prompt'));
        $this->assertNull($response->json('questions.1.illustration_image'));
        $this->assertNull($response->json('questions.2.illustration_prompt'));
        $this->assertNull($response->json('questions.2.illustration_image'));

        Http::assertSentCount(2);
    }

    public function test_multiple_choice_answers_are_randomized_even_when_ai_returns_all_a(): void
    {
        $user = User::factory()->create(['credits_balance' => 20]);
        Sanctum::actingAs($user);

        $this->fakeGeminiSuccess(12);

        $response = $this->postJson('/api/exams/generate', $this->payload([
            'formats' => [
                ['id' => 'pg', 'label' => 'Pilihan Ganda', 'count' => 12],
            ],
        ]))->assertCreated();

        $answers = collect($response->json('questions'))->pluck('correct_answer');

        $this->assertContainsOnly('string', $answers->all());
        $this->assertTrue($answers->every(fn (string $answer): bool => in_array($answer, ['A', 'B', 'C', 'D'], true)));
        $this->assertTrue($answers->unique()->count() > 1);
    }

    public function test_rubric_prefix_is_removed_from_essay_answer(): void
    {
        $user = User::factory()->create(['credits_balance' => 10]);
        Sanctum::actingAs($user);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->geminiBody([
                'questions' => [
                    [
                        'question_type' => 'Uraian',
                        'cognitive_level' => 'C2 - Memahami',
                        'difficulty' => 'Sedang',
                        'question_content' => 'Jelaskan manfaat pemanasan sebelum olahraga.',
                        'options' => null,
                        'correct_answer' => 'Rubrik jawaban: pemanasan membantu tubuh siap bergerak dan mengurangi risiko cedera.',
                        'illustration_prompt' => null,
                    ],
                ],
            ])),
        ]);

        $this->postJson('/api/exams/generate', $this->payload([
            'formats' => [
                ['id' => 'uraian', 'label' => 'Uraian', 'count' => 1],
            ],
        ]))
            ->assertCreated()
            ->assertJsonPath('questions.0.correct_answer', 'pemanasan membantu tubuh siap bergerak dan mengurangi risiko cedera.');
    }

    public function test_user_can_download_own_question_illustration_for_export(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        File::ensureDirectoryExists(public_path('generated/illustrations'));
        File::put(public_path('generated/illustrations/test-export.png'), 'fake-image-bytes');

        $exam = ExamSession::create([
            'user_id' => $user->id,
            'curriculum' => 'Merdeka Deep Learning',
            'exam_type' => 'SAS',
            'class_phase' => 'Fase A - Kelas 1',
            'subject' => 'PJOK',
            'semester' => 'Ganjil',
            'time_allocation' => 60,
            'reference_type' => 'AI',
            'difficulty' => 'Mudah',
            'cognitive_levels' => ['C1 - Mengingat'],
            'topics' => [['topik' => 'Gerak Dasar', 'tujuan' => null]],
            'credits_consumed' => 1,
        ]);

        $question = $exam->questions()->create([
            'order_number' => 1,
            'question_type' => 'Pilihan Ganda',
            'cognitive_level' => 'C1 - Mengingat',
            'difficulty' => 'Mudah',
            'question_content' => 'Soal bergambar?',
            'options' => ['A' => 'Ya', 'B' => 'Tidak'],
            'correct_answer' => 'A',
            'illustration_image' => 'http://localhost/generated/illustrations/test-export.png',
        ]);

        $this->get("/api/exams/{$exam->id}/questions/{$question->id}/illustration")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png');
    }

    public function test_user_cannot_download_another_users_question_illustration(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        Sanctum::actingAs($otherUser);

        $exam = ExamSession::create([
            'user_id' => $owner->id,
            'curriculum' => 'Merdeka Deep Learning',
            'exam_type' => 'SAS',
            'class_phase' => 'Fase A - Kelas 1',
            'subject' => 'PJOK',
            'semester' => 'Ganjil',
            'time_allocation' => 60,
            'reference_type' => 'AI',
            'difficulty' => 'Mudah',
            'cognitive_levels' => ['C1 - Mengingat'],
            'topics' => [['topik' => 'Gerak Dasar', 'tujuan' => null]],
            'credits_consumed' => 1,
        ]);

        $question = $exam->questions()->create([
            'order_number' => 1,
            'question_type' => 'Pilihan Ganda',
            'cognitive_level' => 'C1 - Mengingat',
            'difficulty' => 'Mudah',
            'question_content' => 'Soal owner?',
            'options' => ['A' => 'Ya', 'B' => 'Tidak'],
            'correct_answer' => 'A',
            'illustration_image' => 'http://localhost/generated/illustrations/test-export.png',
        ]);

        $this->get("/api/exams/{$exam->id}/questions/{$question->id}/illustration")
            ->assertNotFound();
    }

    public function test_ai_provider_failure_does_not_persist_or_deduct_credits(): void
    {
        $user = User::factory()->create(['credits_balance' => 10]);
        Sanctum::actingAs($user);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response(['error' => ['message' => 'rate limited']], 429),
        ]);

        $this->postJson('/api/exams/generate', $this->payload([
            'formats' => [
                ['id' => 'pg', 'label' => 'Pilihan Ganda', 'count' => 2],
            ],
        ]))
            ->assertStatus(503)
            ->assertJsonPath('error', 'ai_provider_failed');

        $this->assertDatabaseCount(ExamSession::class, 0);
        $this->assertDatabaseCount(Question::class, 0);
        $this->assertDatabaseCount(CreditTransaction::class, 0);
        $this->assertSame(10, $user->fresh()->credits_balance);
    }

    public function test_invalid_ai_output_retries_once_then_fails_without_deducting(): void
    {
        $user = User::factory()->create(['credits_balance' => 10]);
        Sanctum::actingAs($user);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::sequence()
                ->push($this->geminiBody(['questions' => []]))
                ->push($this->geminiBody(['questions' => []])),
        ]);

        $this->postJson('/api/exams/generate', $this->payload([
            'formats' => [
                ['id' => 'pg', 'label' => 'Pilihan Ganda', 'count' => 2],
            ],
        ]))
            ->assertStatus(422)
            ->assertJsonPath('error', 'ai_invalid_output');

        Http::assertSentCount(2);
        $this->assertDatabaseCount(ExamSession::class, 0);
        $this->assertDatabaseCount(Question::class, 0);
        $this->assertSame(10, $user->fresh()->credits_balance);
    }

    public function test_user_cannot_show_or_delete_another_users_exam(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();

        $exam = ExamSession::create([
            'user_id' => $owner->id,
            'curriculum' => 'Kurikulum 2013',
            'exam_type' => 'Ulangan Harian',
            'class_phase' => 'Fase C - Kelas 5',
            'subject' => 'IPAS',
            'semester' => 'Ganjil',
            'time_allocation' => 90,
            'reference_type' => 'AI',
            'difficulty' => 'Campuran Berimbang',
            'cognitive_levels' => ['C1 - Mengingat'],
            'topics' => [['topik' => 'Ekosistem', 'tujuan' => null]],
            'credits_consumed' => 1,
        ]);

        Sanctum::actingAs($otherUser);

        $this->getJson("/api/exams/{$exam->id}")->assertNotFound();
        $this->deleteJson("/api/exams/{$exam->id}")->assertNotFound();

        $this->assertDatabaseHas(ExamSession::class, ['id' => $exam->id]);
    }

    public function test_delete_exam_removes_questions_by_cascade(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $exam = ExamSession::create([
            'user_id' => $user->id,
            'curriculum' => 'Merdeka Deep Learning',
            'exam_type' => 'SAS',
            'class_phase' => 'Fase C - Kelas 5',
            'subject' => 'Matematika',
            'semester' => 'Ganjil',
            'time_allocation' => 90,
            'reference_type' => 'AI',
            'difficulty' => 'Campuran Berimbang',
            'cognitive_levels' => ['C1 - Mengingat'],
            'topics' => [['topik' => 'Pecahan', 'tujuan' => null]],
            'credits_consumed' => 1,
        ]);

        $exam->questions()->create([
            'order_number' => 1,
            'question_type' => 'Pilihan Ganda',
            'cognitive_level' => 'C1 - Mengingat',
            'difficulty' => 'Mudah',
            'question_content' => 'Contoh soal?',
            'options' => ['A' => 'Benar', 'B' => 'Salah'],
            'correct_answer' => 'A',
        ]);

        $this->deleteJson("/api/exams/{$exam->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Sesi ujian berhasil dihapus.');

        $this->assertDatabaseCount(ExamSession::class, 0);
        $this->assertDatabaseCount(Question::class, 0);
    }

    public function test_user_can_update_own_question_manually(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $exam = ExamSession::create([
            'user_id' => $user->id,
            'curriculum' => 'Merdeka Deep Learning',
            'exam_type' => 'SAS',
            'class_phase' => 'Fase A - Kelas 1',
            'subject' => 'PJOK',
            'semester' => 'Ganjil',
            'time_allocation' => 60,
            'reference_type' => 'AI',
            'difficulty' => 'Mudah',
            'cognitive_levels' => ['C1 - Mengingat'],
            'topics' => [['topik' => 'Gerak Dasar', 'tujuan' => null]],
            'credits_consumed' => 1,
        ]);

        $question = $exam->questions()->create([
            'order_number' => 1,
            'question_type' => 'Pilihan Ganda',
            'cognitive_level' => 'C1 - Mengingat',
            'difficulty' => 'Mudah',
            'question_content' => 'Pertanyaan lama?',
            'options' => ['A' => 'Lama', 'B' => 'Baru'],
            'correct_answer' => 'A',
        ]);

        $this->putJson("/api/exams/{$exam->id}/questions/{$question->id}", [
            'question_type' => 'Pilihan Ganda',
            'cognitive_level' => 'C2 - Memahami',
            'difficulty' => 'Sedang',
            'question_content' => 'Pertanyaan baru?',
            'options' => ['A' => 'Salah', 'B' => 'Benar'],
            'correct_answer' => 'B',
            'illustration_prompt' => null,
        ])
            ->assertOk()
            ->assertJsonPath('question.question_content', 'Pertanyaan baru?')
            ->assertJsonPath('question.correct_answer', 'B');

        $this->assertDatabaseHas(Question::class, [
            'id' => $question->id,
            'question_content' => 'Pertanyaan baru?',
            'correct_answer' => 'B',
        ]);
    }

    public function test_user_cannot_update_another_users_question(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        Sanctum::actingAs($otherUser);

        $exam = ExamSession::create([
            'user_id' => $owner->id,
            'curriculum' => 'Merdeka Deep Learning',
            'exam_type' => 'SAS',
            'class_phase' => 'Fase A - Kelas 1',
            'subject' => 'PJOK',
            'semester' => 'Ganjil',
            'time_allocation' => 60,
            'reference_type' => 'AI',
            'difficulty' => 'Mudah',
            'cognitive_levels' => ['C1 - Mengingat'],
            'topics' => [['topik' => 'Gerak Dasar', 'tujuan' => null]],
            'credits_consumed' => 1,
        ]);

        $question = $exam->questions()->create([
            'order_number' => 1,
            'question_type' => 'Pilihan Ganda',
            'cognitive_level' => 'C1 - Mengingat',
            'difficulty' => 'Mudah',
            'question_content' => 'Pertanyaan milik owner?',
            'options' => ['A' => 'Ya', 'B' => 'Tidak'],
            'correct_answer' => 'A',
        ]);

        $this->putJson("/api/exams/{$exam->id}/questions/{$question->id}", [
            'question_type' => 'Pilihan Ganda',
            'question_content' => 'Diubah?',
            'correct_answer' => 'B',
        ])->assertNotFound();
    }

    public function test_generate_rejects_more_than_one_hundred_questions(): void
    {
        Sanctum::actingAs(User::factory()->create(['credits_balance' => 200]));

        $this->postJson('/api/exams/generate', $this->payload([
            'formats' => [
                ['id' => 'pg', 'label' => 'Pilihan Ganda', 'count' => 101],
            ],
        ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['formats']);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_replace_recursive([
            'curriculum' => 'Merdeka Deep Learning',
            'exam_type' => 'Sumatif Akhir Semester (SAS)',
            'class_phase' => 'Fase C - Kelas 5',
            'subject' => 'Matematika',
            'semester' => 'Ganjil',
            'time_allocation' => 90,
            'reference_type' => 'AI',
            'difficulty' => 'Campuran Berimbang',
            'cognitive_levels' => ['C1 - Mengingat', 'C2 - Memahami'],
            'pg_options' => '4 Opsi (A-D)',
            'include_illustration' => true,
            'topics' => [
                ['topik' => 'Pecahan Senilai', 'tujuan' => 'Siswa memahami pecahan senilai.'],
            ],
            'formats' => [
                ['id' => 'pg', 'label' => 'Pilihan Ganda', 'count' => 1],
            ],
        ], $overrides);
    }

    private function fakeGeminiSuccess(int $count): void
    {
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->geminiBody([
                'questions' => $this->questions($count),
            ])),
        ]);
    }

    private function fakeOpenAiSuccess(int $count): void
    {
        Http::fake([
            'api.openai.com/*' => Http::response([
                'output' => [
                    [
                        'content' => [
                            [
                                'text' => json_encode([
                                    'questions' => $this->questions($count),
                                ]),
                            ],
                        ],
                    ],
                ],
            ]),
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function geminiBody(array $payload): array
    {
        return [
            'candidates' => [
                [
                    'content' => [
                        'parts' => [
                            ['text' => json_encode($payload)],
                        ],
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function questions(int $count): array
    {
        $questions = [];

        for ($i = 1; $i <= $count; $i++) {
            $questions[] = [
                'question_type' => 'Pilihan Ganda',
                'cognitive_level' => 'C1 - Mengingat',
                'difficulty' => 'Mudah',
                'question_content' => "Soal uji {$i}?",
                'options' => [
                    'A' => 'Jawaban benar',
                    'B' => 'Jawaban salah',
                    'C' => 'Pengecoh',
                    'D' => 'Pengecoh lain',
                ],
                'correct_answer' => 'A',
                'illustration_prompt' => null,
            ];
        }

        return $questions;
    }

    /**
     * @return array<string, mixed>
     */
    private function questionWithPrompt(string $type, string $prompt): array
    {
        return [
            'question_type' => $type,
            'cognitive_level' => 'C1 - Mengingat',
            'difficulty' => 'Mudah',
            'question_content' => "{$type} uji?",
            'options' => $type === 'Uraian' ? null : [
                'A' => 'Jawaban benar',
                'B' => 'Jawaban salah',
                'C' => 'Pengecoh',
                'D' => 'Pengecoh lain',
            ],
            'correct_answer' => $type === 'Uraian' ? 'Rubrik jawaban.' : 'A',
            'illustration_prompt' => $prompt,
        ];
    }
}
