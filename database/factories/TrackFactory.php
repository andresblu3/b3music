<?php

namespace Database\Factories;

use App\Models\Track;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Track>
 */
class TrackFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'youtube_id' => fake()->unique()->regexify('[A-Za-z0-9_-]{11}'),
            'title' => fake()->sentence(3),
            'artist' => fake()->name(),
            'album' => fake()->sentence(2),
            'local_audio_path' => 'audio/'.fake()->uuid().'.mp3',
            'local_cover_path' => 'covers/'.fake()->uuid().'.jpg',
            'duration' => fake()->numberBetween(120, 420),
            'is_downloaded' => fake()->boolean(80),
        ];
    }

    public function notDownloaded(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_downloaded' => false,
        ]);
    }
}
