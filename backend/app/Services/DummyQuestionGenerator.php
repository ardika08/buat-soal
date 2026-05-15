<?php

namespace App\Services;

class DummyQuestionGenerator
{
    /**
     * @param  array<string, mixed>  $data
     * @return array<int, array<string, mixed>>
     */
    public function generate(array $data): array
    {
        $subject = $data['subject'];
        $classPhase = $data['class_phase'];
        $topics = $data['topics'];
        $levels = $data['cognitive_levels'];
        $difficulty = $data['difficulty'];
        $pgOptions = $data['pg_options'] ?? '4 Opsi (A-D)';
        $withIllustration = $data['include_illustration'] ?? false;
        $topicName = $topics[0]['topik'] ?? $subject;

        $optionCount = $this->optionCount($pgOptions);
        $optionLetters = array_slice(['A', 'B', 'C', 'D', 'E'], 0, $optionCount);
        $difficultyPool = $this->difficultyPool($difficulty);

        $questions = [];
        $order = 0;
        $levelIndex = 0;
        $diffIndex = 0;

        foreach ($data['formats'] as $format) {
            $type = $format['id'];
            $label = $format['label'];
            $count = $format['count'];

            for ($i = 1; $i <= $count; $i++) {
                $level = $levels[$levelIndex % count($levels)];
                $diff = $difficultyPool[$diffIndex % count($difficultyPool)];
                $levelIndex++;
                $diffIndex++;
                $order++;

                $question = match ($type) {
                    'pg' => $this->makeMultipleChoice($order, $i, $subject, $topicName, $classPhase, $level, $diff, $optionLetters, $withIllustration),
                    'pgk' => $this->makeComplexChoice($order, $subject, $topicName, $level, $diff),
                    'jodoh' => $this->makeMatching($order, $subject, $topicName, $level, $diff),
                    'bs' => $this->makeTrueFalse($order, $subject, $topicName, $level, $diff),
                    'isian' => $this->makeFillBlank($order, $subject, $topicName, $level, $diff),
                    'uraian' => $this->makeEssay($order, $subject, $topicName, $classPhase, $level, $diff),
                };

                $question['question_type'] = $label;
                $questions[] = $question;
            }
        }

        return $questions;
    }

    private function optionCount(?string $pgOptions): int
    {
        return match (true) {
            str_contains((string) $pgOptions, 'A-C') || str_contains((string) $pgOptions, 'A–C') || str_contains((string) $pgOptions, 'Aâ€“C') => 3,
            str_contains((string) $pgOptions, 'A-E') || str_contains((string) $pgOptions, 'A–E') || str_contains((string) $pgOptions, 'Aâ€“E') => 5,
            default => 4,
        };
    }

    /**
     * @return array<int, string>
     */
    private function difficultyPool(string $difficulty): array
    {
        return match ($difficulty) {
            'Mudah (LOTS)' => ['Mudah'],
            'Sedang (MOTS)' => ['Sedang'],
            'Sulit (HOTS)' => ['Sulit'],
            default => ['Mudah', 'Sedang', 'Sulit'],
        };
    }

    /**
     * @param  array<int, string>  $optionLetters
     * @return array<string, mixed>
     */
    private function makeMultipleChoice(int $order, int $i, string $subject, string $topic, string $phase, string $level, string $diff, array $optionLetters, bool $withIllustration): array
    {
        $options = [
            'A' => "Jawaban benar untuk soal {$i} {$subject}",
            'B' => 'Pilihan yang hampir benar tetapi tidak tepat',
            'C' => 'Pilihan yang salah konsep',
            'D' => 'Pilihan yang tidak relevan',
            'E' => 'Pilihan pengecoh tambahan',
        ];

        return [
            'cognitive_level' => $level,
            'difficulty' => $diff,
            'question_content' => "Soal nomor {$order} tentang {$topic}: Berdasarkan konsep dalam mata pelajaran {$subject}, manakah pernyataan berikut yang paling tepat mengenai topik yang dipelajari pada {$phase}?",
            'options' => array_intersect_key($options, array_flip($optionLetters)),
            'correct_answer' => 'A',
            'illustration_prompt' => $withIllustration ? "Gambar ilustrasi yang relevan dengan topik {$topic} untuk siswa {$phase}" : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function makeComplexChoice(int $order, string $subject, string $topic, string $level, string $diff): array
    {
        return [
            'cognitive_level' => $level,
            'difficulty' => $diff,
            'question_content' => "Soal nomor {$order} (PG Kompleks) - {$topic}: Perhatikan pernyataan-pernyataan berikut ini terkait {$subject}. Pilihlah SEMUA jawaban yang benar!\n(1) Pernyataan pertama yang benar\n(2) Pernyataan kedua yang salah\n(3) Pernyataan ketiga yang benar\n(4) Pernyataan keempat yang salah",
            'options' => [
                'A' => '(1) dan (3)',
                'B' => '(1) dan (2)',
                'C' => '(2) dan (4)',
                'D' => '(3) dan (4)',
            ],
            'correct_answer' => 'A',
            'illustration_prompt' => null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function makeMatching(int $order, string $subject, string $topic, string $level, string $diff): array
    {
        return [
            'cognitive_level' => $level,
            'difficulty' => $diff,
            'question_content' => "Soal nomor {$order} (Menjodohkan) - {$topic}: Jodohkan istilah pada kolom A dengan definisi yang tepat pada kolom B!\n\nKolom A:\n1. Istilah pertama {$subject}\n2. Istilah kedua\n3. Istilah ketiga\n\nKolom B:\na. Definisi untuk istilah ketiga\nb. Definisi untuk istilah pertama\nc. Definisi untuk istilah kedua",
            'options' => null,
            'correct_answer' => '1-b, 2-c, 3-a',
            'illustration_prompt' => null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function makeTrueFalse(int $order, string $subject, string $topic, string $level, string $diff): array
    {
        return [
            'cognitive_level' => $level,
            'difficulty' => $diff,
            'question_content' => "Soal nomor {$order} (Benar/Salah) - {$topic}: Tentukan apakah pernyataan berikut BENAR atau SALAH!\n\"Konsep utama dalam {$subject} menyatakan bahwa {$topic} berhubungan langsung dengan kehidupan sehari-hari siswa.\"",
            'options' => ['A' => 'Benar', 'B' => 'Salah'],
            'correct_answer' => 'A',
            'illustration_prompt' => null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function makeFillBlank(int $order, string $subject, string $topic, string $level, string $diff): array
    {
        return [
            'cognitive_level' => $level,
            'difficulty' => $diff,
            'question_content' => "Soal nomor {$order} (Isian) - {$topic}: Lengkapilah kalimat rumpang berikut ini!\n\"Dalam mata pelajaran {$subject}, {$topic} adalah _______ yang sangat penting untuk dipahami oleh setiap siswa.\"",
            'options' => null,
            'correct_answer' => 'konsep dasar / materi pokok',
            'illustration_prompt' => null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function makeEssay(int $order, string $subject, string $topic, string $phase, string $level, string $diff): array
    {
        return [
            'cognitive_level' => $level,
            'difficulty' => $diff,
            'question_content' => "Soal nomor {$order} (Uraian) - {$topic}: Jelaskan secara rinci pengertian dari {$topic} dalam konteks mata pelajaran {$subject} untuk siswa {$phase}! Sertakan contoh nyata dari kehidupan sehari-hari untuk mendukung penjelasan Anda.",
            'options' => null,
            'correct_answer' => "Jawaban mengacu pada konsep {$topic}: [kunci jawaban akan diisi sesuai buku ajar]. Penilaian berdasarkan kelengkapan penjelasan, ketepatan contoh, dan sistematika jawaban.",
            'illustration_prompt' => null,
        ];
    }
}
