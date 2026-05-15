<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class GenerateExamRequest extends FormRequest
{
    public const MAX_QUESTIONS_PER_REQUEST = 100;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'curriculum' => ['required', 'string', 'max:255'],
            'exam_type' => ['required', 'string', 'max:255'],
            'class_phase' => ['required', 'string', 'max:255'],
            'subject' => ['required', 'string', 'max:255'],
            'semester' => ['required', 'string', 'max:100'],
            'time_allocation' => ['required', 'integer', 'min:15'],
            'reference_type' => ['required', 'string', 'in:AI,PDF,Manual'],
            'reference_text' => ['nullable', 'required_if:reference_type,Manual', 'string'],
            'reference_file' => ['nullable', 'file', 'mimes:pdf', 'max:10240'],
            'difficulty' => ['required', 'string', 'max:100'],
            'cognitive_levels' => ['required', 'array', 'min:1'],
            'cognitive_levels.*' => ['required', 'string', 'max:100'],
            'pg_options' => ['nullable', 'string', Rule::in([
                '3 Opsi (A-C)',
                '3 Opsi (A–C)',
                '3 Opsi (Aâ€“C)',
                '4 Opsi (A-C)',
                '4 Opsi (A–C)',
                '4 Opsi (Aâ€“C)',
                '4 Opsi (A-D)',
                '4 Opsi (A–D)',
                '4 Opsi (Aâ€“D)',
                '5 Opsi (A-E)',
                '5 Opsi (A–E)',
                '5 Opsi (Aâ€“E)',
            ])],
            'include_illustration' => ['boolean'],
            'topics' => ['required', 'array', 'min:1'],
            'topics.*.topik' => ['required', 'string', 'max:255'],
            'topics.*.tujuan' => ['nullable', 'string'],
            'formats' => ['required', 'array', 'min:1'],
            'formats.*.id' => ['required', 'string', 'in:pg,pgk,jodoh,bs,isian,uraian'],
            'formats.*.label' => ['required', 'string', 'max:100'],
            'formats.*.count' => ['required', 'integer', 'min:1'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $formats = $this->input('formats', []);
            $totalQuestions = collect($formats)->sum(fn (array $format): int => (int) ($format['count'] ?? 0));

            if ($totalQuestions < 1) {
                $validator->errors()->add('formats', 'Minimal harus ada 1 soal yang diminta.');
            }

            if ($totalQuestions > self::MAX_QUESTIONS_PER_REQUEST) {
                $validator->errors()->add('formats', 'Maksimal '.self::MAX_QUESTIONS_PER_REQUEST.' soal per sekali generate.');
            }

            if ($this->input('reference_type') === 'PDF' && ! $this->hasFile('reference_file')) {
                $validator->errors()->add('reference_file', 'File PDF wajib diunggah jika memilih sumber PDF.');
            }
        });
    }
}
