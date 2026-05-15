<?php

namespace App\Exceptions;

use RuntimeException;

class AiInvalidOutputException extends RuntimeException
{
    public function __construct(string $message = 'AI returned invalid output.')
    {
        parent::__construct($message);
    }
}
