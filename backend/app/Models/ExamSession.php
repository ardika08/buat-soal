<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExamSession extends Model
{
    protected $fillable = [
        'user_id',
        'curriculum',
        'exam_type',
        'class_phase',
        'subject',
        'semester',
        'time_allocation',
        'reference_type',
        'difficulty',
        'cognitive_levels',
        'pg_options',
        'include_illustration',
        'topics',
        'credits_consumed',
    ];

    protected function casts(): array
    {
        return [
            'cognitive_levels' => 'array',
            'topics' => 'array',
            'include_illustration' => 'boolean',
            'time_allocation' => 'integer',
            'credits_consumed' => 'integer',
        ];
    }

    // ─── Relationships ────────────────────────────────────────────

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(Question::class)->orderBy('order_number');
    }
}
