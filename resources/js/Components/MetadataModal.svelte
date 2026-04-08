<script>
    import { untrack } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { showToast } from "../Stores/toast.svelte.js";

    let { track = null, show = false, onClose, onApplied } = $props();

    let query = $state("");
    let loading = $state(false);
    let applying = $state(false);
    let results = $state([]);
    let error = $state(null);
    let hasSearchedOnce = $state(false);
    let selectedResult = $state(null);
    let draftTitle = $state("");
    let draftArtist = $state("");
    let draftAlbum = $state("");
    let draftCoverUrl = $state("");

    let currentCoverSrc = $derived.by(() => {
        if (!track) {
            return null;
        }

        if (track.local_cover_path) {
            return `/tracks/${track.id}/cover`;
        }

        return track.remote_cover_url || null;
    });

    let canApply = $derived(
        !applying &&
            draftTitle.trim().length > 0 &&
            draftArtist.trim().length > 0,
    );

    let footerMessage = $derived(
        selectedResult
            ? "Revisa los campos y aplica cuando estén listos. El botón permanece visible aunque el contenido haga scroll."
            : "Puedes editar manualmente y aplicar los cambios sin depender de un resultado sugerido.",
    );

    $effect(() => {
        if (show && track) {
            untrack(() => {
                hydrateDraft(track);

                if (!hasSearchedOnce) {
                    query = createSearchQuery(track);
                    hasSearchedOnce = true;
                    search();
                }
            });
        }

        if (!show) {
            untrack(() => {
                resetModalState();
            });
        }
    });

    function createSearchQuery(currentTrack) {
        return [currentTrack.title, currentTrack.artist]
            .filter(Boolean)
            .join(" ")
            .trim();
    }

    function hydrateDraft(currentTrack, result = null) {
        draftTitle = result?.title ?? currentTrack?.title ?? "";
        draftArtist = result?.artist ?? currentTrack?.artist ?? "";
        draftAlbum = result?.album ?? currentTrack?.album ?? "";
        draftCoverUrl =
            result?.cover_url ?? currentTrack?.remote_cover_url ?? "";
    }

    function resetModalState() {
        query = "";
        loading = false;
        applying = false;
        results = [];
        error = null;
        hasSearchedOnce = false;
        selectedResult = null;
        draftTitle = "";
        draftArtist = "";
        draftAlbum = "";
        draftCoverUrl = "";
    }

    async function search() {
        if (!query.trim() || !track) {
            return;
        }

        loading = true;
        error = null;
        results = [];

        try {
            const encodedQuery = encodeURIComponent(query.trim());
            const response = await fetch(
                `https://itunes.apple.com/search?term=${encodedQuery}&entity=song&limit=8`,
            );

            if (!response.ok) {
                throw new Error("iTunes API error");
            }

            const data = await response.json();
            const iTunesResults = data.results || [];

            results = iTunesResults.map((result) => ({
                title: result.trackName || "Sin título",
                artist: result.artistName || "Artista desconocido",
                album: result.collectionName || "",
                cover_url: (result.artworkUrl100 || "").replace(
                    "100x100bb",
                    "600x600bb",
                ),
            }));

            if (results.length === 0) {
                selectedResult = null;
                error = "No encontré coincidencias en iTunes.";
                return;
            }

            selectResult(results[0]);
        } catch {
            error = "No se pudo consultar iTunes. Verifica tu conexión.";
        } finally {
            loading = false;
        }
    }

    function selectResult(result) {
        selectedResult = result;
        hydrateDraft(track, result);
    }

    function handleKeydown(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            search();
        }
    }

    function close(force = false) {
        if (applying && !force) {
            return;
        }

        onClose?.();
    }

    async function coverToDataUrl(url) {
        if (!url) {
            return null;
        }

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error("Cover fetch failed");
            }

            const blob = await response.blob();

            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (typeof reader.result === "string") {
                        resolve(reader.result);
                        return;
                    }

                    reject(new Error("Invalid cover result"));
                };
                reader.onerror = () =>
                    reject(new Error("Invalid cover result"));
                reader.readAsDataURL(blob);
            });
        } catch {
            showToast(
                "No se pudo guardar la portada local. Se usará la remota.",
            );
            return null;
        }
    }

    async function applyDraft() {
        if (!track || !canApply) {
            return;
        }

        applying = true;

        try {
            const coverData = await coverToDataUrl(draftCoverUrl);
            const response = await window.axios.post(
                `/tracks/${track.id}/apply-metadata`,
                {
                    title: draftTitle.trim(),
                    artist: draftArtist.trim(),
                    album: draftAlbum.trim() || null,
                    cover_url: draftCoverUrl || null,
                    cover_data: coverData,
                },
            );

            const updatedTrack = response.data;

            showToast("Metadatos actualizados");
            onApplied?.(updatedTrack);
            close(true);
        } catch {
            showToast("Error al aplicar metadatos.");
        } finally {
            applying = false;
        }
    }
</script>

{#if show && track}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-6 backdrop-blur-md sm:items-center sm:pb-6"
        in:fade={{ duration: 180 }}
        out:fade={{ duration: 120 }}
        onclick={(event) => {
            if (event.target === event.currentTarget) {
                close();
            }
        }}
    >
        <div
            class="flex max-h-[92vh] w-full max-w-3xl min-h-0 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#101010] shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
            in:scale={{ start: 0.97, duration: 180 }}
            out:scale={{ start: 1, end: 0.98, duration: 120 }}
        >
            <div
                class="shrink-0 border-b border-white/6 px-5 pb-4 pt-5 sm:px-6"
            >
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <p
                            class="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/35"
                        >
                            Sync de metadata
                        </p>
                        <h2
                            class="mt-2 text-xl font-bold tracking-tight text-white"
                        >
                            Sincroniza los metadatos del archivo.
                        </h2>
                    </div>

                    <button
                        type="button"
                        class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/6 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                        onclick={close}
                        aria-label="Cerrar modal"
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
                </div>

                <div class="mt-5 grid gap-3 sm:grid-cols-2">
                    <div
                        class="rounded-[1.5rem] border border-white/8 bg-white/[0.04] p-4"
                    >
                        <p
                            class="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35"
                        >
                            Actual
                        </p>

                        <div class="mt-3 flex items-center gap-4">
                            <div
                                class="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-[1.4rem] bg-white/6"
                            >
                                {#if currentCoverSrc}
                                    <img
                                        src={currentCoverSrc}
                                        alt={`Portada actual de ${track.title}`}
                                        class="h-full w-full object-cover"
                                    />
                                {:else}
                                    <div
                                        class="flex h-full w-full items-center justify-center text-white/20"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-7 w-7"
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
                            </div>

                            <div class="min-w-0">
                                <p
                                    class="max-w-[200px] truncate text-base font-semibold text-white"
                                >
                                    {track.title}
                                </p>
                                <p
                                    class="mt-1 max-w-[200px] truncate text-sm text-white/45"
                                >
                                    {track.artist || "Artista desconocido"}
                                </p>
                                <p
                                    class="mt-1 max-w-[200px] truncate text-xs uppercase tracking-[0.16em] text-white/25"
                                >
                                    {track.album || "Sin álbum"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        class="rounded-[1.5rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_45%),rgba(255,255,255,0.04)] p-4"
                    >
                        <p
                            class="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35"
                        >
                            Aplicar
                        </p>

                        <div class="mt-3 flex items-center gap-4">
                            <div
                                class="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-[1.4rem] bg-white/6"
                            >
                                {#if draftCoverUrl}
                                    <img
                                        src={draftCoverUrl}
                                        alt="Portada propuesta"
                                        class="h-full w-full object-cover"
                                    />
                                {:else}
                                    <div
                                        class="flex h-full w-full items-center justify-center text-white/20"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-7 w-7"
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
                            </div>

                            <div class="min-w-0">
                                <p
                                    class="max-w-[200px] truncate text-base font-semibold text-white"
                                >
                                    {draftTitle || "Sin título"}
                                </p>
                                <p
                                    class="mt-1 max-w-[200px] truncate text-sm text-white/45"
                                >
                                    {draftArtist || "Artista desconocido"}
                                </p>
                                <p
                                    class="mt-1 max-w-[200px] truncate text-xs uppercase tracking-[0.16em] text-white/25"
                                >
                                    {draftAlbum || "Sin álbum"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mt-5 flex flex-col gap-3 sm:flex-row">
                    <div class="relative flex-1">
                        <input
                            type="text"
                            bind:value={query}
                            onkeydown={handleKeydown}
                            placeholder="Busca en iTunes por título, artista o álbum..."
                            class="w-full rounded-[1.35rem] border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/28 outline-none transition-colors focus:border-blue-400/45"
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
                    </div>

                    <button
                        type="button"
                        class="inline-flex items-center justify-center rounded-[1.35rem] bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition-colors active:scale-[0.98] hover:bg-blue-400 disabled:opacity-65"
                        onclick={search}
                        disabled={loading || applying || !query.trim()}
                    >
                        {#if loading}
                            <span class="inline-flex items-center gap-2">
                                <span
                                    class="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white"
                                ></span>
                                Buscando...
                            </span>
                        {:else}
                            Buscar en iTunes
                        {/if}
                    </button>
                </div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto">
                <div class="grid min-h-full gap-0 lg:grid-cols-[1.05fr_0.95fr]">
                    <div
                        class="border-b border-white/6 lg:border-b-0 lg:border-r"
                    >
                        <div
                            class="flex items-center justify-between px-5 pb-3 pt-4 sm:px-6"
                        >
                            <p class="text-sm font-semibold text-white/70">
                                Resultados sugeridos
                            </p>
                            <p class="text-xs text-white/35">
                                {results.length} coincidencias
                            </p>
                        </div>

                        <div class="px-3 pb-4 sm:px-4">
                            {#if loading}
                                <div
                                    class="flex min-h-[15rem] flex-col gap-2 p-2"
                                >
                                    {#each Array(4) as _}
                                        <div
                                            class="flex animate-pulse rounded-[1.25rem] bg-white/[0.04] p-3"
                                        >
                                            <div
                                                class="h-14 w-14 rounded-xl bg-white/10"
                                            ></div>
                                            <div
                                                class="ml-4 flex flex-1 flex-col justify-center gap-2"
                                            >
                                                <div
                                                    class="h-4 w-3/4 rounded bg-white/10"
                                                ></div>
                                                <div
                                                    class="h-3 w-1/2 rounded bg-white/5"
                                                ></div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {:else if error}
                                <div
                                    class="flex min-h-[15rem] flex-col items-center justify-center px-8 text-center"
                                >
                                    <div
                                        class="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/6 text-white/20"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-7 w-7"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            stroke-width="1.8"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                    </div>
                                    <p class="text-sm text-white/55">{error}</p>
                                </div>
                            {:else if results.length > 0}
                                <div class="flex flex-col gap-2">
                                    {#each results as result, index}
                                        <button
                                            type="button"
                                            class={`flex w-full items-center gap-4 rounded-[1.25rem] border px-3 py-3 text-left transition-colors ${
                                                selectedResult === result
                                                    ? "border-blue-400/35 bg-blue-500/10"
                                                    : "border-transparent bg-white/[0.03] hover:bg-white/[0.06]"
                                            }`}
                                            onclick={() => selectResult(result)}
                                        >
                                            <div
                                                class="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/8"
                                            >
                                                {#if result.cover_url}
                                                    <img
                                                        src={result.cover_url}
                                                        alt={`Portada de ${result.title}`}
                                                        class="h-full w-full object-cover"
                                                    />
                                                {/if}
                                            </div>

                                            <div class="min-w-0 flex-1">
                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <p
                                                        class="truncate text-sm font-semibold text-white"
                                                    >
                                                        {result.title}
                                                    </p>

                                                    {#if index === 0}
                                                        <span
                                                            class="rounded-full bg-white/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/55"
                                                        >
                                                            Mejor opción
                                                        </span>
                                                    {/if}
                                                </div>

                                                <p
                                                    class="mt-1 truncate text-xs text-white/45"
                                                >
                                                    {result.artist}
                                                </p>
                                                <p
                                                    class="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-white/22"
                                                >
                                                    {result.album ||
                                                        "Sin álbum"}
                                                </p>
                                            </div>
                                        </button>
                                    {/each}
                                </div>
                            {:else}
                                <div
                                    class="flex min-h-[15rem] flex-col items-center justify-center px-8 text-center text-white/40"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="mb-4 h-10 w-10 opacity-20"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        stroke-width="1.5"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                        />
                                    </svg>
                                    <p class="text-sm">
                                        Busca en iTunes para traer coincidencias
                                        y revisar antes de guardar.
                                    </p>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <div class="flex min-h-0 flex-col">
                        <div
                            class="border-b border-white/6 px-5 pb-3 pt-4 sm:px-6"
                        >
                            <p class="text-sm font-semibold text-white/70">
                                Edición final
                            </p>
                            <p class="mt-1 text-xs text-white/35">
                                Puedes ajustar los campos antes de aplicar. La
                                portada seleccionada se intentará guardar
                                localmente.
                            </p>
                        </div>

                        <div class="space-y-4 px-5 py-4 sm:px-6">
                            <label class="block">
                                <span
                                    class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35"
                                >
                                    Título
                                </span>
                                <input
                                    type="text"
                                    bind:value={draftTitle}
                                    class="w-full rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-400/45"
                                />
                            </label>

                            <label class="block">
                                <span
                                    class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35"
                                >
                                    Artista
                                </span>
                                <input
                                    type="text"
                                    bind:value={draftArtist}
                                    class="w-full rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-400/45"
                                />
                            </label>

                            <label class="block">
                                <span
                                    class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35"
                                >
                                    Álbum
                                </span>
                                <input
                                    type="text"
                                    bind:value={draftAlbum}
                                    class="w-full rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-400/45"
                                />
                            </label>

                            <label class="block">
                                <span
                                    class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35"
                                >
                                    URL de portada
                                </span>
                                <input
                                    type="url"
                                    bind:value={draftCoverUrl}
                                    class="w-full rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-400/45"
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div
                class="shrink-0 border-t border-white/6 bg-black/45 px-5 py-4 backdrop-blur-xl sm:px-6 sm:py-5"
            >
                <div
                    class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                    <p class="text-xs leading-relaxed text-white/42">
                        {footerMessage}
                    </p>

                    <button
                        type="button"
                        class="inline-flex w-full shrink-0 items-center justify-center rounded-[1.25rem] bg-blue-500 px-5 py-3.5 text-sm font-semibold text-white transition-colors active:scale-[0.98] hover:bg-blue-400 disabled:opacity-65 sm:w-auto sm:min-w-[14rem]"
                        onclick={applyDraft}
                        disabled={!canApply}
                    >
                        {#if applying}
                            <span class="inline-flex items-center gap-2">
                                <span
                                    class="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white"
                                ></span>
                                Guardando metadata...
                            </span>
                        {:else}
                            Aplicar cambios
                        {/if}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
