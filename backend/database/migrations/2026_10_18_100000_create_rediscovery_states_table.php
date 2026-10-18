<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // What the user told Rediscovery about one memory ("not now" / "not interested"), so the choice follows
        // the account across devices and survives a reinstall. One row per memory, created on first choice.
        Schema::create('rediscovery_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('memory_id')->constrained('memories')->cascadeOnDelete();
            $table->timestampTz('dismissed_at')->nullable();
            $table->timestampTz('snoozed_until')->nullable();
            $table->timestamps();

            $table->unique('memory_id');
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rediscovery_states');
    }
};
