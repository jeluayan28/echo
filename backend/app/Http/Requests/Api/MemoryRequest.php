<?php

namespace App\Http\Requests\Api;

use App\Enums\MemoryType;
use App\Models\Memory;
use App\Models\Tag;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Create (POST) and update (PATCH) share one set of rules; on update every field is optional.
 * Anything that references another record (collection, upload) is checked against THE AUTHENTICATED USER's
 * rows, so a client can never reference someone else's id. (The database re-checks with composite foreign keys.)
 */
class MemoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_array($this->input('tags'))) {
            $this->merge(['tags' => collect($this->input('tags'))
                ->map(fn ($t) => is_string($t) ? Tag::normalize($t) : $t)
                ->filter(fn ($t) => $t !== '' && $t !== null)
                ->unique()->values()->all()]);
        }
    }

    public function rules(): array
    {
        $creating = $this->isMethod('POST');
        $userId = $this->user()->id;
        /** @var Memory|null $memory */
        $memory = $this->route('memory');
        $type = $creating ? $this->input('type') : $memory?->type->value;
        $required = $creating ? 'required' : 'sometimes';

        return [
            'type' => $creating ? ['required', Rule::enum(MemoryType::class)] : ['prohibited'],
            'title' => [$required, 'string', 'max:120', 'regex:/\S/u'],
            'body' => ['sometimes', 'nullable', 'string', 'max:10000'],
            // Required for link memories; an optional "source" on others. http(s) only (no javascript:, file:, data:).
            'source_url' => [$type === 'link' ? $required : 'sometimes', $type === 'link' ? 'string' : 'nullable', 'url:http,https', 'max:2048'],
            'collection_id' => ['sometimes', 'nullable', 'string', Rule::exists('collections', 'id')->where('user_id', $userId)],
            // Update only: the `updated_at` the client's copy was based on. A mismatch is a 409 (see MemoryWriter).
            'base_updated_at' => $creating ? ['prohibited'] : ['sometimes', 'date'],
            'favorite' => ['sometimes', 'boolean'],
            'pinned' => ['sometimes', 'boolean'],
            'tags' => ['sometimes', 'array', 'max:10'],
            'tags.*' => ['string', 'min:1', 'max:30'],
            // A voice memo needs its recording; other types cannot have one.
            'attachment_id' => [
                $type === 'voice' && $creating ? 'required' : ($type === 'voice' ? 'sometimes' : 'prohibited'),
                'string',
                Rule::exists('attachments', 'id')->where('user_id', $userId)->where(fn ($q) => $q->whereNull('memory_id')
                    ->orWhere('memory_id', $memory?->id)),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'type.prohibited' => 'The type of a memory cannot be changed.',
            'attachment_id.prohibited' => 'Only voice memories can have a recording.',
        ];
    }
}
