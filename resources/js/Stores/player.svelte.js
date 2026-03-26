import WaveSurfer from 'wavesurfer.js';

const isAndroid = typeof window !== 'undefined' && !!window.AndroidBridge;

let ws = null;
let fallbackAudio = null;
let containerEl = null;
let currentObjectUrl = null;
let nativePollingInterval = null;
let isDragging = false;

// Unified reactive state
export const playerState = $state({
    currentTrack: null,
    isPlaying: false,
    progress: 0,
    duration: 0,
    isLoading: false,
    hasWaveform: false,
});

export function setContainer(el) {
    containerEl = el;
}

export function removeContainer(el) {
    if (containerEl === el) {
        containerEl = null;
    }
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
                });

                ws.setVolume(0);

                ws.on('ready', () => {
                    playerState.isLoading = false;
                    playerState.hasWaveform = true;
                });

                ws.on('interaction', (newTime) => {
                    isDragging = false;
                    if (fallbackAudio) {
                        fallbackAudio.currentTime = newTime;
                    }
                });

                ws.on('drag', () => {
                    isDragging = true;
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
            
            if (!isAndroid && ws && playerState.hasWaveform && !isDragging) {
                ws.setTime(pos);
            }
        }

        const nativeDuration = window.AndroidBridge.getAudioDuration();
        if (nativeDuration > 0 && playerState.duration === 0) {
            playerState.duration = nativeDuration;
            if (!track.duration) {
                persistDuration(track.id, Math.round(nativeDuration));
            }
        }
    }, 100);
}

function attachFallbackListeners(audio, track) {
    playerState.isLoading = false;
    playerState.hasWaveform = false;

    audio.addEventListener('loadedmetadata', () => {
        playerState.duration = audio.duration;
        if (!track.duration && playerState.duration > 0) {
            persistDuration(track.id, Math.round(playerState.duration));
        }
    });
    audio.addEventListener('timeupdate', () => { playerState.progress = audio.currentTime; });
    audio.addEventListener('play', () => { playerState.isPlaying = true; });
    audio.addEventListener('pause', () => { playerState.isPlaying = false; });
    audio.addEventListener('ended', () => { playerState.isPlaying = false; playerState.progress = 0; });
}

function setupNativeListeners() {
    if (window._nativeAudioListenerBound) return;
    
    document.addEventListener("native-audio-ended", () => {
        playerState.isPlaying = false;
        playerState.progress = 0;
        if (ws) ws.setTime(0);
    });
    
    window._nativeAudioListenerBound = true;
}

export function togglePlay() {
    console.log("⏯️ togglePlay clicked");
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
    console.log("🧨 destroy() called");
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
}

async function persistDuration(trackId, seconds) {
    try {
        await window.axios.patch(`/tracks/${trackId}/duration`, { duration: seconds });
    } catch {
        // Silent
    }
}
