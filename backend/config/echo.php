<?php

return [

    /*
    | Uploaded recordings. The bytes live on a filesystem disk (never in PostgreSQL). Use a PRIVATE disk:
    | files are only served through the authorized download endpoint. In production point this at an
    | S3-compatible disk (see config/filesystems.php) via ECHO_ATTACHMENT_DISK.
    */
    'attachments' => [
        'disk' => env('ECHO_ATTACHMENT_DISK', 'local'),
        'max_kb' => (int) env('ECHO_ATTACHMENT_MAX_KB', 25 * 1024),
        // Sniffed from the file CONTENT by PHP fileinfo, not trusted from the client's header.
        'mime_types' => [
            'audio/mp4' => 'm4a',
            'audio/x-m4a' => 'm4a',
            'audio/aac' => 'aac',
            'audio/mpeg' => 'mp3',
            'audio/wav' => 'wav',
            'audio/x-wav' => 'wav',
            'audio/webm' => 'webm',
            'audio/ogg' => 'ogg',
        ],
        // Uploads never claimed by a memory are removed after this many hours (`php artisan echo:prune`).
        'orphan_ttl_hours' => (int) env('ECHO_ORPHAN_TTL_HOURS', 24),
    ],

    // Memories in the trash are purged (with their files) after this many days.
    'trash_retention_days' => (int) env('ECHO_TRASH_RETENTION_DAYS', 30),

    /*
    | OPTIONAL semantic search ("search by meaning"). OFF unless the operator turns it on AND each user opts in.
    |
    | Privacy: turning this on means the text of a user's memories (title, body, tags) and their semantic search
    | queries are sent to the embedding endpoint below, so the operator must say honestly where that endpoint runs:
    |   ECHO_SEMANTIC_PROCESSING=self-hosted  an endpoint on infrastructure you control (e.g. a local Ollama / TEI)
    |   ECHO_SEMANTIC_PROCESSING=external     a third-party API; text leaves your infrastructure
    | There is no default: with the feature enabled and no declared value, semantic search stays unavailable.
    | Vectors live in PostgreSQL (pgvector) next to the memory and are deleted with it, or when the user opts out.
    */
    'semantic' => [
        'enabled' => (bool) env('ECHO_SEMANTIC_ENABLED', false),
        'processing' => env('ECHO_SEMANTIC_PROCESSING'),
        'provider_label' => env('ECHO_SEMANTIC_PROVIDER_LABEL', 'the configured embedding service'),
        // An OpenAI-compatible API root; POST {base_url}/embeddings. External endpoints must use https.
        'base_url' => env('ECHO_SEMANTIC_BASE_URL'),
        'api_key' => env('ECHO_SEMANTIC_API_KEY'),
        'model' => env('ECHO_SEMANTIC_MODEL'),
        // Must equal the vector(N) column created by the migration, and the model's output size.
        'dimensions' => (int) env('ECHO_SEMANTIC_DIMENSIONS', 384),
        // Ask the endpoint for this size (models that support shortening, e.g. text-embedding-3-*).
        'send_dimensions' => (bool) env('ECHO_SEMANTIC_SEND_DIMENSIONS', false),
        'timeout_seconds' => (int) env('ECHO_SEMANTIC_TIMEOUT', 10),
        // Characters of a memory sent for embedding (title first), to bound cost and what leaves the server.
        'max_chars' => (int) env('ECHO_SEMANTIC_MAX_CHARS', 2000),
        // Cosine distance (0 = identical, 2 = opposite). Results farther than this are not "similar". Tune per model.
        'max_distance' => (float) env('ECHO_SEMANTIC_MAX_DISTANCE', 0.6),
        'requests_per_minute' => (int) env('ECHO_SEMANTIC_RPM', 120),
        // How long a provider health check is trusted (success / failure).
        'health_ttl_seconds' => 300,
        'health_fail_ttl_seconds' => 60,
        // Bump when the disclosure text or what is sent changes: users must consent again.
        'consent_version' => 1,
    ],

    'pagination' => [
        'default' => 25,
        'max' => 100,
    ],
];
