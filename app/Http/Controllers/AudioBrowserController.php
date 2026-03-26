<?php

namespace App\Http\Controllers;

use App\Models\Track;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Native\Mobile\Facades\Dialog;

class AudioBrowserController extends Controller
{
    private const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'wma', 'opus'];

    private const SCAN_DIRECTORIES = [
        '/storage/emulated/0/Music',
        '/storage/emulated/0/Download',
        '/storage/emulated/0/Documents',
        '/storage/emulated/0/DCIM',
        '/storage/emulated/0/Recordings',
        '/storage/emulated/0/Podcasts',
    ];

    public function index()
    {
        $files = $this->scanForAudioFiles();

        // Get already imported paths to mark them
        $importedPaths = Track::query()
            ->whereNotNull('source_path')
            ->pluck('source_path')
            ->toArray();

        return Inertia::render('AudioBrowser/Index', [
            'files' => $files,
            'importedPaths' => $importedPaths,
        ]);
    }

    public function import(Request $request)
    {
        $request->validate([
            'paths' => ['required', 'array', 'min:1'],
            'paths.*' => ['required', 'string'],
        ]);

        $paths = $request->input('paths');
        $count = 0;

        Storage::disk('public')->makeDirectory('tracks');

        foreach ($paths as $nativePath) {
            if (! file_exists($nativePath)) {
                continue;
            }

            // Skip if already imported
            if (Track::where('source_path', $nativePath)->exists()) {
                continue;
            }

            $filename = basename($nativePath);
            $extension = pathinfo($filename, PATHINFO_EXTENSION) ?: 'mp3';
            $safeName = uniqid().'_'.preg_replace('/[^A-Za-z0-9_\-]/', '_', pathinfo($filename, PATHINFO_FILENAME)).'.'.$extension;
            $destination = Storage::disk('public')->path('tracks/'.$safeName);

            if (! copy($nativePath, $destination)) {
                continue;
            }

            Track::create([
                'youtube_id' => 'loc_'.uniqid('', true),
                'title' => pathinfo($filename, PATHINFO_FILENAME),
                'artist' => 'Local Library',
                'local_audio_path' => 'tracks/'.$safeName,
                'source_path' => $nativePath,
                'is_downloaded' => true,
            ]);
            $count++;
        }

        if ($count > 0) {
            Dialog::toast("Imported {$count} track".($count > 1 ? 's' : '').'.');
        } else {
            Dialog::toast('No new tracks to import.');
        }

        return redirect()->route('tracks.index');
    }

    private function scanForAudioFiles(): array
    {
        $files = [];

        foreach (self::SCAN_DIRECTORIES as $directory) {
            if (! is_dir($directory)) {
                continue;
            }

            $this->scanDirectory($directory, $files, 0);
        }

        // Sort by filename
        usort($files, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $files;
    }

    private function scanDirectory(string $path, array &$files, int $depth): void
    {
        // Limit recursion depth to avoid scanning too deep
        if ($depth > 3) {
            return;
        }

        $entries = @scandir($path);
        if ($entries === false) {
            return;
        }

        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }

            $fullPath = $path.'/'.$entry;

            if (is_dir($fullPath)) {
                $this->scanDirectory($fullPath, $files, $depth + 1);

                continue;
            }

            $extension = strtolower(pathinfo($entry, PATHINFO_EXTENSION));

            if (! in_array($extension, self::AUDIO_EXTENSIONS)) {
                continue;
            }

            $size = @filesize($fullPath);

            $files[] = [
                'name' => pathinfo($entry, PATHINFO_FILENAME),
                'filename' => $entry,
                'path' => $fullPath,
                'extension' => $extension,
                'size' => $size ?: 0,
                'folder' => basename(dirname($fullPath)),
            ];
        }
    }
}
