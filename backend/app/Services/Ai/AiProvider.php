<?php

namespace App\Services\Ai;

interface AiProvider
{
    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function generate(array $data, int $totalQuestions): array;
}
