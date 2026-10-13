<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProfileController extends Controller
{
    public function show(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    public function update(UpdateProfileRequest $request): UserResource
    {
        $user = $request->user();
        $user->fill($request->safe()->only(['name', 'email', 'password']))->save();

        if ($request->filled('password')) {
            // A password change signs out every OTHER device.
            $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();
        }

        return new UserResource($user);
    }

    /** Permanently deletes the account and everything in it (including stored files). */
    public function destroy(Request $request): JsonResponse
    {
        $request->validate(['password' => ['required', 'string', 'current_password']]);
        $user = $request->user();

        // The database cascade removes rows, not files: delete the files first.
        $user->attachments()->get()->each->deleteStoredFile();

        DB::transaction(function () use ($user) {
            $user->tokens()->delete();
            $user->delete(); // cascades to memories, collections, tags, links, reminders, attachments
        });

        return response()->json(null, 204);
    }
}
