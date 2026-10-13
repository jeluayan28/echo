<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Turns the first-draft schema into a tenant-safe one.
 *
 * TENANT ISOLATION IN THE DATABASE (PostgreSQL): every user-owned table carries user_id, and rows that
 * point at another user-owned row do so through a COMPOSITE foreign key (user_id, x_id) -> x(user_id, id).
 * Even a buggy controller therefore cannot attach user A's memory to user B's collection, tag or link.
 *
 * CASCADES (all deliberate):
 *  - deleting a user            -> everything of theirs is deleted (account deletion).
 *  - deleting a collection      -> its memories are KEPT, collection_id becomes NULL (never user_id).
 *  - (force-)deleting a memory  -> its tag pivots, links, reminders and attachment rows are deleted.
 *    Soft-deleting a memory deletes nothing, so "Undo" can restore links, tags and reminders.
 *  - deleting a tag             -> only its pivot rows go; memories are untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── portable parts ───────────────────────────────────────────────────
        Schema::table('collections', function (Blueprint $table) {
            $table->unique(['user_id', 'id']); // target of composite foreign keys
            $table->index(['user_id', 'name']);
        });

        Schema::table('tags', function (Blueprint $table) {
            $table->unique(['user_id', 'id']);
        });

        Schema::table('memories', function (Blueprint $table) {
            $table->unique(['user_id', 'id']);
            $table->index(['user_id', 'updated_at']);
            $table->index(['user_id', 'type']);
            $table->index(['user_id', 'collection_id']);
            $table->index(['user_id', 'last_opened_at']);
            $table->index(['user_id', 'deleted_at']); // trash listing + purge
        });

        Schema::table('memory_tag', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->after('memory_id');
        });
        DB::statement('UPDATE memory_tag SET user_id = (SELECT user_id FROM memories WHERE memories.id = memory_tag.memory_id)');
        Schema::table('memory_tag', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable(false)->change();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::table('attachments', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->after('id');
        });
        DB::statement('UPDATE attachments SET user_id = (SELECT user_id FROM memories WHERE memories.id = attachments.memory_id)');
        Schema::table('attachments', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable(false)->change();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            // An upload may exist before its memory does (the app uploads first, then saves the memory).
            $table->foreignUlid('memory_id')->nullable()->change();
            $table->dropIndex(['memory_id']);
            $table->unique('memory_id'); // one attachment per memory
            $table->index(['user_id', 'created_at']);
        });

        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // ── PostgreSQL: composite tenant foreign keys ────────────────────────
        // memories -> collections. ON DELETE SET NULL (collection_id) (PostgreSQL 15+) nulls ONLY the
        // collection, never user_id.
        DB::statement('ALTER TABLE memories DROP CONSTRAINT memories_collection_id_foreign');
        DB::statement('ALTER TABLE memories ADD CONSTRAINT memories_user_collection_foreign
            FOREIGN KEY (user_id, collection_id) REFERENCES collections (user_id, id)
            ON DELETE SET NULL (collection_id)');

        DB::statement('ALTER TABLE memory_tag DROP CONSTRAINT memory_tag_memory_id_foreign');
        DB::statement('ALTER TABLE memory_tag DROP CONSTRAINT memory_tag_tag_id_foreign');
        DB::statement('ALTER TABLE memory_tag ADD CONSTRAINT memory_tag_user_memory_foreign
            FOREIGN KEY (user_id, memory_id) REFERENCES memories (user_id, id) ON DELETE CASCADE');
        DB::statement('ALTER TABLE memory_tag ADD CONSTRAINT memory_tag_user_tag_foreign
            FOREIGN KEY (user_id, tag_id) REFERENCES tags (user_id, id) ON DELETE CASCADE');

        DB::statement('ALTER TABLE memory_links DROP CONSTRAINT memory_links_from_memory_id_foreign');
        DB::statement('ALTER TABLE memory_links DROP CONSTRAINT memory_links_to_memory_id_foreign');
        DB::statement('ALTER TABLE memory_links ADD CONSTRAINT memory_links_user_from_foreign
            FOREIGN KEY (user_id, from_memory_id) REFERENCES memories (user_id, id) ON DELETE CASCADE');
        DB::statement('ALTER TABLE memory_links ADD CONSTRAINT memory_links_user_to_foreign
            FOREIGN KEY (user_id, to_memory_id) REFERENCES memories (user_id, id) ON DELETE CASCADE');
        // A link is stored once per pair, smaller id first. This forbids self-links (from = to) AND the
        // reversed duplicate (b,a) next to (a,b); together with UNIQUE(from, to) a pair can exist only once.
        // COLLATE "C" = byte order, identical to PHP's strcmp used by the application.
        DB::statement('ALTER TABLE memory_links ADD CONSTRAINT memory_links_canonical_order
            CHECK (from_memory_id COLLATE "C" < to_memory_id COLLATE "C")');

        DB::statement('ALTER TABLE attachments DROP CONSTRAINT attachments_memory_id_foreign');
        DB::statement('ALTER TABLE attachments ADD CONSTRAINT attachments_user_memory_foreign
            FOREIGN KEY (user_id, memory_id) REFERENCES memories (user_id, id) ON DELETE CASCADE');

        // ── PostgreSQL: value constraints ────────────────────────────────────
        DB::statement("ALTER TABLE memories ADD CONSTRAINT memories_type_check CHECK (type IN ('note','idea','link','voice'))");
        DB::statement('ALTER TABLE memories ADD CONSTRAINT memories_title_not_blank CHECK (char_length(btrim(title)) > 0)');
        DB::statement('ALTER TABLE tags ADD CONSTRAINT tags_name_normalized CHECK (name = lower(btrim(name)) AND char_length(name) > 0)');
        DB::statement("ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('audio'))");
        DB::statement('ALTER TABLE attachments ADD CONSTRAINT attachments_sizes_check
            CHECK ((size_bytes IS NULL OR size_bytes >= 0) AND (duration_ms IS NULL OR duration_ms >= 0))');

        // ── PostgreSQL: full-text search ─────────────────────────────────────
        // A STORED generated column keeps the vector in sync with title/body automatically (no triggers, no
        // app code to forget). 'simple' = no language-specific stemming/stop-words, so mixed-language notes
        // behave predictably; prefix matching ("pass:*") covers search-as-you-type. Title outranks content.
        DB::statement("ALTER TABLE memories ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
            setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('simple', coalesce(body, '')), 'B')
        ) STORED");
        DB::statement('CREATE INDEX memories_search_vector_gin ON memories USING GIN (search_vector)');
        // Tag prefix search ("name LIKE 'abc%'") must use an index regardless of the database collation.
        DB::statement('CREATE INDEX tags_user_name_prefix ON tags (user_id, name text_pattern_ops)');
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS tags_user_name_prefix');
            DB::statement('DROP INDEX IF EXISTS memories_search_vector_gin');
            DB::statement('ALTER TABLE memories DROP COLUMN IF EXISTS search_vector');
            DB::statement('ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_sizes_check');
            DB::statement('ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_kind_check');
            DB::statement('ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_normalized');
            DB::statement('ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_title_not_blank');
            DB::statement('ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_type_check');
            DB::statement('ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_user_memory_foreign');
            DB::statement('ALTER TABLE memory_links DROP CONSTRAINT IF EXISTS memory_links_canonical_order');
            DB::statement('ALTER TABLE memory_links DROP CONSTRAINT IF EXISTS memory_links_user_to_foreign');
            DB::statement('ALTER TABLE memory_links DROP CONSTRAINT IF EXISTS memory_links_user_from_foreign');
            DB::statement('ALTER TABLE memory_tag DROP CONSTRAINT IF EXISTS memory_tag_user_tag_foreign');
            DB::statement('ALTER TABLE memory_tag DROP CONSTRAINT IF EXISTS memory_tag_user_memory_foreign');
            DB::statement('ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_user_collection_foreign');
            // Restore the first-draft single-column keys.
            DB::statement('ALTER TABLE memories ADD CONSTRAINT memories_collection_id_foreign FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE SET NULL');
            DB::statement('ALTER TABLE memory_tag ADD CONSTRAINT memory_tag_memory_id_foreign FOREIGN KEY (memory_id) REFERENCES memories (id) ON DELETE CASCADE');
            DB::statement('ALTER TABLE memory_tag ADD CONSTRAINT memory_tag_tag_id_foreign FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE');
            DB::statement('ALTER TABLE memory_links ADD CONSTRAINT memory_links_from_memory_id_foreign FOREIGN KEY (from_memory_id) REFERENCES memories (id) ON DELETE CASCADE');
            DB::statement('ALTER TABLE memory_links ADD CONSTRAINT memory_links_to_memory_id_foreign FOREIGN KEY (to_memory_id) REFERENCES memories (id) ON DELETE CASCADE');
            DB::statement('ALTER TABLE attachments ADD CONSTRAINT attachments_memory_id_foreign FOREIGN KEY (memory_id) REFERENCES memories (id) ON DELETE CASCADE');
        }

        Schema::table('attachments', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'created_at']);
            $table->dropUnique(['memory_id']);
            $table->index('memory_id');
            $table->dropForeign(['user_id']);
            $table->dropColumn('user_id');
        });
        Schema::table('memory_tag', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->dropColumn('user_id');
        });
        Schema::table('memories', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'deleted_at']);
            $table->dropIndex(['user_id', 'last_opened_at']);
            $table->dropIndex(['user_id', 'collection_id']);
            $table->dropIndex(['user_id', 'type']);
            $table->dropIndex(['user_id', 'updated_at']);
            $table->dropUnique(['user_id', 'id']);
        });
        Schema::table('tags', fn (Blueprint $t) => $t->dropUnique(['user_id', 'id']));
        Schema::table('collections', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'name']);
            $table->dropUnique(['user_id', 'id']);
        });
    }
};
