<?php

namespace App\Http\Controllers;

use App\Models\Track;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Native\Mobile\Facades\Dialog;

class TrackController extends Controller
{
    public function index(): InertiaResponse
    {
        return Inertia::render('Tracks/Index', [
            'tracks' => Track::query()
                ->where('is_downloaded', true)
                ->orderBy('created_at', 'desc')
                ->get(),
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'files' => ['required', 'array'],
            'files.*' => ['required', 'file'],
            'durations' => ['nullable', 'array'],
        ]);

        $files = $request->file('files');
        $durations = $request->input('durations', []);
        $count = 0;

        foreach ($files as $index => $file) {
            $filename = $file->getClientOriginalName();
            $extension = $file->getClientOriginalExtension();
            $safeName = uniqid().'_'.preg_replace('/[^A-Za-z0-9_\-]/', '_', pathinfo($filename, PATHINFO_FILENAME)).'.'.$extension;

            $path = $file->storeAs('tracks', $safeName, 'local');

            $duration = isset($durations[$index]) ? (int) $durations[$index] : 0;

            Track::create([
                'youtube_id' => 'loc_'.uniqid('', true),
                'title' => pathinfo($filename, PATHINFO_FILENAME),
                'artist' => 'Local',
                'album' => null,
                'local_audio_path' => $path,
                'is_downloaded' => true,
                'duration' => $duration > 0 ? $duration : null,
            ]);
            $count++;
        }

        Dialog::toast(
            $count === 1
                ? 'Sincronizada 1 canción.'
                : "Sincronizadas {$count} canciones.",
        );

        return redirect()->back();
    }

    public function destroy(Track $track)
    {
        if ($track->local_audio_path) {
            Storage::disk('local')->delete($track->local_audio_path);
            Storage::disk('public')->delete($track->local_audio_path);
        }

        if ($track->local_cover_path) {
            Storage::disk('public')->delete($track->local_cover_path);
        }

        $track->delete();

        Dialog::toast('Canción eliminada de la biblioteca.');

        return redirect()->back();
    }

    public function updateDuration(Request $request, Track $track)
    {
        $request->validate([
            'duration' => ['required', 'integer', 'min:1'],
        ]);

        $track->update(['duration' => $request->integer('duration')]);

        return response()->noContent();
    }

    public function streamCover(Track $track)
    {
        if (! $track->local_cover_path) {
            abort(404, 'No cover art available.');
        }

        $filePath = Storage::disk('public')->path($track->local_cover_path);

        if (! file_exists($filePath)) {
            abort(404, 'Cover art file not found.');
        }

        return response()->file($filePath, [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    public function streamAudio(Track $track)
    {
        $filePath = Storage::disk('public')->path($track->local_audio_path);

        if (! file_exists($filePath)) {
            // Fallback for older tracks before storage moved
            $filePath = Storage::disk('local')->path($track->local_audio_path);
            if (! file_exists($filePath)) {
                abort(404, 'Audio file not found.');
            }
        }

        $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));

        $mimeType = match ($extension) {
            'mp3' => 'audio/mpeg',
            'm4a' => 'audio/mp4',
            'flac' => 'audio/flac',
            'wav' => 'audio/wav',
            'ogg' => 'audio/ogg',
            'aac' => 'audio/aac',
            'wma' => 'audio/x-ms-wma',
            'opus' => 'audio/opus',
            default => mime_content_type($filePath) ?: 'application/octet-stream',
        };

        return response()->file($filePath, [
            'Content-Type' => $mimeType,
            'Cache-Control' => 'no-cache, must-revalidate',
        ]);
    }

    public function applyMetadata(Request $request, Track $track): JsonResponse
    {
        $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'artist' => ['required', 'string', 'max:255'],
            'album' => ['nullable', 'string', 'max:255'],
            'cover_url' => ['nullable', 'url', 'max:500'],
            'cover_data' => ['nullable', 'string'],
        ]);

        $localCoverPath = $this->storeCoverArt(
            $track,
            $request->string('cover_data')->toString(),
        );

        $track->update([
            'title' => $request->input('title'),
            'artist' => $request->input('artist'),
            'album' => $request->input('album'),
            'local_cover_path' => $localCoverPath,
            'remote_cover_url' => $request->input('cover_url'),
        ]);

        return response()->json($track->fresh());
    }

    private function storeCoverArt(Track $track, string $coverData): ?string
    {
        if ($coverData === '') {
            return $track->local_cover_path;
        }

        if (! preg_match('/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/', $coverData, $matches)) {
            return $track->local_cover_path;
        }

        $decoded = base64_decode($matches[1], true);

        if ($decoded === false) {
            return $track->local_cover_path;
        }

        return $this->saveCoverArt(
            $track->youtube_id ?: 'track_'.$track->id,
            $decoded,
        ) ?? $track->local_cover_path;
    }

    private function saveCoverArt(string $trackId, string $imageData): ?string
    {
        try {
            $image = @imagecreatefromstring($imageData);

            if ($image === false) {
                return null;
            }

            $width = imagesx($image);
            $height = imagesy($image);
            $maxDimension = 600;

            if ($width > $maxDimension || $height > $maxDimension) {
                $ratio = min($maxDimension / $width, $maxDimension / $height);
                $newWidth = (int) round($width * $ratio);
                $newHeight = (int) round($height * $ratio);
                $resized = imagecreatetruecolor($newWidth, $newHeight);
                imagecopyresampled($resized, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
                imagedestroy($image);
                $image = $resized;
            }

            Storage::disk('public')->makeDirectory('covers');

            $relativePath = 'covers/'.$trackId.'.jpg';
            $fullPath = Storage::disk('public')->path($relativePath);
            imagejpeg($image, $fullPath, 88);
            imagedestroy($image);

            return $relativePath;
        } catch (\Throwable) {
            return null;
        }
    }
}
