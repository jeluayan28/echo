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

    'pagination' => [
        'default' => 25,
        'max' => 100,
    ],
];
