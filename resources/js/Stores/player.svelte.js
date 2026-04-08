import WaveSurfer from 'wavesurfer.js';
import { showToast } from './toast.svelte.js';

const isAndroid = typeof window !== 'undefined' && !!window.AndroidBridge;

let ws = null;
let fallbackAudio = null;
let containerEl = null;
let currentObjectUrl = null;
let nativePollingInterval = null;
let isDragging = false;
const durationCache = new Map();

// Queue state (module-level, not reactive — only exposed via playerState)
let queue = [];
let shuffledIndices = [];
let currentIndex = -1;

// Unified reactive state
export const playerState = $state({
    currentTrack: null,
    isPlaying: false,
    progress: 0,
    duration: 0,
    isLoading: false,
    hasWaveform: false,
    shuffle: false,
    repeat: 'off',
});

// Restore player state after full page reload (Android WebView can cause these)
if (isAndroid && typeof sessionStorage !== 'undefined') {
    try {
        const isNativePlaying = window.AndroidBridge?.isPlaying();
        const saved = sessionStorage.getItem('playerTrack');
        if (isNativePlaying && saved) {
            const track = JSON.parse(saved);
            playerState.currentTrack = track;
            playerState.isPlaying = true;
            playerState.duration = track.duration || 0;
            startNativePolling(track);
        }
    } catch { /* silent */ }
}

export function getCachedDuration(trackId) {
    return durationCache.get(trackId) ?? null;
}

/**
 * Update metadata on the currently playing track without interrupting playback.
 * Called when the user applies metadata (cover, title, artist) from the modal.
 */
export function updateCurrentTrackMetadata(updatedTrack) {
    if (playerState.currentTrack && playerState.currentTrack.id === updatedTrack.id) {
        playerState.currentTrack = {
            ...playerState.currentTrack,
            title: updatedTrack.title,
            artist: updatedTrack.artist,
            local_cover_path: updatedTrack.local_cover_path,
            remote_cover_url: updatedTrack.remote_cover_url,
            coverVersion: Date.now(),
        };
        // Also update sessionStorage for recovery
        try {
            sessionStorage.setItem('playerTrack', JSON.stringify({
                id: playerState.currentTrack.id,
                title: updatedTrack.title,
                artist: updatedTrack.artist,
                duration: playerState.currentTrack.duration,
                local_audio_path: playerState.currentTrack.local_audio_path,
                local_cover_path: updatedTrack.local_cover_path || null,
            }));
        } catch { /* silent */ }
    }

    // Also update the track in the queue
    const queueIdx = queue.findIndex(t => t.id === updatedTrack.id);
    if (queueIdx !== -1) {
        queue[queueIdx] = { ...queue[queueIdx], ...updatedTrack };
    }
}

export function setContainer(el) {
    containerEl = el;
}

export function removeContainer(el) {
    if (containerEl === el) {
        containerEl = null;
    }
}

// --- Queue helpers ---

function generateShuffledIndices(length, pinIndex) {
    const indices = Array.from({ length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    // Pin the current track at position 0 so it doesn't skip
    const pos = indices.indexOf(pinIndex);
    if (pos > 0) {
        [indices[0], indices[pos]] = [indices[pos], indices[0]];
    }
    return indices;
}

function resolveIndex(idx) {
    if (playerState.shuffle && shuffledIndices.length > 0) {
        return shuffledIndices[idx];
    }
    return idx;
}

// --- Public API ---

export function setQueue(tracks, startIndex) {
    queue = [...tracks];
    currentIndex = startIndex;

    if (playerState.shuffle) {
        shuffledIndices = generateShuffledIndices(queue.length, startIndex);
        // In shuffle mode, currentIndex maps through shuffledIndices.
        // Pin the start track at shuffle position 0.
        currentIndex = 0;
    }

    playTrack(queue[resolveIndex(currentIndex)]);
}

export function playNext() {
    if (queue.length === 0) return;

    // Repeat one: restart current track
    if (playerState.repeat === 'one') {
        seek(0);
        if (isAndroid && window.AndroidBridge) {
            window.AndroidBridge.resumeAudio();
            playerState.isPlaying = true;
        } else if (fallbackAudio) {
            fallbackAudio.play().catch(() => {});
        }
        return;
    }

    const nextIdx = currentIndex + 1;

    if (nextIdx >= queue.length) {
        if (playerState.repeat === 'all') {
            // Re-shuffle if needed, then wrap
            if (playerState.shuffle) {
                shuffledIndices = generateShuffledIndices(queue.length, resolveIndex(currentIndex));
            }
            currentIndex = 0;
        } else {
            // End of queue, no repeat — stop
            playerState.isPlaying = false;
            playerState.progress = 0;
            if (ws) ws.setTime(0);
            return;
        }
    } else {
        currentIndex = nextIdx;
    }

    playTrack(queue[resolveIndex(currentIndex)]);
}

export function playPrev() {
    if (queue.length === 0) return;

    // If more than 3 seconds in, restart current track
    if (playerState.progress > 3) {
        seek(0);
        return;
    }

    const prevIdx = currentIndex - 1;

    if (prevIdx < 0) {
        if (playerState.repeat === 'all') {
            currentIndex = queue.length - 1;
        } else {
            seek(0);
            return;
        }
    } else {
        currentIndex = prevIdx;
    }

    playTrack(queue[resolveIndex(currentIndex)]);
}

export function toggleShuffle() {
    playerState.shuffle = !playerState.shuffle;

    if (playerState.shuffle && queue.length > 0) {
        const realIndex = resolveIndex(currentIndex);
        shuffledIndices = generateShuffledIndices(queue.length, realIndex);
        currentIndex = 0; // Current track pinned at 0
    } else if (!playerState.shuffle && queue.length > 0) {
        // Restore real index
        const realIndex = resolveIndex(currentIndex);
        currentIndex = realIndex;
        shuffledIndices = [];
    }

    showToast(
        playerState.shuffle ? 'Aleatorio activado' : 'Aleatorio desactivado',
        playerState.shuffle ? '🔀' : null,
    );
}

export function toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const next = modes[(modes.indexOf(playerState.repeat) + 1) % modes.length];
    playerState.repeat = next;

    const labels = { off: 'Repetir desactivado', all: 'Repetir todo', one: 'Repetir una' };
    const icons = { off: null, all: '🔁', one: '🔂' };
    showToast(labels[next], icons[next]);
}

export function playTrack(track) {
    console.log("▶️ playTrack called with track:", track.id);
    destroy();

    playerState.currentTrack = track;
    playerState.isLoading = true;
    playerState.isPlaying = false;
    playerState.progress = 0;
    playerState.duration = track.duration || 0;
    playerState.hasWaveform = false;

    // Persist for recovery after full page reloads
    try {
        sessionStorage.setItem('playerTrack', JSON.stringify({
            id: track.id, title: track.title, artist: track.artist,
            duration: track.duration, local_audio_path: track.local_audio_path,
            local_cover_path: track.local_cover_path || null,
        }));
    } catch { /* silent */ }

    // 1. Kick off audio playback
    if (isAndroid) {
        if (!track.local_audio_path) {
            console.error("Track has no local_audio_path, cannot play on Android");
            playerState.isLoading = false;
            return;
        }
        console.log("🌉 AndroidBridge detected, playing from file:", track.local_audio_path);
        window.AndroidBridge.playAudio(track.local_audio_path);
        playerState.isLoading = false;
        startNativePolling(track);
    } else {
        fallbackAudio = new Audio(`/tracks/${track.id}/stream`);
        fallbackAudio.play().catch(e => console.warn("Fallback play blocked", e));
        attachFallbackListeners(fallbackAudio, track);
    }

    // 2. Hydrate Visual Waveform (non-Android only)
    if (!isAndroid && containerEl) {
        window.axios.get(`/tracks/${track.id}/stream`, {
            responseType: 'blob'
        }).then(response => {
            // Guard against container being detached during async fetch
            if (!containerEl || !containerEl.isConnected) {
                playerState.isLoading = false;
                return;
            }

            currentObjectUrl = URL.createObjectURL(response.data);

            try {
                ws = WaveSurfer.create({
                    container: containerEl,
                    url: currentObjectUrl,
                    waveColor: 'rgba(255, 255, 255, 0.15)',
                    progressColor: '#a855f7',
                    cursorColor: 'transparent',
                    barWidth: 2,
                    barGap: 1,
                    barRadius: 2,
                    normalize: true,
                    hideScrollbar: true,
                    height: 48,
                    dragToSeek: true,
                });

                ws.setVolume(0);

                ws.on('ready', () => {
                    playerState.isLoading = false;
                    playerState.hasWaveform = true;
                });

                ws.on('interaction', (newTime) => {
                    isDragging = false;
                    if (isAndroid && window.AndroidBridge) {
                        window.AndroidBridge.seekAudio(newTime);
                        playerState.progress = newTime;
                    } else if (fallbackAudio) {
                        fallbackAudio.currentTime = newTime;
                    }
                });

                ws.on('drag', () => {
                    isDragging = true;
                });

                ws.on('dragstart', () => {
                    isDragging = true;
                });

                ws.on('dragend', () => {
                    isDragging = false;
                });

                return;
            } catch (err) {
                console.error('WaveSurfer creation failed:', err);
            }
        }).catch(err => {
            console.error('Blob fetch failed for visualizer:', err);
            playerState.isLoading = false;
        });
    } else if (!isAndroid) {
        playerState.isLoading = false;
    }

    setupNativeListeners();
}

function startNativePolling(track) {
    if (nativePollingInterval) clearInterval(nativePollingInterval);

    nativePollingInterval = setInterval(() => {
        if (!window.AndroidBridge) return;

        const currentlyPlaying = window.AndroidBridge.isPlaying();
        playerState.isPlaying = currentlyPlaying;

        if (currentlyPlaying || playerState.progress > 0) {
            const pos = window.AndroidBridge.getAudioPosition();
            playerState.progress = pos;

            if (ws && playerState.hasWaveform && !isDragging) {
                ws.setTime(pos);
            }
        }

        const nativeDuration = window.AndroidBridge.getAudioDuration();
        if (nativeDuration > 0 && playerState.duration === 0) {
            playerState.duration = nativeDuration;
            durationCache.set(track.id, nativeDuration);
            if (!track.duration) {
                persistDuration(track.id, Math.round(nativeDuration));
            }
        }
    }, 100);
}

function attachFallbackListeners(audio, track) {
    playerState.hasWaveform = false;

    audio.addEventListener('loadedmetadata', () => {
        playerState.duration = audio.duration;
        durationCache.set(track.id, audio.duration);
        if (!track.duration && playerState.duration > 0) {
            persistDuration(track.id, Math.round(playerState.duration));
        }
    });
    audio.addEventListener('timeupdate', () => { playerState.progress = audio.currentTime; });
    audio.addEventListener('play', () => { playerState.isPlaying = true; });
    audio.addEventListener('pause', () => { playerState.isPlaying = false; });
    audio.addEventListener('ended', () => { playNext(); });
}

function setupNativeListeners() {
    if (window._nativeAudioListenerBound) return;

    document.addEventListener("native-audio-ended", () => {
        playNext();
    });

    window._nativeAudioListenerBound = true;
}

export function togglePlay() {
    if (window.AndroidBridge) {
        if (playerState.isPlaying) {
            window.AndroidBridge.pauseAudio();
            playerState.isPlaying = false;
        } else {
            window.AndroidBridge.resumeAudio();
            playerState.isPlaying = true;
        }
    } else if (fallbackAudio) {
        if (fallbackAudio.paused) {
            fallbackAudio.play().catch(() => {});
        } else {
            fallbackAudio.pause();
        }
    }
}

export function seek(time) {
    if (window.AndroidBridge) {
        window.AndroidBridge.seekAudio(time);
        playerState.progress = time;
        if (ws) ws.setTime(time);
    } else if (fallbackAudio) {
        fallbackAudio.currentTime = time;
        playerState.progress = time;
    }
}

function destroy() {
    if (window.AndroidBridge) {
        window.AndroidBridge.destroyAudio();
    }
    if (nativePollingInterval) {
        clearInterval(nativePollingInterval);
        nativePollingInterval = null;
    }
    if (ws) {
        try { ws.destroy(); } catch {}
        ws = null;
    }
    if (fallbackAudio) {
        fallbackAudio.pause();
        fallbackAudio.src = '';
        fallbackAudio = null;
    }
    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }
    playerState.hasWaveform = false;
}

export function destroyPlayer() {
    destroy();
    playerState.currentTrack = null;
    playerState.isPlaying = false;
    playerState.progress = 0;
    playerState.duration = 0;
    try { sessionStorage.removeItem('playerTrack'); } catch { /* silent */ }
}

async function persistDuration(trackId, seconds) {
    try {
        await window.axios.patch(`/tracks/${trackId}/duration`, { duration: seconds });
    } catch {
        // Silent
    }
}
