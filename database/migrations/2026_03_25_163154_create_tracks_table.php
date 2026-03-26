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
        Schema::create('tracks', function (Blueprint $table) {
            $table->id();
            $table->string('youtube_id')->unique();
            $table->string('title');
            $table->string('artist')->nullable();
            $table->string('local_audio_path');
            $table->string('local_cover_path')->nullable();
            $table->integer('duration')->nullable();
            $table->boolean('is_downloaded')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tracks');
    }
};
