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

it('applies metadata and stores cover art locally', function () {
    Storage::fake('public');

    $track = Track::factory()->create([
        'is_downloaded' => true,
        'album' => null,
        'local_cover_path' => null,
        'remote_cover_url' => null,
    ]);

    $image = imagecreatetruecolor(20, 20);
    imagefill($image, 0, 0, imagecolorallocate($image, 120, 80, 200));
    ob_start();
    imagepng($image);
    $png = ob_get_clean();
    imagedestroy($image);

    expect($png)->toBeString();

    $coverData = 'data:image/png;base64,'.base64_encode($png);

    $response = $this->postJson(route('tracks.applyMetadata', $track), [
        'title' => 'Midnight City',
        'artist' => 'M83',
        'album' => 'Hurry Up, We Are Dreaming',
        'cover_url' => 'https://example.com/cover.png',
        'cover_data' => $coverData,
    ]);

    $response
        ->assertSuccessful()
        ->assertJsonPath('title', 'Midnight City')
        ->assertJsonPath('artist', 'M83')
        ->assertJsonPath('album', 'Hurry Up, We Are Dreaming')
        ->assertJsonPath('remote_cover_url', 'https://example.com/cover.png');

    $track->refresh();

    expect($track->album)->toBe('Hurry Up, We Are Dreaming');
    expect($track->local_cover_path)->toBe("covers/{$track->youtube_id}.jpg");
    Storage::disk('public')->assertExists($track->local_cover_path);
});
