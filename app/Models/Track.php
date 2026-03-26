<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Track extends Model
{
    /** @use HasFactory<\Database\Factories\TrackFactory> */
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'youtube_id',
        'title',
        'artist',
        'local_audio_path',
        'local_cover_path',
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
