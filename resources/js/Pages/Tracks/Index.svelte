<script>
    import { playTrack, playerState as player, getCachedDuration } from "../../Stores/player.svelte.js";
    import { router } from "@inertiajs/svelte";
    import { fade, fly } from "svelte/transition";
    import { flip } from "svelte/animate";

    let { tracks } = $props();
    let isDeleting = $state(null); // Track ID being deleted

    function formatDuration(seconds) {
        if (!seconds) return "--:--";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    function getTrackDuration(track) {
        if (track.duration) return track.duration;
        if (isCurrentTrack(track) && player.duration > 0)
            return player.duration;
        return getCachedDuration(track.id);
    }

    function isCurrentTrack(track) {
        return player.currentTrack?.id === track.id;
    }

    function deleteTrack(track) {
        if (confirm(`Remove "${track.title}" from library?`)) {
            isDeleting = track.id;
            router.delete(`/tracks/${track.id}`, {
                onFinish: () => {
                    isDeleting = null;
                },
            });
        }
    }
</script>

<div class="px-6 pt-12 pb-8">
    <!-- Header Section -->
    <header class="mb-12 flex items-end justify-between">
        <div in:fade={{ duration: 400 }}>
            <h1 class="text-5xl font-black tracking-tighter text-white">
                Música
            </h1>
            <div class="mt-2 flex items-center gap-2">
                <span
                    class="inline-block h-1.5 w-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]"
                ></span>
                <p
                    class="text-xs font-bold uppercase tracking-[0.2em] text-white/30"
                >
                    {tracks.length} canciones
                </p>
            </div>
        </div>

        <a
            href="/audio-browser"
            class="group relative flex h-14 w-14 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-white/5 border border-white/5 text-white transition-all hover:bg-white/10 active:scale-90 shadow-2xl"
            aria-label="Import from device audio"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 transition-transform group-hover:rotate-90"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                />
            </svg>
        </a>
    </header>

    {#if tracks.length === 0}
        <div
            class="flex flex-col items-center justify-center py-40 text-center"
            in:fade={{ duration: 800 }}
        >
            <div class="relative mb-8">
                <div
                    class="absolute inset-0 blur-2xl bg-purple-500/10 rounded-full"
                ></div>
                <div
                    class="relative flex h-32 w-32 items-center justify-center rounded-[2.5rem] bg-gradient-to-b from-white/[0.08] to-transparent border border-white/[0.05] shadow-2xl"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-12 w-12 text-white/10"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="1.5"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                        />
                    </svg>
                </div>
            </div>
            <h2 class="text-2xl font-bold tracking-tight text-white/90">
                Tu biblioteca está en silencio
            </h2>
            <p class="mt-3 max-w-[240px] text-sm leading-relaxed text-white/30">
                Toca el icono de "+" para importar tu colección de audio local.
            </p>
        </div>
    {:else}
        <div class="flex flex-col gap-3">
            {#each tracks as track, i (track.id)}
                <div animate:flip={{ duration: 400 }}>
                    <div
                        in:fly={{
                            y: 30,
                            opacity: 0,
                            duration: 600,
                            delay: i * 40,
                        }}
                        class="group relative"
                    >
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            role="button"
                            tabindex="0"
                            class="flex w-full items-center gap-5 rounded-[1.5rem] border border-transparent p-4 text-left transition-all duration-300 cursor-pointer {isCurrentTrack(
                                track,
                            )
                                ? 'bg-white/[0.08] border-white/[0.08] shadow-[0_15px_40px_rgba(0,0,0,0.4)] backdrop-blur-md'
                                : 'hover:bg-white/[0.04] active:scale-[0.97]'}"
                            onclick={() => playTrack(track)}
                            onkeydown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    playTrack(track);
                                }
                            }}
                        >
                            <!-- Cover Art Container -->
                            <div
                                class="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                            >
                                <div
                                    class="flex h-full w-full items-center justify-center text-white/30 transition-transform duration-500 group-hover:scale-110"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-8 w-8"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        stroke-width="1.5"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                                        />
                                    </svg>
                                </div>

                                {#if isCurrentTrack(track)}
                                    <div
                                        class="absolute inset-0 bg-purple-500/20 mix-blend-overlay"
                                    ></div>
                                    {#if player.isPlaying}
                                        <div
                                            class="absolute inset-0 flex items-center justify-center gap-[3px] bg-black/40 backdrop-blur-[1px]"
                                        >
                                            <span
                                                class="inline-block h-4 w-1 animate-[bounce_0.6s_infinite] rounded-full bg-purple-400"
                                            ></span>
                                            <span
                                                class="inline-block h-6 w-1 animate-[bounce_0.8s_infinite] rounded-full bg-purple-400"
                                            ></span>
                                            <span
                                                class="inline-block h-3 w-1 animate-[bounce_0.7s_infinite] rounded-full bg-purple-400"
                                            ></span>
                                        </div>
                                    {/if}
                                {/if}
                            </div>

                            <!-- Track Info -->
                            <div class="min-w-0 flex-1">
                                <p
                                    class="truncate text-[17px] font-bold tracking-tight {isCurrentTrack(
                                        track,
                                    )
                                        ? 'text-purple-300'
                                        : 'text-white/90'}"
                                >
                                    {track.title}
                                </p>
                                <p
                                    class="mt-1 truncate text-xs font-bold uppercase tracking-widest text-white/20"
                                >
                                    {track.artist || "Unknown Artist"}
                                </p>
                            </div>

                            <!-- Duration & Action -->
                            <div class="flex flex-col items-end gap-2 shrink-0">
                                <span
                                    class="text-[11px] font-black tabular-nums tracking-widest text-white/30 transition-colors"
                                >
                                    {formatDuration(getTrackDuration(track))}
                                </span>

                                <button
                                    type="button"
                                    class="p-2 text-white/40 hover:text-red-400 active:scale-90 transition-colors"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        deleteTrack(track);
                                    }}
                                    aria-label="Delete track"
                                >
                                    {#if isDeleting === track.id}
                                        <div
                                            class="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent"
                                        ></div>
                                    {:else}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-4 w-4"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    {/if}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
