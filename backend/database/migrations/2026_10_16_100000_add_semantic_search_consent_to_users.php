<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Semantic search sends memory text to an embedding service, so it is strictly opt-in per user.
        // When the user agreed, and to which version of the disclosure (a changed disclosure needs fresh consent).
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('semantic_search_opt_in_at')->nullable();
            $table->unsignedSmallInteger('semantic_search_consent_version')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['semantic_search_opt_in_at', 'semantic_search_consent_version']);
        });
    }
};
