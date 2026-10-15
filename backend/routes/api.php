<?php

use App\Http\Controllers\Api\V1\AttachmentController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CollectionController;
use App\Http\Controllers\Api\V1\LinkController;
use App\Http\Controllers\Api\V1\MemoryController;
use App\Http\Controllers\Api\V1\NotificationPreferenceController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\ReminderController;
use App\Http\Controllers\Api\V1\SearchController;
use App\Http\Controllers\Api\V1\SemanticSearchController;
use App\Http\Controllers\Api\V1\TagController;
use Illuminate\Support\Facades\Route;

/*
| ECHO API v1 — mounted at /api/v1 (the "api" prefix comes from the framework).
| Every route below `auth:sanctum` is scoped to the authenticated user; ids supplied by the client are only
| ever used to LOOK UP a resource, and the policy then checks the owner (a non-owner gets 404).
*/
Route::prefix('v1')->name('v1.')->group(function () {
    // ── public ────────────────────────────────────────────────────────────────
    Route::post('auth/register', [AuthController::class, 'register'])->middleware('throttle:auth-register')->name('auth.register');
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:auth-login')->name('auth.login');

    // Time-limited signed playback URL, issued only to the owner (see AttachmentResource).
    Route::get('attachments/{attachment}/stream', [AttachmentController::class, 'stream'])
        ->middleware(['signed', 'throttle:api'])->name('attachments.stream');

    // ── authenticated ─────────────────────────────────────────────────────────
    Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');

        // Current user, profile, preferences
        Route::get('me', [ProfileController::class, 'show'])->name('me.show');
        Route::patch('me', [ProfileController::class, 'update'])->name('me.update');
        Route::delete('me', [ProfileController::class, 'destroy'])->name('me.destroy');
        Route::get('me/semantic-search', [SemanticSearchController::class, 'show'])->name('me.semantic.show');
        Route::patch('me/semantic-search', [SemanticSearchController::class, 'update'])->middleware('throttle:semantic-settings')->name('me.semantic.update');
        Route::get('me/preferences', [NotificationPreferenceController::class, 'show'])->name('me.preferences.show');
        Route::patch('me/preferences', [NotificationPreferenceController::class, 'update'])->name('me.preferences.update');

        // Memories (+ trash)
        Route::get('memories/trashed', [MemoryController::class, 'trashed'])->name('memories.trashed');
        Route::get('memories', [MemoryController::class, 'index'])->name('memories.index');
        Route::post('memories', [MemoryController::class, 'store'])->name('memories.store');
        Route::get('memories/{memory}', [MemoryController::class, 'show'])->name('memories.show');
        Route::patch('memories/{memory}', [MemoryController::class, 'update'])->name('memories.update');
        Route::delete('memories/{memory}', [MemoryController::class, 'destroy'])->name('memories.destroy');
        Route::post('memories/{memory}/open', [MemoryController::class, 'open'])->name('memories.open');
        Route::post('memories/{memory}/restore', [MemoryController::class, 'restore'])->withTrashed()->name('memories.restore');
        Route::delete('memories/{memory}/force', [MemoryController::class, 'forceDestroy'])->withTrashed()->name('memories.force');

        // Relationships between memories
        Route::get('links', [LinkController::class, 'index'])->name('links.index');
        Route::get('memories/{memory}/links', [LinkController::class, 'forMemory'])->name('memories.links.index');
        Route::post('memories/{memory}/links', [LinkController::class, 'store'])->name('memories.links.store');
        Route::delete('memories/{memory}/links/{other}', [LinkController::class, 'destroy'])->name('memories.links.destroy');

        // Reminders
        Route::get('reminders', [ReminderController::class, 'index'])->name('reminders.index');
        Route::post('reminders/{reminder}/complete', [ReminderController::class, 'complete'])->name('reminders.complete');
        Route::get('memories/{memory}/reminder', [ReminderController::class, 'show'])->name('memories.reminder.show');
        Route::put('memories/{memory}/reminder', [ReminderController::class, 'upsert'])->name('memories.reminder.upsert');
        Route::delete('memories/{memory}/reminder', [ReminderController::class, 'destroy'])->name('memories.reminder.destroy');

        // Attachments (metadata + files)
        Route::post('attachments', [AttachmentController::class, 'store'])->middleware('throttle:uploads')->name('attachments.store');
        Route::get('attachments/{attachment}', [AttachmentController::class, 'show'])->name('attachments.show');
        Route::get('attachments/{attachment}/file', [AttachmentController::class, 'file'])->name('attachments.file');
        Route::delete('attachments/{attachment}', [AttachmentController::class, 'destroy'])->name('attachments.destroy');
        Route::get('memories/{memory}/attachment', [AttachmentController::class, 'forMemory'])->name('memories.attachment.show');
        Route::post('memories/{memory}/attachment', [AttachmentController::class, 'storeForMemory'])->middleware('throttle:uploads')->name('memories.attachment.store');

        // Tags, collections, search
        Route::get('tags', [TagController::class, 'index'])->name('tags.index');
        Route::post('tags', [TagController::class, 'store'])->name('tags.store');
        Route::patch('tags/{tag}', [TagController::class, 'update'])->name('tags.update');
        Route::delete('tags/{tag}', [TagController::class, 'destroy'])->name('tags.destroy');

        Route::apiResource('collections', CollectionController::class);

        Route::get('search', SearchController::class)->middleware('throttle:search')->name('search');
    });
});
