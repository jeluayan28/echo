<?php

namespace App\Policies;

use App\Models\User;
use Illuminate\Auth\Access\Response;
use Illuminate\Database\Eloquent\Model;

/**
 * Every user-owned resource is private to its owner. A non-owner gets "not found" (404), never "forbidden":
 * the API must not confirm that someone else's id exists.
 */
abstract class OwnedPolicy
{
    protected function owns(User $user, Model $model): Response
    {
        return $model->getAttribute('user_id') === $user->getKey()
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    public function view(User $user, Model $model): Response
    {
        return $this->owns($user, $model);
    }

    public function update(User $user, Model $model): Response
    {
        return $this->owns($user, $model);
    }

    public function delete(User $user, Model $model): Response
    {
        return $this->owns($user, $model);
    }

    public function restore(User $user, Model $model): Response
    {
        return $this->owns($user, $model);
    }

    public function forceDelete(User $user, Model $model): Response
    {
        return $this->owns($user, $model);
    }
}
