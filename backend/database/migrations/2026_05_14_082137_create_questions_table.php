<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exam_session_id')->constrained()->cascadeOnDelete();
            $table->integer('order_number')->default(0);
            $table->string('question_type'); // PG, PGK, Menjodohkan, B/S, Isian, Uraian
            $table->string('cognitive_level')->nullable(); // C1..C6
            $table->string('difficulty')->nullable(); // Mudah, Sedang, Sulit
            $table->text('question_content');
            $table->json('options')->nullable(); // {A:'...', B:'...', C:'...', D:'...'}
            $table->text('correct_answer');
            $table->text('illustration_prompt')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('questions');
    }
};
