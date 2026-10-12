<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('memories', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // A memory belongs to at most one collection; deleting the collection keeps the memory.
            $table->foreignUlid('collection_id')->nullable()->constrained()->nullOnDelete();

            $table->string('type', 16); // App\Enums\MemoryType
            $table->string('title', 120);
            $table->text('body')->nullable();
            $table->string('source_url', 2048)->nullable();

            $table->boolean('favorite')->default(false);
            $table->boolean('pinned')->default(false);
            $table->timestamp('last_opened_at')->nullable(); // "Continue exploring"; never bumps updated_at

            $table->timestamps();
            $table->softDeletes(); // the server-side half of "Undo delete"

            $table->index(['user_id', 'created_at']);
            $table->index(['user_id', 'favorite']);
            $table->index(['user_id', 'pinned']);
            $table->index('collection_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('memories');
    }
};
