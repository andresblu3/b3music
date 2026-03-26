<?php

use App\Models\Track;

it('casts is_downloaded to boolean', function () {
    $track = Track::factory()->create(['is_downloaded' => 1]);

    expect($track->is_downloaded)->toBeTrue();
});

it('casts duration to integer', function () {
    $track = Track::factory()->create(['duration' => '240']);

    expect($track->duration)->toBeInt();
});
