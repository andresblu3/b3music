<script>
    import { router } from "@inertiajs/svelte";
    import { fade, fly } from "svelte/transition";
    import { flip } from "svelte/animate";
    import { onMount } from "svelte";

    let { files, importedPaths } = $props();

    let isImporting = $state(false);
    let selectedPaths = $state([]);
    let missingPermissions = $state(false);

    onMount(() => {
        if (window.AndroidBridge && typeof window.AndroidBridge.hasAudioPermissions === 'function') {
            missingPermissions = !window.AndroidBridge.hasAudioPermissions();
        }
    });

    function requestPermissions() {
        if (window.AndroidBridge) {
            window.AndroidBridge.requestAudioPermissions();
            // Start polling for permission status
            const poll = setInterval(() => {
                if (window.AndroidBridge.hasAudioPermissions()) {
                    clearInterval(poll);
                    missingPermissions = false;
                    // Reload data from Laravel so PHP's scanner can finally read the disk!
                    router.reload({ only: ['files'] });
                }
            }, 1000);
        }
    }

    function isImported(path) {
        return importedPaths.includes(path);
    }

    function toggleSelection(path) {
        if (isImported(path)) return;

        if (selectedPaths.includes(path)) {
            selectedPaths = selectedPaths.filter((p) => p !== path);
        } else {
            selectedPaths = [...selectedPaths, path];
        }
    }

    function formatSize(bytes) {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }

    function importSelected() {
        if (selectedPaths.length === 0 || isImporting) return;

        isImporting = true;

        router.post(
            "/audio-browser/import",
            { paths: selectedPaths },
            {
                onFinish: () => {
                    isImporting = false;
                    selectedPaths = [];
                },
            },
        );
    }

    function selectAll() {
        const importableFiles = files.filter((f) => !isImported(f.path));

        if (selectedPaths.length === importableFiles.length) {
            selectedPaths = [];
        } else {
            selectedPaths = importableFiles.map((f) => f.path);
        }
    }

    // Group files by folder for better organization
    const groupedFiles = $derived(() => {
        const groups = {};
        for (const file of files) {
            if (!groups[file.folder]) {
                groups[file.folder] = [];
            }
            groups[file.folder].push(file);
        }
        return groups;
    });
</script>

<div
    class="flex h-screen flex-col bg-black overflow-hidden"
    in:fade={{ duration: 300 }}
>
    <!-- Header -->
    <header
        class="flex-none px-6 pt-10 pb-6 border-b border-white/5 bg-black/80 backdrop-blur-xl z-10 sticky top-0"
    >
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
                <a
                    href="/"
                    class="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10 active:scale-95 transition-all outline-none"
                    aria-label="Back to Music"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M15 19l-7-7 7-7"
                        />
                    </svg>
                </a>
                <div>
                    <h1 class="text-2xl font-bold tracking-tight text-white">
                        Archivos del dispositivo
                    </h1>
                    <p class="text-xs text-white/40">
                        {files.length} archivos encontrados
                    </p>
                </div>
            </div>

            {#if files.length > 0}
                <button
                    type="button"
                    onclick={selectAll}
                    class="text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors"
                >
                    Seleccionar todos
                </button>
            {/if}
        </div>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-6 py-4 pb-32">
        {#if missingPermissions}
            <div
                class="flex h-full flex-col items-center justify-center text-center"
            >
                <div class="mb-4 rounded-full bg-purple-500/20 p-4 text-purple-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </div>
                <h3 class="text-lg font-medium text-white">
                    Permiso de Almacenamiento
                </h3>
                <p class="mt-2 text-sm text-white/40 max-w-xs">
                    Para buscar tus canciones locales, Drip necesita permiso para leer los archivos multimedia de tu dispositivo.
                </p>
                <button onclick={requestPermissions} class="mt-6 rounded-full bg-white text-black px-6 py-2.5 font-medium hover:bg-gray-200 active:scale-95 transition-all">
                    Conceder Acceso
                </button>
            </div>
        {:else if files.length === 0}
            <div
                class="flex h-full flex-col items-center justify-center text-center"
            >
                <div class="mb-4 rounded-full bg-white/5 p-4 text-white/30">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-10 w-10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                        />
                    </svg>
                </div>
                <h3 class="text-lg font-medium text-white">
                    No se encontraron archivos de audio
                </h3>
                <p class="mt-2 text-sm text-white/40 max-w-xs">
                    No se encontraron archivos de audio en la carpeta de música.
                </p>
            </div>
        {:else}
            {#each Object.entries(groupedFiles()) as [folder, folderFiles]}
                <div class="mb-8 last:mb-0">
                    <h2
                        class="mb-4 flex items-center gap-2 text-sm font-medium text-white/50 sticky top-0 bg-black py-2 z-10"
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
                                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                            />
                        </svg>
                        {folder}
                    </h2>

                    <div class="space-y-2">
                        {#each folderFiles as file (file.path)}
                            {@const imported = isImported(file.path)}
                            {@const selected = selectedPaths.includes(
                                file.path,
                            )}

                            <button
                                type="button"
                                class="w-full flex items-center justify-between rounded-xl border p-4 text-left transition-all outline-none"
                                class:border-white_5={!selected && !imported}
                                class:bg-white_5={!selected && !imported}
                                class:hover:bg-white_10={!imported}
                                class:border-purple-500_50={selected}
                                class:bg-purple-500_10={selected}
                                class:bg-transparent={imported}
                                class:opacity-50={imported}
                                class:cursor-not-allowed={imported}
                                class:cursor-pointer={!imported}
                                onclick={() => toggleSelection(file.path)}
                                disabled={imported}
                            >
                                <div class="flex items-center gap-4 min-w-0">
                                    <div
                                        class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-5 w-5"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path
                                                d="M9 18V5l12-2v13"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            />
                                            <circle
                                                cx="6"
                                                cy="18"
                                                r="3"
                                                fill="currentColor"
                                            />
                                            <circle
                                                cx="18"
                                                cy="16"
                                                r="3"
                                                fill="currentColor"
                                            />
                                        </svg>
                                    </div>
                                    <div class="min-w-0 pr-4">
                                        <p
                                            class="truncate font-medium text-white"
                                            class:text-white_50={imported}
                                        >
                                            {file.name}
                                        </p>
                                        <p
                                            class="mt-0.5 text-xs text-white/40 uppercase tracking-wider"
                                        >
                                            {file.extension} • {formatSize(
                                                file.size,
                                            )}
                                            {#if imported}
                                                <span
                                                    class="ml-2 inline-flex items-center rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70"
                                                >
                                                    Importado
                                                </span>
                                            {/if}
                                        </p>
                                    </div>
                                </div>

                                <div class="flex-shrink-0">
                                    <div
                                        class="flex h-6 w-6 items-center justify-center rounded-full border transition-colors"
                                        class:border-white_20={!selected &&
                                            !imported}
                                        class:border-transparent={selected ||
                                            imported}
                                        class:bg-purple-500={selected}
                                        class:bg-white_10={imported}
                                    >
                                        {#if selected || imported}
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="h-4 w-4"
                                                class:text-white={selected}
                                                class:text-white_50={imported}
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="3"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                        {/if}
                                    </div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
    </div>

    <!-- Floating Action Bar -->
    {#if selectedPaths.length > 0}
        <div
            class="absolute bottom-6 left-6 right-6 z-20"
            in:fly={{ y: 20, duration: 300 }}
            out:fade={{ duration: 200 }}
        >
            <button
                type="button"
                onclick={importSelected}
                disabled={isImporting}
                class="flex w-full items-center justify-between overflow-hidden rounded-2xl bg-purple-600 px-6 py-4 font-semibold text-white shadow-[0_8px_32px_rgba(168,85,247,0.4)] transition-all hover:bg-purple-500 active:scale-95 disabled:opacity-80 disabled:active:scale-100"
            >
                <div class="flex items-center gap-3">
                    {#if isImporting}
                        <div
                            class="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"
                        ></div>
                        <span>Importando...</span>
                    {:else}
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                        </svg>
                        <span
                            >Import {selectedPaths.length} Track{selectedPaths.length ===
                            1
                                ? ""
                                : "s"}</span
                        >
                    {/if}
                </div>

                <div
                    class="flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-black/20 px-2 text-sm"
                >
                    Listo
                </div>
            </button>
        </div>
    {/if}
</div>
