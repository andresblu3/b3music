<script>
    import {
        playerState as player,
        togglePlay,
        setContainer,
        seek,
    } from "../Stores/player.svelte.js";

    let { children } = $props();

    const isAndroid = typeof window !== "undefined" && !!window.AndroidBridge;

    // $derived bridges cross-module $state reactivity
    let currentTrack = $derived(player.currentTrack);
    let isPlaying = $derived(player.isPlaying);
    let isLoading = $derived(player.isLoading);
    let progress = $derived(player.progress);
    let duration = $derived(player.duration);
    let hasWaveform = $derived(player.hasWaveform);
    let progressPct = $derived(duration > 0 ? (progress / duration) * 100 : 0);

    // Imperative DOM update — guaranteed reactive via $effect
    let playerBarEl;
    $effect(() => {
        if (!playerBarEl) return;
        const show = !!currentTrack;
        playerBarEl.style.transform = show
            ? "translateY(0)"
            : "translateY(120%)";
        playerBarEl.style.opacity = show ? "1" : "0";
        playerBarEl.style.pointerEvents = show ? "auto" : "none";
    });

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
</script>

<div
    class="flex min-h-screen flex-col bg-[#050505] text-gray-100 selection:bg-purple-500/30 font-instrument-sans pt-[max(env(safe-area-inset-top),1rem)]"
>
    <main class="flex-1 overflow-y-auto pb-32">
        {@render children()}
    </main>

    <div
        bind:this={playerBarEl}
        class="fixed inset-x-0 bottom-0 z-50 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style="transform: translateY(120%); opacity: 0; pointer-events: none;"
        aria-hidden={!currentTrack}
    >
        <div
            class="mx-auto max-w-md overflow-hidden rounded-2xl border border-white/5 bg-black/60 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-black/40"
        >
            <!-- Waveform / Progress -->
            <div class="relative px-3 pt-3">
                {#if isLoading}
                    <div class="flex h-12 items-center justify-center">
                        <div
                            class="h-5 w-5 animate-spin rounded-full border-2 border-purple-400 border-t-transparent"
                        ></div>
                    </div>
                {:else if isAndroid}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-white/10 my-2"
                        onclick={(e) => {
                            if (!duration) return;
                            const rect =
                                e.currentTarget.getBoundingClientRect();
                            const fraction =
                                (e.clientX - rect.left) / rect.width;
                            seek(fraction * duration);
                        }}
                    >
                        <div
                            class="h-full rounded-full bg-purple-500 transition-[width] duration-100 ease-linear"
                            style="width: {progressPct}%"
                        ></div>
                    </div>
                {:else}
                    <div
                        use:waveformAction
                        class="w-full"
                        class:opacity-0={!hasWaveform}
                        class:opacity-100={hasWaveform}
                    ></div>
                {/if}
            </div>

            <div class="flex items-center gap-4 px-3 pb-3 pt-1">
                <!-- Artwork -->
                <div
                    class="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 shadow-inner"
                >
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
                </div>

                <!-- Track Info -->
                <div class="min-w-0 flex-1">
                    <p
                        class="truncate text-sm font-semibold tracking-tight text-white/90"
                    >
                        {currentTrack?.title || ""}
                    </p>
                    <p class="truncate text-[11px] font-medium text-white/40">
                        {currentTrack?.artist || "Unknown Artist"}
                    </p>
                </div>

                <!-- Time -->
                <span
                    class="text-[10px] font-medium tabular-nums text-white/30 shrink-0"
                >
                    {formatTime(progress)} / {formatTime(duration)}
                </span>

                <!-- Play/Pause -->
                <button
                    type="button"
                    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition-all active:scale-95 shadow-[0_4px_14px_rgba(255,255,255,0.15)]"
                    onclick={togglePlay}
                    aria-label="Toggle Play"
                >
                    {#if isPlaying}
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
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
                            class="ml-0.5 h-5 w-5"
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
            </div>
        </div>
    </div>
</div>
