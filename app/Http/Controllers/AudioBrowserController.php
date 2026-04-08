<?php

namespace App\Http\Controllers;

use App\Models\Track;
use getID3;
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
        Storage::disk('public')->makeDirectory('covers');

        $getID3 = new getID3;

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

            // Extract metadata with getID3
            $metadata = $this->extractMetadata($getID3, $destination);

            $trackId = 'loc_'.uniqid('', true);
            $coverPath = null;

            // Extract and save cover art
            if ($metadata['cover_data']) {
                $coverPath = $this->saveCoverArt($trackId, $metadata['cover_data']);
            }

            Track::create([
                'youtube_id' => $trackId,
                'title' => $metadata['title'] ?: pathinfo($filename, PATHINFO_FILENAME),
                'artist' => $metadata['artist'] ?: 'Local Library',
                'local_audio_path' => 'tracks/'.$safeName,
                'local_cover_path' => $coverPath,
                'duration' => $metadata['duration'],
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

    private function extractMetadata(getID3 $getID3, string $filePath): array
    {
        $result = [
            'title' => null,
            'artist' => null,
            'duration' => null,
            'cover_data' => null,
        ];

        try {
            $info = $getID3->analyze($filePath);

            // Duration
            if (! empty($info['playtime_seconds'])) {
                $result['duration'] = (int) round($info['playtime_seconds']);
            }

            // Title and artist from tags (ID3v2, vorbiscomment, quicktime, etc.)
            $tags = $info['tags'] ?? [];
            foreach (['id3v2', 'vorbiscomment', 'quicktime', 'id3v1'] as $tagType) {
                if (isset($tags[$tagType])) {
                    $result['title'] = $result['title'] ?: ($tags[$tagType]['title'][0] ?? null);
                    $result['artist'] = $result['artist'] ?: ($tags[$tagType]['artist'][0] ?? null);
                }
            }

            // Cover art from ID3v2 APIC
            if (! empty($info['id3v2']['APIC'][0]['data'])) {
                $result['cover_data'] = $info['id3v2']['APIC'][0]['data'];
            }
            // Fallback: comments.picture (covers many formats)
            elseif (! empty($info['comments']['picture'][0]['data'])) {
                $result['cover_data'] = $info['comments']['picture'][0]['data'];
            }
        } catch (\Throwable) {
            // Silent — metadata extraction is best-effort
        }

        return $result;
    }

    private function saveCoverArt(string $trackId, string $imageData): ?string
    {
        try {
            $image = @imagecreatefromstring($imageData);
            if ($image === false) {
                return null;
            }

            // Resize to max 500x500
            $width = imagesx($image);
            $height = imagesy($image);
            $maxDim = 500;

            if ($width > $maxDim || $height > $maxDim) {
                $ratio = min($maxDim / $width, $maxDim / $height);
                $newWidth = (int) round($width * $ratio);
                $newHeight = (int) round($height * $ratio);
                $resized = imagecreatetruecolor($newWidth, $newHeight);
                imagecopyresampled($resized, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
                imagedestroy($image);
                $image = $resized;
            }

            $relativePath = 'covers/'.$trackId.'.jpg';
            $fullPath = Storage::disk('public')->path($relativePath);
            imagejpeg($image, $fullPath, 85);
            imagedestroy($image);

            return $relativePath;
        } catch (\Throwable) {
            return null;
        }
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
