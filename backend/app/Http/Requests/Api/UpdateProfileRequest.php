<?php

namespace App\Http\Requests\Api;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => mb_strtolower(trim($this->input('email')))]);
        }
    }

    public function rules(): array
    {
        /** @var User $user */
        $user = $this->user();
        $sensitive = $this->filled('password') || ($this->filled('email') && $this->input('email') !== $user->email);

        return [
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'email' => ['sometimes', 'required', 'string', 'email:rfc', 'max:254', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['sometimes', 'required', 'string', 'confirmed', Password::defaults()],
            // Changing the email or password needs proof that it is really the account owner (a stolen token isn't enough).
            'current_password' => [Rule::requiredIf($sensitive), 'string', 'current_password'],
        ];
    }
}
