<script>
    import { Link, router } from "@inertiajs/svelte";
    import { flip } from "svelte/animate";
    import { fade, fly } from "svelte/transition";
    import ConfirmDialog from "../../Components/ConfirmDialog.svelte";
    import MetadataModal from "../../Components/MetadataModal.svelte";
    import {
        destroyPlayer,
        getCachedDuration,
        playerState as player,
        setQueue,
        updateCurrentTrackMetadata,
    } from "../../Stores/player.svelte.js";

    let { tracks } = $props();

    const sortOptions = [
        { id: "recent", label: "Recientes" },
        { id: "title", label: "Título" },
        { id: "artist", label: "Artista" },
    ];

    let searchQuery = $state("");
    let sortBy = $state("recent");
    let isDeleting = $state(null);
    let deleteCandidate = $state(null);
    let showMetadataModal = $state(false);
    let selectedTrackForMetadata = $state(null);
    let openMenuTrackId = $state(null);
    let coverVersions = $state({});

    let libraryStats = $derived.by(() => {
        const artists = new Set();
        let withCover = 0;

        for (const track of tracks) {
            if (track.artist) {
                artists.add(track.artist);
            }

            if (track.local_cover_path || track.remote_cover_url) {
                withCover++;
            }
        }

        return {
            tracks: tracks.length,
            artists: artists.size,
            withCover,
        };
    });

    let visibleTracks = $derived.by(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        const filteredTracks = [...tracks].filter((track) => {
            if (!normalizedQuery) {
                return true;
            }

            return [track.title, track.artist, track.album]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(normalizedQuery);
        });

        return filteredTracks.sort((left, right) => {
            if (sortBy === "title") {
                return left.title.localeCompare(right.title, "es", {
                    sensitivity: "base",
                });
            }

            if (sortBy === "artist") {
                return (left.artist || "").localeCompare(
                    right.artist || "",
                    "es",
                    {
                        sensitivity: "base",
                    },
                );
            }

            if (sortBy === "duration") {
                return (right.duration || 0) - (left.duration || 0);
            }

            return (
                new Date(right.created_at).getTime() -
                new Date(left.created_at).getTime()
            );
        });
    });

    function getCoverSrc(track) {
        if (track.local_cover_path) {
            const version = coverVersions[track.id]
                ? `?v=${coverVersions[track.id]}`
                : "";
            return `/tracks/${track.id}/cover${version}`;
        }

        return track.remote_cover_url || null;
    }

    function openMetadata(track) {
        openMenuTrackId = null;
        selectedTrackForMetadata = track;
        showMetadataModal = true;
    }

    function closeMetadataModal() {
        showMetadataModal = false;
        selectedTrackForMetadata = null;
    }

    function handleMetadataApplied(updatedTrack) {
        tracks = tracks.map((track) => {
            if (track.id !== updatedTrack.id) {
                return track;
            }

            return {
                ...track,
                ...updatedTrack,
            };
        });

        coverVersions = {
            ...coverVersions,
            [updatedTrack.id]: Date.now(),
        };

        if (player.currentTrack?.id === updatedTrack.id) {
            updateCurrentTrackMetadata(updatedTrack);
        }
    }

    function formatDuration(seconds) {
        if (!seconds) {
            return "--:--";
        }

        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    function getTrackDuration(track) {
        if (track.duration) {
            return track.duration;
        }

        if (isCurrentTrack(track) && player.duration > 0) {
            return player.duration;
        }

        return getCachedDuration(track.id);
    }

    function isCurrentTrack(track) {
        return player.currentTrack?.id === track.id;
    }

    function requestDelete(track) {
        openMenuTrackId = null;
        deleteCandidate = track;
    }

    function toggleTrackMenu(trackId) {
        openMenuTrackId = openMenuTrackId === trackId ? null : trackId;
    }

    function closeTrackMenu() {
        openMenuTrackId = null;
    }

    function closeDeleteDialog() {
        if (isDeleting) {
            return;
        }

        deleteCandidate = null;
    }

    function confirmDelete() {
        if (!deleteCandidate) {
            return;
        }

        const trackToDelete = deleteCandidate;
        isDeleting = trackToDelete.id;

        router.delete(`/tracks/${trackToDelete.id}`, {
            preserveScroll: true,
            onSuccess: () => {
                tracks = tracks.filter(
                    (track) => track.id !== trackToDelete.id,
                );

                if (player.currentTrack?.id === trackToDelete.id) {
                    destroyPlayer();
                }
            },
            onFinish: () => {
                isDeleting = null;
                deleteCandidate = null;
            },
        });
    }

    function playVisibleTrack(track) {
        const index = visibleTracks.findIndex((item) => item.id === track.id);

        if (index === -1) {
            return;
        }

        closeTrackMenu();
        setQueue(visibleTracks, index);
    }

    $effect(() => {
        if (!openMenuTrackId) {
            return;
        }

        const handleKeydown = (event) => {
            if (event.key === "Escape") {
                closeTrackMenu();
            }
        };

        window.addEventListener("keydown", handleKeydown);

        return () => {
            window.removeEventListener("keydown", handleKeydown);
        };
    });
</script>

<div class="px-6 pb-10 pt-10">
    <section
        class="relative overflow-hidden rounded-[2rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.22),_transparent_42%),linear-gradient(135deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
        in:fade={{ duration: 280 }}
    >
        <div
            class="absolute inset-y-0 right-0 w-40 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)] blur-2xl"
        ></div>

        <div class="relative flex flex-col gap-6">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <p
                        class="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/35"
                    >
                        Biblioteca Local
                    </p>
                    <h1
                        class="mt-3 text-4xl font-black tracking-[-0.04em] text-white"
                    >
                        Tu Música
                    </h1>
                </div>

                <Link
                    href="/audio-browser"
                    class="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/12"
                >
                    <span
                        class="flex h-5 w-5 items-center justify-center rounded-xl bg-white text-black shadow-lg"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-2 w-2"
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
                    </span>
                    Importar
                </Link>
            </div>
        </div>
    </section>

    {#if tracks.length > 0}
        <section
            class="mt-6 rounded-[1.75rem] border border-white/6 bg-white/[0.025] p-4"
        >
            <div class="flex flex-col gap-4">
                <div class="relative">
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="Buscar por título, artista o álbum..."
                        class="w-full rounded-[1.35rem] border border-white/10 bg-black/20 py-3 pl-11 pr-11 text-sm text-white placeholder:text-white/28 outline-none transition-colors focus:border-white/20"
                    />

                    <div
                        class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/28"
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
                                d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z"
                            />
                        </svg>
                    </div>

                    {#if searchQuery}
                        <button
                            type="button"
                            class="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/6 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                            onclick={() => {
                                searchQuery = "";
                            }}
                            aria-label="Limpiar búsqueda"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
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
                    {/if}
                </div>

                <div class="flex items-center justify-between gap-3">
                    <div class="flex flex-wrap gap-2">
                        {#each sortOptions as option}
                            <button
                                type="button"
                                class={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                                    sortBy === option.id
                                        ? "bg-white text-black"
                                        : "bg-white/6 text-white/45 hover:bg-white/10 hover:text-white/70"
                                }`}
                                onclick={() => {
                                    sortBy = option.id;
                                }}
                            >
                                {option.label}
                            </button>
                        {/each}
                    </div>

                    <p class="text-xs font-medium text-white/35">
                        {visibleTracks.length} de {tracks.length}
                    </p>
                </div>
            </div>
        </section>
    {/if}

    {#if tracks.length === 0}
        <div
            class="mt-8 flex flex-col items-center justify-center rounded-[2.25rem] border border-dashed border-white/10 bg-white/[0.02] px-8 py-16 text-center"
            in:fade={{ duration: 500 }}
        >
            <div
                class="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[radial-gradient(circle_at_30%_20%,rgba(37,99,235,0.24),transparent_55%),rgba(255,255,255,0.04)] text-white/55"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-10 w-10"
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

            <h2 class="text-2xl font-bold tracking-tight text-white">
                Tu biblioteca todavía no tiene nada cargado.
            </h2>
            <p class="mt-3 max-w-xs text-sm leading-relaxed text-white/45">
                Importa audio local para construir la colección y empezar a
                reproducir desde aquí.
            </p>

            <Link
                href="/audio-browser"
                class="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition-transform active:scale-[0.98]"
            >
                Abrir importador
            </Link>
        </div>
    {:else if visibleTracks.length === 0}
        <div
            class="mt-8 rounded-[2rem] border border-white/8 bg-white/[0.02] px-6 py-12 text-center"
            in:fade={{ duration: 220 }}
        >
            <p class="text-lg font-semibold text-white">
                No encontré resultados para "{searchQuery}".
            </p>
            <p class="mt-2 text-sm text-white/45">
                Prueba otro término o cambia el orden para encontrarlo más
                rápido.
            </p>
        </div>
    {:else}
        <div class="mt-8 flex flex-col gap-3">
            {#each visibleTracks as track (track.id)}
                <article
                    class={`group relative overflow-visible rounded-[1.75rem] border transition-all duration-300 ${
                        isCurrentTrack(track)
                            ? "border-white/12 bg-white/[0.08] shadow-[0_20px_70px_rgba(0,0,0,0.35)]"
                            : "border-white/6 bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.05]"
                    }`}
                    animate:flip={{ duration: 280 }}
                >
                    <div
                        class="flex items-stretch gap-3 p-3"
                        in:fly={{ y: 16, opacity: 0, duration: 260 }}
                    >
                        <button
                            type="button"
                            class="flex min-w-0 flex-1 items-center gap-4 rounded-[1.4rem] px-1 py-1 text-left outline-none"
                            onclick={() => playVisibleTrack(track)}
                        >
                            <div
                                class="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-[1.35rem] bg-[linear-gradient(145deg,#191919,#090909)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]"
                            >
                                {#if getCoverSrc(track)}
                                    <img
                                        src={getCoverSrc(track)}
                                        alt={`Portada de ${track.title}`}
                                        class={`h-full w-full object-cover transition-transform duration-500 ${
                                            isCurrentTrack(track)
                                                ? "scale-105"
                                                : "group-hover:scale-105"
                                        }`}
                                    />
                                {:else}
                                    <div
                                        class="flex h-full w-full items-center justify-center text-white/25"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-8 w-8"
                                            viewBox="0 0 24 24"
                                            fill="none"
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
                                {/if}

                                {#if isCurrentTrack(track)}
                                    <div
                                        class="absolute inset-0 bg-blue-500/18"
                                    ></div>
                                    <div
                                        class="absolute bottom-2 left-2 right-2 rounded-full bg-black/40 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm"
                                    >
                                        {player.isPlaying ? "Ahora" : "Pausa"}
                                    </div>
                                {/if}
                            </div>

                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-2">
                                    <p
                                        class={`truncate text-[17px] font-bold tracking-tight ${
                                            isCurrentTrack(track)
                                                ? "text-white"
                                                : "text-white/92"
                                        }`}
                                    >
                                        {track.title}
                                    </p>
                                </div>

                                <p class="mt-1 truncate text-sm text-white/55">
                                    {track.artist || "Artista desconocido"}
                                    {#if track.album}
                                        <span class="text-white/25">
                                            • {track.album}</span
                                        >
                                    {/if}
                                </p>

                                <div
                                    class="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/30"
                                >
                                    <span
                                        >{formatDuration(
                                            getTrackDuration(track),
                                        )}</span
                                    >

                                    {#if track.local_cover_path || track.remote_cover_url}
                                        <span
                                            class="inline-flex items-center gap-1 rounded-full bg-white/6 px-2 py-1 text-white/45"
                                        >
                                            Portada lista
                                        </span>
                                    {/if}
                                </div>
                            </div>
                        </button>

                        <div class="relative flex shrink-0 items-start">
                            {#if openMenuTrackId === track.id}
                                <button
                                    type="button"
                                    class="fixed inset-0 z-10 cursor-default"
                                    onclick={closeTrackMenu}
                                    aria-label="Cerrar menú de acciones"
                                ></button>
                            {/if}

                            <button
                                type="button"
                                class={`relative z-20 inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${
                                    openMenuTrackId === track.id
                                        ? "border-blue-400/40 bg-blue-500/16 text-blue-100"
                                        : "border-white/8 bg-white/6 text-white/45 hover:bg-white/12 hover:text-white"
                                }`}
                                onclick={(event) => {
                                    event.stopPropagation();
                                    toggleTrackMenu(track.id);
                                }}
                                aria-label={`Abrir acciones de ${track.title}`}
                                aria-haspopup="menu"
                                aria-expanded={openMenuTrackId === track.id}
                                aria-controls={`track-actions-${track.id}`}
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
                                        d="M12 5h.01M12 12h.01M12 19h.01"
                                    />
                                </svg>
                            </button>

                            {#if openMenuTrackId === track.id}
                                <div
                                    id={`track-actions-${track.id}`}
                                    class="absolute right-0 top-12 z-20 flex w-52 flex-col gap-1 rounded-[1.35rem] border border-white/10 bg-[#0d0d0d]/96 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                                    role="menu"
                                    aria-label={`Acciones para ${track.title}`}
                                    tabindex="-1"
                                >
                                    <button
                                        type="button"
                                        class="inline-flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left text-sm font-medium text-white/82 transition-colors hover:bg-blue-500/14 hover:text-white"
                                        onclick={() => openMetadata(track)}
                                        role="menuitem"
                                    >
                                        <span
                                            class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/14 text-blue-100"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="h-4 w-4"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                            >
                                                <path
                                                    fill-rule="evenodd"
                                                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                                                    clip-rule="evenodd"
                                                />
                                            </svg>
                                        </span>
                                        <span class="min-w-0">
                                            Buscar metadata
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        class="inline-flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left text-sm font-medium text-white/82 transition-colors hover:bg-rose-500/14 hover:text-white"
                                        onclick={() => requestDelete(track)}
                                        role="menuitem"
                                        disabled={isDeleting === track.id}
                                    >
                                        <span
                                            class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/12 text-rose-200"
                                        >
                                            {#if isDeleting === track.id}
                                                <span
                                                    class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                                                ></span>
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
                                        </span>
                                        <span class="min-w-0">
                                            Eliminar track
                                        </span>
                                    </button>
                                </div>
                            {/if}
                        </div>
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</div>

<MetadataModal
    show={showMetadataModal}
    track={selectedTrackForMetadata}
    onClose={closeMetadataModal}
    onApplied={handleMetadataApplied}
/>

<ConfirmDialog
    show={!!deleteCandidate}
    title="Eliminar canción"
    message={deleteCandidate
        ? `Se eliminará "${deleteCandidate.title}" de tu biblioteca local. Esta acción no se puede deshacer.`
        : ""}
    confirmLabel="Eliminar"
    cancelLabel="Conservar"
    busy={!!isDeleting}
    onCancel={closeDeleteDialog}
    onConfirm={confirmDelete}
/>
