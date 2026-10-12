<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // User-created relationships between two memories (Neural Map edges).
        Schema::create('memory_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('from_memory_id')->constrained('memories')->cascadeOnDelete();
            $table->foreignUlid('to_memory_id')->constrained('memories')->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();

            // The application stores each pair once, with the smaller id first.
            $table->unique(['from_memory_id', 'to_memory_id']);
            $table->index('to_memory_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('memory_links');
    }
};
