<?php

namespace App\Services\Ai;

class AiPromptBuilder
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function build(array $data, int $totalQuestions): string
    {
        $payload = [
            'instruction' => 'Buat soal ujian berbahasa Indonesia formal untuk guru sekolah. Kembalikan hanya JSON valid sesuai schema.',
            'total_questions' => $totalQuestions,
            'exam' => [
                'curriculum' => $data['curriculum'],
                'exam_type' => $data['exam_type'],
                'class_phase' => $data['class_phase'],
                'subject' => $data['subject'],
                'semester' => $data['semester'],
                'time_allocation_minutes' => $data['time_allocation'],
                'reference_type' => $data['reference_type'],
                'reference_text' => $this->referenceText($data),
                'difficulty' => $data['difficulty'],
                'cognitive_levels' => $data['cognitive_levels'],
                'pg_options' => $data['pg_options'] ?? null,
                'include_illustration' => $data['include_illustration'] ?? false,
            ],
            'topics' => $data['topics'],
            'formats' => $data['formats'],
            'rules' => [
                'Jumlah item questions harus sama persis dengan total_questions.',
                'Jika reference_text tersedia, gunakan sebagai sumber materi utama.',
                'Jika file PDF tersedia di input provider, gunakan isi PDF sebagai sumber materi utama.',
                'Sebarkan level kognitif dan tingkat kesulitan sesuai input.',
                'Untuk PG dan PGK, isi options sebagai objek A/B/C/D/E sesuai opsi yang diminta.',
                'Untuk soal Pilihan Ganda, sebar kunci jawaban secara acak dan proporsional di A/B/C/D/E. Jangan membuat semua jawaban benar di A.',
                'Untuk Menjodohkan, Benar/Salah, Isian, dan Uraian, options boleh null kecuali jika format butuh opsi eksplisit.',
                'correct_answer harus berisi jawaban benar langsung. Untuk Uraian jangan menulis awalan "Rubrik jawaban:", "Rubrik:", atau label sejenis.',
                'illustration_prompt hanya diisi bila include_illustration true, question_type adalah Pilihan Ganda, dan soal benar-benar membutuhkan gambar untuk memahami konteks.',
                'Jangan memberi ilustrasi untuk semua soal. Jika include_illustration true, pilih maksimal ' . config('ai.illustrations.max_per_exam', 5) . ' soal Pilihan Ganda yang paling membutuhkan gambar; untuk soal lainnya isi illustration_prompt null.',
                'Prompt ilustrasi harus meminta gambar hitam putih sederhana, jelas, tanpa teks, tanpa watermark, dan mudah dipahami guru/siswa.',
            ],
            'json_shape' => [
                'questions' => [
                    [
                        'question_type' => 'Pilihan Ganda',
                        'cognitive_level' => 'C1 - Mengingat',
                        'difficulty' => 'Mudah',
                        'question_content' => '...',
                        'options' => ['A' => '...', 'B' => '...', 'C' => '...', 'D' => '...'],
                        'correct_answer' => 'A',
                        'illustration_prompt' => null,
                    ],
                ],
            ],
        ];

        return json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function referenceText(array $data): ?string
    {
        $text = $data['reference_text'] ?? null;

        if (! is_string($text)) {
            return null;
        }

        $text = trim($text);

        return $text === '' ? null : mb_substr($text, 0, 12000);
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(): array
    {
        return [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'questions' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'additionalProperties' => false,
                        'properties' => [
                            'question_type' => ['type' => 'string'],
                            'cognitive_level' => ['type' => 'string'],
                            'difficulty' => ['type' => 'string'],
                            'question_content' => ['type' => 'string'],
                            'options' => [
                                'type' => ['object', 'null'],
                                'additionalProperties' => ['type' => 'string'],
                            ],
                            'correct_answer' => ['type' => 'string'],
                            'illustration_prompt' => [
                                'type' => ['string', 'null'],
                            ],
                        ],
                        'required' => [
                            'question_type',
                            'cognitive_level',
                            'difficulty',
                            'question_content',
                            'options',
                            'correct_answer',
                            'illustration_prompt',
                        ],
                    ],
                ],
            ],
            'required' => ['questions'],
        ];
    }
}
