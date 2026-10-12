<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // METADATA ONLY. The file itself lives in the configured filesystem disk
        // (local in development, S3-compatible object storage in production) at `path`.
        // Never add a binary/blob column here.
        Schema::create('attachments', function (Blueprint $table) {
            $table->ulid('id')->primary();
            // Ownership comes from the memory (no duplicated user_id to keep in sync).
            $table->foreignUlid('memory_id')->constrained()->cascadeOnDelete();

            $table->string('kind', 16); // 'audio' for now
            $table->string('disk', 32); // config/filesystems.php disk name
            $table->string('path', 512); // storage key within the disk
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();

            $table->timestamps();

            $table->index('memory_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attachments');
    }
};
