<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Question extends Model
{
    protected $fillable = [
        'exam_session_id',
        'order_number',
        'question_type',
        'cognitive_level',
        'difficulty',
        'question_content',
        'options',
        'correct_answer',
        'illustration_prompt',
        'illustration_image',
    ];

    protected function casts(): array
    {
        return [
            'options' => 'array',
            'order_number' => 'integer',
        ];
    }

    // ─── Relationships ────────────────────────────────────────────

    public function examSession(): BelongsTo
    {
        return $this->belongsTo(ExamSession::class);
    }
}
