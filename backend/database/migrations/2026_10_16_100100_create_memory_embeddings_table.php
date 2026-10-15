<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Vector store for OPTIONAL semantic search (pgvector).
 *
 * The table is created only when the `vector` extension is installed (or can be created) on this server. When it
 * is not, this migration does nothing and semantic search reports itself unavailable: it must never break a
 * deployment that does not want the feature. Install pgvector, then run `php artisan migrate:refresh --path=...`
 * or re-run this migration by hand.
 *
 * Tenant safety follows the rest of the schema: the composite foreign key (user_id, memory_id) -> memories makes
 * it impossible for a vector to point at another user's memory, and deleting a memory (or the account) deletes
 * its vectors. The vector size is fixed at creation: it comes from ECHO_SEMANTIC_DIMENSIONS and must equal the
 * embedding model's output.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        $installed = DB::selectOne("select 1 as ok from pg_extension where extname = 'vector'");
        if (! $installed) {
            if (! DB::selectOne("select 1 as ok from pg_available_extensions where name = 'vector'")) {
                return;
            }
            try {
                // A nested transaction is a SAVEPOINT: a refused CREATE EXTENSION does not poison this migration.
                DB::transaction(fn () => DB::statement('CREATE EXTENSION IF NOT EXISTS vector'));
            } catch (Throwable) {
                return;
            }
        }

        $dimensions = (int) config('echo.semantic.dimensions');
        if ($dimensions < 1 || $dimensions > 2000) {
            return;
        }

        DB::statement("CREATE TABLE memory_embeddings (
            memory_id char(26) PRIMARY KEY,
            user_id bigint NOT NULL,
            model varchar(100) NOT NULL,
            content_hash char(64) NOT NULL,
            embedding vector({$dimensions}) NOT NULL,
            embedded_at timestamp NOT NULL,
            CONSTRAINT memory_embeddings_user_memory_foreign
                FOREIGN KEY (user_id, memory_id) REFERENCES memories (user_id, id) ON DELETE CASCADE
        )");
        DB::statement('CREATE INDEX memory_embeddings_user_id_index ON memory_embeddings (user_id)');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS memory_embeddings');
    }
};
