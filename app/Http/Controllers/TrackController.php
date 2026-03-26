<?php

namespace App\Http\Controllers;

use App\Models\Track;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Native\Mobile\Facades\Dialog;
use Symfony\Component\HttpFoundation\StreamedResponse;

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
            $safeName = uniqid() . '_' . preg_replace('/[^A-Za-z0-9_\-]/', '_', pathinfo($filename, PATHINFO_FILENAME)) . '.' . $extension;
            
            $path = $file->storeAs('tracks', $safeName, 'local');

            $duration = isset($durations[$index]) ? (int) $durations[$index] : 0;

            Track::create([
                'youtube_id' => 'loc_' . uniqid('', true),
                'title' => pathinfo($filename, PATHINFO_FILENAME),
                'artist' => 'Local Library',
                'local_audio_path' => $path,
                'is_downloaded' => true,
                'duration' => $duration > 0 ? $duration : null,
            ]);
            $count++;
        }

        Dialog::toast("Successfully synced {$count} tracks.");

        return redirect()->back();
    }

    public function destroy(Track $track)
    {
        if ($track->local_audio_path) {
            Storage::disk('local')->delete($track->local_audio_path);
        }
        
        $track->delete();

        Dialog::toast("Track removed from library.");

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
}
