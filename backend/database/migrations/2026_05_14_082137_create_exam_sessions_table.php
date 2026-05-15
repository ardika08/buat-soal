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
        Schema::create('exam_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('curriculum');
            $table->string('exam_type');
            $table->string('class_phase');
            $table->string('subject');
            $table->string('semester')->default('Ganjil');
            $table->integer('time_allocation')->default(90); // in minutes
            $table->string('reference_type')->default('AI'); // AI, PDF, Manual
            $table->string('difficulty')->default('Campuran Berimbang');
            $table->json('cognitive_levels')->nullable(); // ['C1','C2', ...]
            $table->string('pg_options')->nullable(); // e.g. "4 Opsi (A–D)"
            $table->boolean('include_illustration')->default(false);
            $table->json('topics')->nullable(); // [{topik:'', tujuan:''}, ...]
            $table->integer('credits_consumed')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('exam_sessions');
    }
};
