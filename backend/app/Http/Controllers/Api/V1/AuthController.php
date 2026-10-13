<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\LoginRequest;
use App\Http\Requests\Api\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    private const DUMMY_HASH = '$2y$12$x9VXjAqLK9dEwEjhBl7/X.zbLPKs8FOUN3FFbfdovo9ik6AxYmGDi';

    public function register(RegisterRequest $request): JsonResponse
    {
        $user = User::create($request->safe()->only(['name', 'email', 'password']));

        return $this->tokenResponse($user, $request->input('device_name', 'mobile'), 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::query()->where('email', $request->input('email'))->first();

        // Always run one bcrypt comparison, so response time doesn't reveal whether the email exists.
        // DUMMY_HASH is the hash of a random throwaway string (not a secret, matches no real password).
        $hash = $user?->password ?? self::DUMMY_HASH;
        $valid = Hash::check($request->input('password'), $hash);

        if (! $user || ! $valid) {
            return response()->json(['message' => 'The provided credentials are incorrect.'], 401);
        }

        if (Hash::needsRehash($user->password)) {
            $user->forceFill(['password' => $request->input('password')])->save();
        }

        return $this->tokenResponse($user, $request->input('device_name', 'mobile'));
    }

    /** Revokes ONLY the token used for this request (other devices stay signed in). */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    private function tokenResponse(User $user, string $deviceName, int $status = 200): JsonResponse
    {
        $expiresAt = config('sanctum.expiration') ? now()->addMinutes((int) config('sanctum.expiration')) : null;
        $token = $user->createToken($deviceName, ['*'], $expiresAt);

        return response()->json([
            'data' => [
                'user' => new UserResource($user),
                'token' => $token->plainTextToken, // shown ONCE; only a hash is stored server-side
                'token_type' => 'Bearer',
                'expires_at' => $expiresAt?->toIso8601String(),
            ],
        ], $status);
    }
}
