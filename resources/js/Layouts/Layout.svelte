<script>
    import {
        playerState as player,
        togglePlay,
        setContainer,
        seek,
        playNext,
        playPrev,
        toggleShuffle,
        toggleRepeat,
    } from "../Stores/player.svelte.js";
    import { toastState } from "../Stores/toast.svelte.js";
    import { fly } from "svelte/transition";

    let { children } = $props();

    const isAndroid = typeof window !== "undefined" && !!window.AndroidBridge;

    // $derived bridges cross-module $state reactivity
    let currentTrack = $derived(player.currentTrack);
    let isPlaying = $derived(player.isPlaying);
    let isLoading = $derived(player.isLoading);
    let progress = $derived(player.progress);
    let duration = $derived(player.duration);
    let hasWaveform = $derived(player.hasWaveform);
    let shuffle = $derived(player.shuffle);
    let repeat = $derived(player.repeat);
    let progressPct = $derived(duration > 0 ? (progress / duration) * 100 : 0);
    let remainingTime = $derived(duration > 0 ? duration - progress : 0);

    // Drag-to-seek state for Android progress bar
    let dragging = $state(false);

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) {
            return "0:00";
        }
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    function waveformAction(node) {
        setContainer(node);
        return {
            destroy() {
                setTimeout(() => {
                    import("../Stores/player.svelte.js").then((m) => {
                        m.removeContainer(node);
                    });
                }, 0);
            },
        };
    }

    function startDrag(e) {
        dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFromPointer(e);
    }

    function onDrag(e) {
        if (!dragging) return;
        seekFromPointer(e);
    }

    function endDrag() {
        dragging = false;
    }

    function seekFromPointer(e) {
        if (!duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const fraction = Math.max(
            0,
            Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        seek(fraction * duration);
    }
</script>

<div
    class="flex min-h-screen flex-col bg-[#050505] text-gray-100 selection:bg-purple-500/30 font-instrument-sans pt-[max(env(safe-area-inset-top),1rem)]"
>
    <main class="flex-1 overflow-y-auto pb-48">
        {@render children()}
    </main>

    <div
        class="fixed inset-x-0 bottom-0 z-50 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style="transform: translateY({currentTrack ? '0' : '120%'}); opacity: {currentTrack ? '1' : '0'}; pointer-events: {currentTrack ? 'auto' : 'none'};"
        aria-hidden={!currentTrack}
    >
        <!-- Ambient glow behind bar -->
        {#if isPlaying}
            <div
                class="absolute inset-x-4 -bottom-2 h-16 rounded-3xl bg-purple-500/8 blur-2xl transition-opacity duration-1000"
            ></div>
        {/if}

        <div
            class="relative mx-auto max-w-md overflow-hidden rounded-2xl bg-black/60 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-black/40"
            style="border: 1px solid {isPlaying ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.05)'}; transition: border-color 0.5s;"
        >
            <!-- Row 1: Track Info -->
            <div class="flex items-center gap-3 px-4 pt-3">
                <!-- Artwork -->
                <div
                    class="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 shadow-inner"
                    style="animation: {isPlaying && (currentTrack?.local_cover_path || currentTrack?.remote_cover_url) ? 'spin 20s linear infinite' : 'none'}; border-radius: {(currentTrack?.local_cover_path || currentTrack?.remote_cover_url) ? '9999px' : '0.75rem'};"
                >
                    {#if currentTrack?.local_cover_path}
                        <img
                            src="/tracks/{currentTrack.id}/cover{currentTrack.coverVersion ? `?v=${currentTrack.coverVersion}` : ''}"
                            alt=""
                            class="h-full w-full object-cover"
                        />
                    {:else if currentTrack?.remote_cover_url}
                        <img
                            src={currentTrack.remote_cover_url}
                            alt=""
                            class="h-full w-full object-cover"
                        />
                    {:else}
                        <div
                            class="flex h-full w-full items-center justify-center text-white/20"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-5 w-5"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M19.952 1.651a.75.75 0 01.298.599V16.303a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V6.994l-9 2.572v9.737a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.402-4.909l2.31-.66a1.5 1.5 0 001.088-1.442V9.017 5.25a.75.75 0 01.544-.721l10.5-3a.75.75 0 01.658.122z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </div>
                    {/if}
                </div>

                <!-- Title + Artist (animated on track change) -->
                <div class="min-w-0 flex-1">
                    {#key currentTrack?.id}
                        <div in:fly={{ x: 20, duration: 300 }}>
                            <p
                                class="truncate text-sm font-semibold tracking-tight text-white/90"
                            >
                                {currentTrack?.title || ""}
                            </p>
                            <p class="truncate text-[11px] font-medium text-white/40">
                                {currentTrack?.artist || "Unknown Artist"}
                            </p>
                        </div>
                    {/key}
                </div>
            </div>

            <!-- Row 2: Waveform / Progress -->
            <div class="relative px-4 pt-2">
                {#if isAndroid}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="relative h-2 w-full cursor-pointer rounded-full bg-white/10 my-2 touch-none"
                        onpointerdown={startDrag}
                        onpointermove={onDrag}
                        onpointerup={endDrag}
                        onpointercancel={endDrag}
                    >
                        <div
                            class="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400"
                            class:transition-[width]={!dragging}
                            class:duration-100={!dragging}
                            class:ease-linear={!dragging}
                            style="width: {progressPct}%"
                        ></div>
                        <!-- Glowing thumb -->
                        <div
                            class="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_8px_rgba(168,85,247,0.6)]"
                            class:transition-[left]={!dragging}
                            class:duration-100={!dragging}
                            class:ease-linear={!dragging}
                            style="left: calc({progressPct}% - 7px)"
                        ></div>
                    </div>
                {:else}
                    <div
                        use:waveformAction
                        class="w-full transition-opacity duration-300"
                        class:opacity-0={!hasWaveform}
                        class:opacity-100={hasWaveform}
                    ></div>
                {/if}
                <!-- Loading overlay -->
                {#if isLoading}
                    <div
                        class="absolute inset-0 flex items-center justify-center"
                    >
                        <div
                            class="h-5 w-5 animate-spin rounded-full border-2 border-purple-400 border-t-transparent"
                        ></div>
                    </div>
                {/if}
            </div>

            <!-- Row 3: Time Labels -->
            <div class="flex items-center justify-between px-4 pt-1">
                <span
                    class="text-[10px] font-medium tabular-nums text-white/40"
                >
                    {formatTime(progress)}
                </span>
                <span
                    class="text-[10px] font-medium tabular-nums text-white/40"
                >
                    -{formatTime(remainingTime)}
                </span>
            </div>

            <!-- Row 4: Transport Controls -->
            <div class="flex items-center justify-center gap-6 px-4 pb-3 pt-1">
                <!-- Shuffle -->
                <button
                    type="button"
                    class="relative flex h-8 w-8 items-center justify-center transition-all duration-200 active:scale-90 {shuffle
                        ? 'text-purple-400 drop-shadow-[0_0_6px_#a855f7]'
                        : 'text-white/30'}"
                    onclick={toggleShuffle}
                    aria-label="Toggle Shuffle"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"
                        />
                    </svg>
                    {#if shuffle}
                        <span
                            class="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-purple-400"
                        ></span>
                    {/if}
                </button>

                <!-- Previous -->
                <button
                    type="button"
                    class="flex h-10 w-10 items-center justify-center text-white/70 transition-all active:scale-90 active:text-white"
                    onclick={playPrev}
                    aria-label="Previous Track"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M9.195 18.44c1.25.714 2.805-.189 2.805-1.629v-2.34l6.945 3.968c1.25.715 2.805-.188 2.805-1.628V7.19c0-1.44-1.555-2.343-2.805-1.628L12 9.53v-2.34c0-1.44-1.555-2.343-2.805-1.628l-7.108 4.061c-1.26.72-1.26 2.536 0 3.256l7.108 4.061z"
                        />
                    </svg>
                </button>

                <!-- Play/Pause -->
                <button
                    type="button"
                    class="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-black transition-all active:scale-90 shadow-[0_4px_20px_rgba(255,255,255,0.2)]"
                    onclick={togglePlay}
                    aria-label="Toggle Play"
                >
                    {#if isPlaying}
                        <div class="absolute inset-0 rounded-full animate-[pulse_2s_ease-in-out_infinite] ring-2 ring-purple-400/20"></div>
                    {/if}
                    {#if isPlaying}
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-6 w-6"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    {:else}
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="ml-0.5 h-6 w-6"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    {/if}
                </button>

                <!-- Next -->
                <button
                    type="button"
                    class="flex h-10 w-10 items-center justify-center text-white/70 transition-all active:scale-90 active:text-white"
                    onclick={playNext}
                    aria-label="Next Track"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M5.055 7.06C3.805 6.347 2.25 7.25 2.25 8.69v6.62c0 1.44 1.555 2.343 2.805 1.628L12 13.471v2.34c0 1.44 1.555 2.343 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256l-7.108-4.061C13.555 5.346 12 6.249 12 7.689v2.34L5.055 7.061z"
                        />
                    </svg>
                </button>

                <!-- Repeat -->
                <button
                    type="button"
                    class="relative flex h-8 w-8 items-center justify-center transition-all duration-200 active:scale-90 {repeat !==
                    'off'
                        ? 'text-purple-400 drop-shadow-[0_0_6px_#a855f7]'
                        : 'text-white/30'}"
                    onclick={toggleRepeat}
                    aria-label="Toggle Repeat"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"
                        />
                    </svg>
                    {#if repeat === "one"}
                        <span
                            class="absolute -top-0.5 -right-0.5 text-[8px] font-black text-purple-400"
                            >1</span
                        >
                    {/if}
                    {#if repeat !== "off"}
                        <span
                            class="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-purple-400"
                        ></span>
                    {/if}
                </button>
            </div>
        </div>
    </div>

    <!-- Toast Notification -->
    {#if toastState.visible}
        <div
            class="fixed left-1/2 bottom-52 z-[60] -translate-x-1/2"
            transition:fly={{ y: 20, duration: 250 }}
        >
            <div
                class="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-5 py-2.5 shadow-xl backdrop-blur-xl"
            >
                {#if toastState.icon}
                    <span class="text-sm">{toastState.icon}</span>
                {/if}
                <span class="text-sm font-medium text-white/90 whitespace-nowrap">
                    {toastState.message}
                </span>
            </div>
        </div>
    {/if}
</div>
