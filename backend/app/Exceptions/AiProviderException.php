<?php

namespace App\Exceptions;

use RuntimeException;

class AiProviderException extends RuntimeException
{
    public function __construct(string $message = 'AI provider failed.')
    {
        parent::__construct($message);
    }
}
