<script>
    import { fade, scale } from "svelte/transition";
    import { showToast } from "../Stores/toast.svelte.js";
    import { untrack } from "svelte";

    let { track = null, show = false, onClose, onApplied } = $props();

    let query = $state("");
    let loading = $state(false);
    let applying = $state(false);
    let results = $state([]);
    let error = $state(null);
    let hasSearchedOnce = $state(false);

    // Auto-search when modal opens with a new track
    $effect(() => {
        if (show && track) {
            untrack(() => {
                if (!hasSearchedOnce) {
                    query = track.title;
                    hasSearchedOnce = true;
                    search();
                }
            });
        }
        if (!show) {
            untrack(() => {
                hasSearchedOnce = false;
                query = "";
                results = [];
                error = null;
            });
        }
    });

    /**
     * Search iTunes directly from the WebView (frontend).
     * NativePHP's embedded PHP server cannot make outbound HTTP calls on Android,
     * but the WebView has full network access.
     */
    async function search() {
        if (!query.trim() || !track) return;

        loading = true;
        error = null;
        results = [];

        try {
            const encodedQuery = encodeURIComponent(query.trim());
            const response = await fetch(
                `https://itunes.apple.com/search?term=${encodedQuery}&entity=song&limit=5`
            );

            if (!response.ok) throw new Error("iTunes API error");

            const data = await response.json();
            const iTunesResults = data.results || [];

            results = iTunesResults.map((r) => ({
                title: r.trackName || "Unknown Title",
                artist: r.artistName || "Unknown Artist",
                album: r.collectionName || "Unknown Album",
                cover_url: (r.artworkUrl100 || "").replace("100x100bb", "600x600bb"),
            }));

            if (results.length === 0) {
                error = "No se encontraron resultados.";
            }
        } catch (err) {
            error = "Error al buscar. Verifica tu conexión.";
        } finally {
            loading = false;
        }
    }

    function handleKeydown(e) {
        if (e.key === "Enter") {
            search();
        }
    }

    /**
     * Apply selected metadata (title, artist, cover URL) to the track.
     * Only plain text/URL strings are sent — no binary data through NativePHP's JNI.
     */
    async function applyResult(result) {
        if (!track) return;
        applying = true;

        try {
            const response = await window.axios.post(`/tracks/${track.id}/apply-metadata`, {
                title: result.title,
                artist: result.artist,
                cover_url: result.cover_url || null,
            });

            const updatedTrack = response.data;

            showToast("¡Metadatos aplicados!");

            if (onApplied) {
                onApplied(updatedTrack);
            }

            close();
        } catch (err) {
            showToast("Error al aplicar metadatos.");
            applying = false;
        }
    }

    function close() {
        applying = false;
        if (onClose) onClose();
    }
</script>

{#if show && track}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
        in:fade={{ duration: 200 }}
        out:fade={{ duration: 150 }}
        onclick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
        <div
            class="relative w-full max-w-lg overflow-hidden rounded-t-[2rem] sm:rounded-[2rem] bg-[#111] border border-white/10 shadow-2xl"
            in:scale={{ start: 0.95, duration: 200 }}
        >
            <!-- Header -->
            <div class="border-b border-white/5 p-6 pb-5">
                <div class="flex items-center justify-between mb-2">
                    <h2 class="text-xl font-bold text-white">Buscar Metadatos</h2>
                    <button
                        type="button"
                        class="rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                        onclick={close}
                        aria-label="Cerrar modal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>
                <p class="text-sm text-white/30 truncate">Archivo: <span class="text-white/60 font-medium">{track.title}</span></p>

                <!-- Search Input -->
                <div class="mt-4 flex gap-2">
                    <div class="relative flex-1">
                        <input
                            type="text"
                            bind:value={query}
                            onkeydown={handleKeydown}
                            placeholder="Nombre de canción o artista..."
                            class="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-4 pr-10 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                        />
                        {#if query}
                            <button
                                type="button"
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                                onclick={() => { query = ''; }}
                                aria-label="Limpiar búsqueda"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                                </svg>
                            </button>
                        {/if}
                    </div>
                    <button
                        class="flex shrink-0 items-center justify-center rounded-xl bg-purple-600 px-5 text-sm font-bold text-white transition-colors hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50"
                        onclick={search}
                        disabled={loading || applying || !query.trim()}
                    >
                        {#if loading && !applying}
                            <svg class="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        {:else}
                            Buscar
                        {/if}
                    </button>
                </div>
            </div>

            <!-- Results area -->
            <div class="h-[360px] overflow-y-auto p-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                {#if applying}
                    <div class="flex h-full flex-col items-center justify-center text-center">
                        <svg class="mb-4 h-8 w-8 animate-spin text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <p class="text-sm font-medium text-white/50 animate-pulse">Descargando portada...</p>
                    </div>
                {:else if loading}
                    <div class="flex h-full flex-col gap-2 p-2">
                        {#each Array(4) as _}
                            <div class="flex animate-pulse rounded-2xl bg-white/5 p-3">
                                <div class="h-14 w-14 rounded-xl bg-white/10"></div>
                                <div class="ml-4 flex flex-1 flex-col justify-center gap-2">
                                    <div class="h-4 w-3/4 rounded bg-white/10"></div>
                                    <div class="h-3 w-1/2 rounded bg-white/5"></div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else if error}
                    <div class="flex h-full flex-col items-center justify-center px-8 text-center">
                        <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-white/20">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p class="text-white/60">{error}</p>
                    </div>
                {:else if results.length > 0}
                    <div class="flex flex-col gap-1 p-2">
                        {#each results as result}
                            <button
                                class="group flex w-full items-center gap-4 rounded-xl p-3 text-left transition-all hover:bg-white/10 active:scale-[0.98]"
                                onclick={() => applyResult(result)}
                            >
                                <div class="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#1a1a1a] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                                    {#if result.cover_url}
                                        <img src={result.cover_url} alt="Cover" class="h-full w-full object-cover" />
                                    {/if}
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-base font-bold text-white group-hover:text-purple-300 transition-colors">{result.title}</p>
                                    <p class="truncate text-xs font-medium text-white/40">{result.artist}</p>
                                    <p class="truncate text-[11px] uppercase tracking-wider text-white/20 mt-0.5">{result.album}</p>
                                </div>
                                <div class="shrink-0 pl-2">
                                    <div class="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/0 group-hover:text-purple-400 group-hover:bg-purple-500/10 transition-all">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                                        </svg>
                                    </div>
                                </div>
                            </button>
                        {/each}
                    </div>
                {:else}
                    <div class="flex h-full flex-col items-center justify-center px-8 text-center text-white/40">
                        <svg xmlns="http://www.w3.org/2000/svg" class="mb-4 h-12 w-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p>Busca en iTunes para encontrar los metadatos correctos.</p>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
