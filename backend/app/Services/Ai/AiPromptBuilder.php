<?php

namespace App\Services\Ai;

class AiPromptBuilder
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function build(array $data, int $totalQuestions): string
    {
        $distribution = $data['difficulty_distribution'] ?? ['lots' => 50, 'mots' => 30, 'hots' => 20];
        $targets = $this->difficultyTargets($totalQuestions, $distribution);

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
                'difficulty_distribution' => $distribution,
                'cognitive_level_mapping' => [
                    'lots' => ['C1 - Mengingat', 'C2 - Memahami'],
                    'mots' => ['C3 - Mengaplikasikan', 'C4 - Menganalisis'],
                    'hots' => ['C5 - Mengevaluasi', 'C6 - Mencipta'],
                ],
                'target_question_distribution' => $targets,
                'pg_options' => $data['pg_options'] ?? null,
                'include_illustration' => $data['include_illustration'] ?? false,
            ],
            'topics' => $data['topics'],
            'formats' => $data['formats'],
            'rules' => [
                'Jumlah item questions harus sama persis dengan total_questions.',
                'Ikuti urutan format soal sesuai urutan formats pada input. Kelompokkan soal berdasarkan format agar naskah mudah diekspor per bagian.',
                'Jika reference_text tersedia, gunakan sebagai sumber materi utama.',
                'Jika file PDF tersedia di input provider, gunakan isi PDF sebagai sumber materi utama.',
                'Sebarkan tingkat soal mengikuti bobot: LOTS '.$distribution['lots'].'%, MOTS '.$distribution['mots'].'%, HOTS '.$distribution['hots'].'%. Target batch ini adalah LOTS '.$targets['lots'].' soal, MOTS '.$targets['mots'].' soal, HOTS '.$targets['hots'].' soal.',
                'LOTS harus memakai C1-C2, MOTS harus memakai C3-C4, HOTS harus memakai C5-C6.',
                'Sebarkan level kognitif dan tingkat kesulitan sesuai input dan tetap konsisten dengan fase/kelas siswa.',
                'Untuk fase rendah, gunakan bahasa sederhana, konteks dekat dengan kehidupan anak, dan tingkat tantangan yang masih dapat dipahami siswa.',
                'Untuk PG dan PGK, isi options sebagai objek A/B/C/D/E sesuai opsi yang diminta.',
                'Untuk soal Pilihan Ganda, sebar kunci jawaban secara acak dan proporsional di A/B/C/D/E. Jangan membuat semua jawaban benar di A.',
                'Untuk Menjodohkan, Benar/Salah, Isian, dan Uraian, options boleh null kecuali jika format butuh opsi eksplisit.',
                'Untuk soal Isian Singkat, hindari kalimat rumpang yang ambigu, terlalu abstrak, atau terlalu menjebak. Jawaban harus singkat, terukur, dan sesuai fase siswa.',
                'Untuk soal Isian Singkat dengan target HOTS, batasi menjadi penalaran ringan yang masih bisa dipahami anak, bukan HOTS ekstrem.',
                'Untuk soal Uraian, sesuaikan kompleksitas jawaban dengan kemampuan siswa pada fase terkait dan hindari tuntutan penjelasan yang terlalu berat untuk usia mereka.',
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
     * @param  array<string, int|string>  $distribution
     * @return array{lots:int,mots:int,hots:int}
     */
    private function difficultyTargets(int $totalQuestions, array $distribution): array
    {
        $items = [
            'lots' => (int) floor($totalQuestions * (((int) ($distribution['lots'] ?? 0)) / 100)),
            'mots' => (int) floor($totalQuestions * (((int) ($distribution['mots'] ?? 0)) / 100)),
            'hots' => (int) floor($totalQuestions * (((int) ($distribution['hots'] ?? 0)) / 100)),
        ];

        $assigned = array_sum($items);
        $remainders = [
            'lots' => $totalQuestions * (((int) ($distribution['lots'] ?? 0)) / 100) - $items['lots'],
            'mots' => $totalQuestions * (((int) ($distribution['mots'] ?? 0)) / 100) - $items['mots'],
            'hots' => $totalQuestions * (((int) ($distribution['hots'] ?? 0)) / 100) - $items['hots'],
        ];

        arsort($remainders);
        foreach (array_keys($remainders) as $key) {
            if ($assigned >= $totalQuestions) {
                break;
            }
            $items[$key]++;
            $assigned++;
        }

        return $items;
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
