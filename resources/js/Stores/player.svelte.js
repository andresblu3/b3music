import WaveSurfer from 'wavesurfer.js';
import { showToast } from './toast.svelte.js';

const isAndroid = typeof window !== 'undefined' && !!window.AndroidBridge;
const sessionKey = 'playerSession';

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
    queueLength: 0,
    queuePosition: 0,
    error: null,
});

if (isAndroid && typeof sessionStorage !== 'undefined') {
    restorePlayerSession();
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
            album: updatedTrack.album,
            local_cover_path: updatedTrack.local_cover_path,
            remote_cover_url: updatedTrack.remote_cover_url,
            coverVersion: Date.now(),
        };
    }

    // Also update the track in the queue
    const queueIdx = queue.findIndex(t => t.id === updatedTrack.id);
    if (queueIdx !== -1) {
        queue[queueIdx] = { ...queue[queueIdx], ...updatedTrack };
    }

    persistPlayerSession();
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

function syncQueueState() {
    playerState.queueLength = queue.length;
    playerState.queuePosition = currentIndex >= 0 && queue.length > 0 ? currentIndex + 1 : 0;
}

function getSerializableTrack(track) {
    if (!track) {
        return null;
    }

    return {
        ...track,
        coverVersion: track.coverVersion ?? null,
    };
}

function persistPlayerSession() {
    if (!isAndroid || typeof sessionStorage === 'undefined') {
        return;
    }

    if (!playerState.currentTrack && queue.length === 0) {
        sessionStorage.removeItem(sessionKey);
        return;
    }

    syncQueueState();

    sessionStorage.setItem(sessionKey, JSON.stringify({
        queue: queue.map(getSerializableTrack),
        shuffledIndices,
        currentIndex,
        player: {
            currentTrack: getSerializableTrack(playerState.currentTrack),
            duration: playerState.duration,
            shuffle: playerState.shuffle,
            repeat: playerState.repeat,
        },
    }));
}

function restorePlayerSession() {
    try {
        const saved = sessionStorage.getItem(sessionKey);

        if (!saved) {
            return;
        }

        const session = JSON.parse(saved);
        queue = Array.isArray(session.queue) ? session.queue : [];
        shuffledIndices = Array.isArray(session.shuffledIndices) ? session.shuffledIndices : [];
        currentIndex = Number.isInteger(session.currentIndex) ? session.currentIndex : -1;
        playerState.shuffle = !!session.player?.shuffle;
        playerState.repeat = ['off', 'all', 'one'].includes(session.player?.repeat)
            ? session.player.repeat
            : 'off';
        playerState.currentTrack = session.player?.currentTrack ?? null;
        playerState.duration = session.player?.duration ?? playerState.currentTrack?.duration ?? 0;
        playerState.isPlaying = !!window.AndroidBridge?.isPlaying();
        syncQueueState();

        if (playerState.currentTrack) {
            startNativePolling(playerState.currentTrack);
        }
    } catch {
        sessionStorage.removeItem(sessionKey);
    }
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

    syncQueueState();
    playTrack(queue[resolveIndex(currentIndex)]);
}

export function playNext() {
    if (queue.length === 0) {
        return;
    }

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
            if (ws) {
                ws.setTime(0);
            }

            persistPlayerSession();
            return;
        }
    } else {
        currentIndex = nextIdx;
    }

    syncQueueState();
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

    syncQueueState();
    playTrack(queue[resolveIndex(currentIndex)]);
}

export function toggleShuffle() {
    const nextShuffle = !playerState.shuffle;

    if (nextShuffle && queue.length > 0) {
        const realIndex = currentIndex >= 0 ? currentIndex : 0;
        shuffledIndices = generateShuffledIndices(queue.length, realIndex);
        currentIndex = 0; // Current track pinned at 0
    } else if (playerState.shuffle && queue.length > 0) {
        const realIndex = shuffledIndices[currentIndex] ?? currentIndex;
        currentIndex = realIndex;
        shuffledIndices = [];
    }

    playerState.shuffle = nextShuffle;
    syncQueueState();
    persistPlayerSession();

    showToast(
        playerState.shuffle ? 'Aleatorio activado' : 'Aleatorio desactivado',
        playerState.shuffle ? '🔀' : null,
    );
}

export function toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const next = modes[(modes.indexOf(playerState.repeat) + 1) % modes.length];
    playerState.repeat = next;
    persistPlayerSession();

    const labels = { off: 'Repetir desactivado', all: 'Repetir todo', one: 'Repetir una' };
    const icons = { off: null, all: '🔁', one: '🔂' };
    showToast(labels[next], icons[next]);
}

export function playTrack(track) {
    destroy();

    playerState.currentTrack = track;
    playerState.isLoading = true;
    playerState.isPlaying = false;
    playerState.progress = 0;
    playerState.duration = track.duration || 0;
    playerState.hasWaveform = false;
    playerState.error = null;
    syncQueueState();
    persistPlayerSession();

    // 1. Kick off audio playback
    if (isAndroid) {
        if (!track.local_audio_path) {
            playerState.error = 'No se encontro el archivo de audio.';
            playerState.isLoading = false;
            showToast(playerState.error);
            return;
        }
        window.AndroidBridge.playAudio(track.local_audio_path);
        playerState.isLoading = false;
        startNativePolling(track);
    } else {
        fallbackAudio = new Audio(`/tracks/${track.id}/stream`);
        fallbackAudio.play().catch(() => {
            playerState.error = 'No se pudo iniciar la reproduccion.';
            showToast(playerState.error);
        });
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
                    progressColor: '#3b82f6',
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
    audio.addEventListener('play', () => {
        playerState.isPlaying = true;
        playerState.error = null;
    });
    audio.addEventListener('pause', () => { playerState.isPlaying = false; });
    audio.addEventListener('ended', () => { playNext(); });
    audio.addEventListener('error', () => {
        playerState.error = 'No se pudo cargar este archivo.';
        showToast(playerState.error);
    });
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

    persistPlayerSession();
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
    queue = [];
    shuffledIndices = [];
    currentIndex = -1;
    playerState.currentTrack = null;
    playerState.isPlaying = false;
    playerState.progress = 0;
    playerState.duration = 0;
    playerState.error = null;
    syncQueueState();
    try {
        sessionStorage.removeItem(sessionKey);
    } catch {
        // Silent
    }
}

async function persistDuration(trackId, seconds) {
    try {
        await window.axios.patch(`/tracks/${trackId}/duration`, { duration: seconds });
    } catch {
        // Silent
    }
}
