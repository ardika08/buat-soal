<?php

namespace App\Exceptions;

use RuntimeException;

class InsufficientCreditsException extends RuntimeException
{
    public function __construct(
        public readonly int $creditsBalance,
        public readonly int $creditsRequired,
    ) {
        parent::__construct("Kredit Anda tidak mencukupi untuk membuat {$creditsRequired} soal. Silakan top up kredit atau upgrade paket.");
    }
}
