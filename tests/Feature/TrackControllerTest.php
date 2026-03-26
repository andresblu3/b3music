<?php

use App\Models\Track;
use Illuminate\Support\Facades\Storage;

it('renders the tracks index page', function () {
    Track::factory()->count(3)->create(['is_downloaded' => true]);

    $response = $this->get('/');

    $response->assertSuccessful();
    $response->assertInertia(fn ($page) => $page
        ->component('Tracks/Index')
        ->has('tracks', 3)
    );
});

it('only returns downloaded tracks', function () {
    Track::factory()->count(2)->create(['is_downloaded' => true]);
    Track::factory()->count(3)->create(['is_downloaded' => false]);

    $response = $this->get('/');

    $response->assertInertia(fn ($page) => $page
        ->has('tracks', 2)
    );
});

it('streams audio for a track', function () {
    $track = Track::factory()->create([
        'is_downloaded' => true,
        'local_audio_path' => 'test-audio.mp3',
    ]);

    Storage::disk('local')->put('test-audio.mp3', 'fake-audio-content');

    $response = $this->get(route('tracks.stream', $track));

    $response->assertSuccessful();
    $response->assertHeader('Accept-Ranges', 'bytes');

    Storage::disk('local')->delete('test-audio.mp3');
});

it('returns 404 for missing audio file', function () {
    $track = Track::factory()->create([
        'is_downloaded' => true,
        'local_audio_path' => 'nonexistent.mp3',
    ]);

    $response = $this->get(route('tracks.stream', $track));

    $response->assertNotFound();
});

it('updates track duration', function () {
    $track = Track::factory()->create([
        'is_downloaded' => true,
        'duration' => null,
    ]);

    $response = $this->patch(route('tracks.updateDuration', $track), [
        'duration' => 240,
    ]);

    $response->assertNoContent();
    expect($track->fresh()->duration)->toBe(240);
});
