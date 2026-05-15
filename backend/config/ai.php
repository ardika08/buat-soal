<?php

return [
    'free_provider' => env('AI_FREE_PROVIDER', 'gemini'),
    'premium_provider' => env('AI_PREMIUM_PROVIDER', 'openai'),

    'gemini' => [
        'api_key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-2.5-flash-lite'),
        'base_url' => env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
    ],

    'openai' => [
        'api_key' => env('OPENAI_API_KEY'),
        'model' => env('OPENAI_PREMIUM_MODEL', 'gpt-5.4-mini'),
        'base_url' => env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    ],

    'illustrations' => [
        'enabled' => env('AI_GENERATE_ILLUSTRATIONS', true),
        'model' => env('OPENAI_IMAGE_MODEL', 'gpt-image-1'),
        'size' => env('OPENAI_IMAGE_SIZE', '1024x1024'),
        'quality' => env('OPENAI_IMAGE_QUALITY', 'low'),
        'timeout' => env('OPENAI_IMAGE_TIMEOUT', 120),
        'max_per_exam' => env('AI_MAX_ILLUSTRATIONS_PER_EXAM', 5),
        'public_url' => env('BACKEND_PUBLIC_URL', env('APP_URL', 'http://localhost')),
    ],
];
