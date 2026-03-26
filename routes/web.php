<?php

use App\Http\Controllers\AudioBrowserController;
use App\Http\Controllers\TrackController;
use Illuminate\Support\Facades\Route;

Route::get('/', [TrackController::class, 'index'])->name('tracks.index');
Route::post('/tracks', [TrackController::class, 'store'])->name('tracks.store');
Route::delete('/tracks/{track}', [TrackController::class, 'destroy'])->name('tracks.destroy');
Route::get('/tracks/{track}/stream', [TrackController::class, 'streamAudio'])->name('tracks.stream');
Route::patch('/tracks/{track}/duration', [TrackController::class, 'updateDuration'])->name('tracks.updateDuration');

Route::get('/audio-browser', [AudioBrowserController::class, 'index'])->name('audio-browser.index');
Route::post('/audio-browser/import', [AudioBrowserController::class, 'import'])->name('audio-browser.import');

