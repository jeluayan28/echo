<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('memory_reminders', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('memory_id');

            $table->timestampTz('remind_at');
            // What the device actually arranged: an OS notification, or only an in-app cue (see the mobile app).
            $table->string('delivery', 16)->default('in-app');
            // Id of the notification scheduled ON THE DEVICE, so the client can cancel it. Opaque to the server.
            $table->string('notification_id', 255)->nullable();
            // Set when the user opened the memory after the reminder was due (it is then fulfilled).
            $table->timestampTz('completed_at')->nullable();

            $table->timestamps();

            $table->unique('memory_id'); // one reminder per memory
            $table->index(['user_id', 'remind_at']);
            $table->index(['remind_at', 'completed_at']); // future server-side "what is due" scans
        });

        if (DB::getDriverName() === 'pgsql') {
            // Reminders die with their memory when it is permanently deleted; the composite key proves the
            // reminder and the memory belong to the same user.
            DB::statement('ALTER TABLE memory_reminders ADD CONSTRAINT memory_reminders_user_memory_foreign
                FOREIGN KEY (user_id, memory_id) REFERENCES memories (user_id, id) ON DELETE CASCADE');
            DB::statement("ALTER TABLE memory_reminders ADD CONSTRAINT memory_reminders_delivery_check CHECK (delivery IN ('notification','in-app'))");
        } else {
            Schema::table('memory_reminders', fn (Blueprint $t) => $t->foreign('memory_id')->references('id')->on('memories')->cascadeOnDelete());
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('memory_reminders');
    }
};
