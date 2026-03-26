<?php

namespace Database\Seeders;

use App\Models\Track;
use Illuminate\Database\Seeder;

class TrackSeeder extends Seeder
{
    public function run(): void
    {
        Track::factory()->count(15)->create();
    }
}
