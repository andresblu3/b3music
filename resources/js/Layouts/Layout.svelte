<script>
    import { fly } from "svelte/transition";
    import {
        destroyPlayer,
        playNext,
        playerState as player,
        playPrev,
        removeContainer,
        seek,
        setContainer,
        togglePlay,
        toggleRepeat,
        toggleShuffle,
    } from "../Stores/player.svelte.js";
    import { toastState } from "../Stores/toast.svelte.js";

    let { children } = $props();

    const isAndroid = typeof window !== "undefined" && !!window.AndroidBridge;

    let currentTrack = $derived(player.currentTrack);
    let isPlaying = $derived(player.isPlaying);
    let isLoading = $derived(player.isLoading);
    let progress = $derived(player.progress);
    let duration = $derived(player.duration);
    let hasWaveform = $derived(player.hasWaveform);
    let shuffle = $derived(player.shuffle);
    let repeat = $derived(player.repeat);
    let queueLength = $derived(player.queueLength);
    let queuePosition = $derived(player.queuePosition);
    let error = $derived(player.error);
    let progressPct = $derived(
        duration > 0 ? Math.min(100, (progress / duration) * 100) : 0,
    );
    let remainingTime = $derived(duration > 0 ? duration - progress : 0);
    let currentCoverSrc = $derived.by(() => {
        if (!currentTrack) {
            return null;
        }

        if (currentTrack.local_cover_path) {
            const version = currentTrack.coverVersion
                ? `?v=${currentTrack.coverVersion}`
                : "";
            return `/tracks/${currentTrack.id}/cover${version}`;
        }

        return currentTrack.remote_cover_url || null;
    });

    let dragging = $state(false);
    let showExpandedPlayer = $state(false);

    $effect(() => {
        if (!currentTrack) {
            showExpandedPlayer = false;
        }
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
                    removeContainer(node);
                }, 0);
            },
        };
    }

    function openExpandedPlayer() {
        if (currentTrack) {
            showExpandedPlayer = true;
        }
    }

    function closeExpandedPlayer() {
        showExpandedPlayer = false;
    }

    function startDrag(event) {
        dragging = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromPointer(event);
    }

    function onDrag(event) {
        if (!dragging) {
            return;
        }

        seekFromPointer(event);
    }

    function endDrag() {
        dragging = false;
    }

    function seekFromPointer(event) {
        if (!duration) {
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const fraction = Math.max(
            0,
            Math.min(1, (event.clientX - rect.left) / rect.width),
        );
        seek(fraction * duration);
    }
</script>

<div
    class="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.06),transparent_25%),#050505] text-gray-100 selection:bg-blue-500/25 font-instrument-sans"
>
    <main
        class="min-h-screen overflow-y-auto pb-56 pt-[max(env(safe-area-inset-top),1rem)]"
    >
        {@render children()}
    </main>

    <div
        class="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style="transform: translateY({currentTrack
            ? '0'
            : '120%'}); opacity: {currentTrack
            ? '1'
            : '0'}; pointer-events: {currentTrack ? 'auto' : 'none'};"
        aria-hidden={!currentTrack}
    >
        {#if isPlaying}
            <div
                class="absolute inset-x-5 -bottom-4 h-20 rounded-[2rem] bg-blue-500/8 blur-3xl"
            ></div>
        {/if}

        <div
            class="relative mx-auto max-w-md overflow-hidden rounded-[2rem] border border-white/8 bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
            <div
                class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
            ></div>

            <div class="px-4 pt-4">
                <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-[1.4rem] bg-white/[0.04] px-3 py-3 text-left transition-colors hover:bg-white/[0.06]"
                    onclick={openExpandedPlayer}
                >
                    <div
                        class="relative h-14 w-14 shrink-0 overflow-hidden rounded-[1.2rem] bg-[linear-gradient(145deg,#1f1f1f,#090909)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]"
                        style="animation: {isPlaying && currentCoverSrc
                            ? 'spin 20s linear infinite'
                            : 'none'}; border-radius: {currentCoverSrc
                            ? '9999px'
                            : '1rem'};"
                    >
                        {#if currentCoverSrc}
                            <img
                                src={currentCoverSrc}
                                alt={`Portada de ${currentTrack?.title || "la canción actual"}`}
                                class="h-full w-full object-cover"
                            />
                        {:else}
                            <div
                                class="flex h-full w-full items-center justify-center text-white/20"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-6 w-6"
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

                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <p
                                class="truncate text-sm font-semibold tracking-tight text-white"
                            >
                                {currentTrack?.title || ""}
                            </p>

                            {#if queueLength > 1}
                                <span
                                    class="rounded-full bg-white/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55"
                                >
                                    {queuePosition}/{queueLength}
                                </span>
                            {/if}
                        </div>

                        <p class="mt-1 truncate text-[11px] text-white/45">
                            {currentTrack?.artist || "Artista desconocido"}
                            {#if currentTrack?.album}
                                <span class="text-white/22">
                                    • {currentTrack.album}</span
                                >
                            {/if}
                        </p>

                        <div class="mt-2 flex flex-wrap items-center gap-2">
                            {#if isLoading}
                                <span
                                    class="rounded-full bg-white/7 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55"
                                >
                                    Cargando
                                </span>
                            {:else if error}
                                <span
                                    class="rounded-full bg-rose-500/14 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200"
                                >
                                    Error
                                </span>
                            {:else if isPlaying}
                                <span
                                    class="rounded-full bg-blue-500/16 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-200"
                                >
                                    En reproducción
                                </span>
                            {:else}
                                <span
                                    class="rounded-full bg-white/7 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55"
                                >
                                    Pausado
                                </span>
                            {/if}

                            {#if shuffle}
                                <span
                                    class="rounded-full bg-white/7 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55"
                                >
                                    Shuffle
                                </span>
                            {/if}

                            {#if repeat !== "off"}
                                <span
                                    class="rounded-full bg-white/7 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55"
                                >
                                    {repeat === "one"
                                        ? "Repite una"
                                        : "Repite todo"}
                                </span>
                            {/if}
                        </div>
                    </div>

                    <div class="text-white/32">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                            />
                        </svg>
                    </div>
                </button>
            </div>

            <div class="relative px-4 pt-3">
                {#if isAndroid}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="relative h-2.5 w-full cursor-pointer rounded-full bg-white/10 touch-none"
                        onpointerdown={startDrag}
                        onpointermove={onDrag}
                        onpointerup={endDrag}
                        onpointercancel={endDrag}
                    >
                        <div
                            class="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400"
                            class:transition-[width]={!dragging}
                            class:duration-100={!dragging}
                            style="width: {progressPct}%"
                        ></div>
                        <div
                            class="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(59,130,246,0.6)]"
                            class:transition-[left]={!dragging}
                            class:duration-100={!dragging}
                            style="left: calc({progressPct}% - 8px)"
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

                {#if isLoading}
                    <div
                        class="absolute inset-0 flex items-center justify-center"
                    >
                        <div
                            class="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
                        ></div>
                    </div>
                {/if}
            </div>

            <div
                class="flex items-center justify-between px-4 pt-2 text-[10px] font-medium text-white/38"
            >
                <span>{formatTime(progress)}</span>
                <span>-{formatTime(remainingTime)}</span>
            </div>

            {#if error}
                <div class="px-4 pt-2">
                    <div
                        class="rounded-[1rem] border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-100/85"
                    >
                        {error}
                    </div>
                </div>
            {/if}

            <div class="flex items-center justify-center gap-6 px-4 pb-4 pt-3">
                <button
                    type="button"
                    class={`relative flex h-9 w-9 items-center justify-center transition-colors ${
                        shuffle ? "text-blue-300" : "text-white/35"
                    }`}
                    onclick={toggleShuffle}
                    aria-label="Alternar modo aleatorio"
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
                            class="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-300"
                        ></span>
                    {/if}
                </button>

                <button
                    type="button"
                    class="flex h-10 w-10 items-center justify-center text-white/70 transition-transform active:scale-90"
                    onclick={playPrev}
                    aria-label="Pista anterior"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M19.952 1.651a.75.75 0 01.298.599V16.303a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V6.994l-9 2.572v9.737a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.402-4.909l2.31-.66a1.5 1.5 0 001.088-1.442V9.017 5.25a.75.75 0 01.544-.721l10.5-3a.75.75 0 01.658.122z"
                        />
                    </svg>
                </button>

                <button
                    type="button"
                    class="relative flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-[0_8px_24px_rgba(255,255,255,0.18)] transition-transform active:scale-90"
                    onclick={togglePlay}
                    aria-label="Reproducir o pausar"
                >
                    {#if isPlaying}
                        <div
                            class="absolute inset-0 rounded-full ring-2 ring-blue-400/20"
                        ></div>
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

                <button
                    type="button"
                    class="flex h-10 w-10 items-center justify-center text-white/70 transition-transform active:scale-90"
                    onclick={playNext}
                    aria-label="Siguiente pista"
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

                <button
                    type="button"
                    class={`relative flex h-9 w-9 items-center justify-center transition-colors ${
                        repeat !== "off" ? "text-blue-300" : "text-white/35"
                    }`}
                    onclick={toggleRepeat}
                    aria-label="Alternar modo repetir"
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
                            class="absolute -top-1 -right-0.5 text-[8px] font-black text-blue-300"
                            >1</span
                        >
                    {/if}
                </button>
            </div>
        </div>
    </div>

    {#if showExpandedPlayer && currentTrack}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="fixed inset-0 z-[65] bg-black/85 backdrop-blur-xl"
            onclick={(event) => {
                if (event.target === event.currentTarget) {
                    closeExpandedPlayer();
                }
            }}
        >
            <div
                class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.26),transparent_32%)]"
            ></div>

            <div
                class="relative mx-auto flex h-full max-w-md flex-col px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),1.5rem)]"
            >
                <div class="flex items-center justify-between">
                    <button
                        type="button"
                        class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/7 text-white/65"
                        onclick={closeExpandedPlayer}
                        aria-label="Cerrar reproductor expandido"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </button>

                    <button
                        type="button"
                        class="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70"
                        onclick={destroyPlayer}
                    >
                        Detener
                    </button>
                </div>

                <div class="flex flex-1 flex-col justify-center">
                    <div class="mx-auto w-full max-w-sm">
                        <div
                            class="relative mx-auto aspect-square w-full overflow-hidden rounded-[2.5rem] bg-[linear-gradient(145deg,#1b1b1b,#090909)] shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
                        >
                            {#if currentCoverSrc}
                                <img
                                    src={currentCoverSrc}
                                    alt={`Portada de ${currentTrack.title}`}
                                    class={`h-full w-full object-cover`}
                                />
                            {:else}
                                <div
                                    class="flex h-full w-full items-center justify-center text-white/18"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-20 w-20"
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

                        <div class="mt-8 text-center">
                            <p
                                class="text-3xl font-black tracking-[-0.04em] text-white"
                            >
                                {currentTrack.title}
                            </p>
                            <p class="mt-2 text-base text-white/55">
                                {currentTrack.artist || "Artista desconocido"}
                            </p>
                            {#if currentTrack.album}
                                <p
                                    class="mt-1 text-sm uppercase tracking-[0.18em] text-white/25"
                                >
                                    {currentTrack.album}
                                </p>
                            {/if}
                        </div>

                        <div class="mt-8">
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="relative h-2.5 w-full cursor-pointer rounded-full bg-white/10 touch-none"
                                onpointerdown={startDrag}
                                onpointermove={onDrag}
                                onpointerup={endDrag}
                                onpointercancel={endDrag}
                            >
                                <div
                                    class="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400"
                                    class:transition-[width]={!dragging}
                                    class:duration-100={!dragging}
                                    style="width: {progressPct}%"
                                ></div>
                                <div
                                    class="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_rgba(59,130,246,0.7)]"
                                    class:transition-[left]={!dragging}
                                    class:duration-100={!dragging}
                                    style="left: calc({progressPct}% - 8px)"
                                ></div>
                            </div>

                            <div
                                class="mt-3 flex items-center justify-between text-xs font-medium text-white/38"
                            >
                                <span>{formatTime(progress)}</span>
                                <span>-{formatTime(remainingTime)}</span>
                            </div>
                        </div>

                        <div
                            class="mt-8 flex items-center justify-center gap-8"
                        >
                            <button
                                type="button"
                                class={`relative flex h-11 w-11 items-center justify-center transition-colors ${
                                    shuffle ? "text-blue-300" : "text-white/35"
                                }`}
                                onclick={toggleShuffle}
                                aria-label="Alternar aleatorio"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-5 w-5"
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
                            </button>

                            <button
                                type="button"
                                class="flex h-12 w-12 items-center justify-center text-white/75 transition-transform active:scale-90"
                                onclick={playPrev}
                                aria-label="Pista anterior"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-6 w-6"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path
                                        d="M19.952 1.651a.75.75 0 01.298.599V16.303a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.403-4.909l2.311-.66a1.5 1.5 0 001.088-1.442V6.994l-9 2.572v9.737a3 3 0 01-2.176 2.884l-1.32.377a2.553 2.553 0 11-1.402-4.909l2.31-.66a1.5 1.5 0 001.088-1.442V9.017 5.25a.75.75 0 01.544-.721l10.5-3a.75.75 0 01.658.122z"
                                    />
                                </svg>
                            </button>

                            <button
                                type="button"
                                class="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.16)] transition-transform active:scale-90"
                                onclick={togglePlay}
                                aria-label="Reproducir o pausar"
                            >
                                {#if isPlaying}
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-8 w-8"
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
                                        class="ml-1 h-8 w-8"
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

                            <button
                                type="button"
                                class="flex h-12 w-12 items-center justify-center text-white/75 transition-transform active:scale-90"
                                onclick={playNext}
                                aria-label="Siguiente pista"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-6 w-6"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path
                                        d="M5.055 7.06C3.805 6.347 2.25 7.25 2.25 8.69v6.62c0 1.44 1.555 2.343 2.805 1.628L12 13.471v2.34c0 1.44 1.555 2.343 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256l-7.108-4.061C13.555 5.346 12 6.249 12 7.689v2.34L5.055 7.061z"
                                    />
                                </svg>
                            </button>

                            <button
                                type="button"
                                class={`relative flex h-11 w-11 items-center justify-center transition-colors ${
                                    repeat !== "off"
                                        ? "text-blue-300"
                                        : "text-white/35"
                                }`}
                                onclick={toggleRepeat}
                                aria-label="Alternar repetición"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-5 w-5"
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
                                        class="absolute -top-1 -right-0.5 text-[9px] font-black text-blue-300"
                                        >1</span
                                    >
                                {/if}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    {#if toastState.visible}
        <div
            class="fixed left-1/2 bottom-52 z-[75] -translate-x-1/2"
            transition:fly={{ y: 20, duration: 220 }}
        >
            <div
                class="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-5 py-2.5 shadow-xl backdrop-blur-xl"
            >
                {#if toastState.icon}
                    <span class="text-sm">{toastState.icon}</span>
                {/if}
                <span
                    class="whitespace-nowrap text-sm font-medium text-white/90"
                >
                    {toastState.message}
                </span>
            </div>
        </div>
    {/if}
</div>
