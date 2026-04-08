<?php

namespace App\Models;

use Database\Factories\TrackFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Track extends Model
{
    /** @use HasFactory<TrackFactory> */
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'youtube_id',
        'title',
        'artist',
        'album',
        'local_audio_path',
        'local_cover_path',
        'remote_cover_url',
        'duration',
        'is_downloaded',
        'source_path',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_downloaded' => 'boolean',
            'duration' => 'integer',
        ];
    }
}
