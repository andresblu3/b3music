<script>
    import { Link, router } from "@inertiajs/svelte";
    import { fade, fly } from "svelte/transition";
    import { onDestroy, onMount } from "svelte";

    let { files, importedPaths } = $props();

    const filterOptions = [
        { id: "new", label: "Nuevos" },
        { id: "all", label: "Todos" },
        { id: "imported", label: "Importados" },
    ];

    let isImporting = $state(false);
    let selectedPaths = $state([]);
    let searchQuery = $state("");
    let filterMode = $state("new");
    let permissionState = $state("checking");

    let permissionPoll = null;
    let permissionTimeout = null;

    let importedPathSet = $derived.by(() => new Set(importedPaths));
    let filesByPath = $derived.by(
        () => new Map(files.map((file) => [file.path, file])),
    );

    let browserStats = $derived.by(() => {
        const importedCount = files.filter((file) =>
            importedPathSet.has(file.path),
        ).length;
        let importableBytes = 0;

        for (const file of files) {
            if (!importedPathSet.has(file.path)) {
                importableBytes += file.size || 0;
            }
        }

        return {
            total: files.length,
            imported: importedCount,
            fresh: files.length - importedCount,
            importableBytes,
        };
    });

    let visibleFiles = $derived.by(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();

        return files.filter((file) => {
            const imported = importedPathSet.has(file.path);

            if (filterMode === "new" && imported) {
                return false;
            }

            if (filterMode === "imported" && !imported) {
                return false;
            }

            if (!normalizedQuery) {
                return true;
            }

            return [
                file.name,
                file.extension,
                file.folder_label,
                file.folder_path,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(normalizedQuery);
        });
    });

    let groupedFiles = $derived.by(() => {
        const groups = new Map();

        for (const file of visibleFiles) {
            const key =
                file.folder_label ||
                file.folder_path ||
                file.folder ||
                "Sin carpeta";

            if (!groups.has(key)) {
                groups.set(key, []);
            }

            groups.get(key).push(file);
        }

        return Array.from(groups.entries());
    });

    let selectionSummary = $derived.by(() => {
        let size = 0;

        for (const path of selectedPaths) {
            size += filesByPath.get(path)?.size || 0;
        }

        return {
            count: selectedPaths.length,
            size,
        };
    });

    onMount(() => {
        resolvePermissionState();
    });

    onDestroy(() => {
        clearPermissionTimers();
    });

    function clearPermissionTimers() {
        if (permissionPoll) {
            clearInterval(permissionPoll);
            permissionPoll = null;
        }

        if (permissionTimeout) {
            clearTimeout(permissionTimeout);
            permissionTimeout = null;
        }
    }

    function resolvePermissionState() {
        if (
            !window.AndroidBridge ||
            typeof window.AndroidBridge.hasAudioPermissions !== "function"
        ) {
            permissionState = "granted";
            return;
        }

        permissionState = window.AndroidBridge.hasAudioPermissions()
            ? "granted"
            : "missing";
    }

    function requestPermissions() {
        if (
            !window.AndroidBridge ||
            typeof window.AndroidBridge.requestAudioPermissions !== "function"
        ) {
            permissionState = "granted";
            return;
        }

        clearPermissionTimers();
        permissionState = "requesting";
        window.AndroidBridge.requestAudioPermissions();

        permissionPoll = setInterval(() => {
            if (window.AndroidBridge.hasAudioPermissions()) {
                clearPermissionTimers();
                permissionState = "granted";
                router.reload({ only: ["files", "importedPaths"] });
            }
        }, 900);

        permissionTimeout = setTimeout(() => {
            if (permissionState !== "granted") {
                clearPermissionTimers();
                permissionState = "denied";
            }
        }, 15000);
    }

    function isImported(path) {
        return importedPathSet.has(path);
    }

    function toggleSelection(path) {
        if (isImported(path)) {
            return;
        }

        if (selectedPaths.includes(path)) {
            selectedPaths = selectedPaths.filter(
                (currentPath) => currentPath !== path,
            );
            return;
        }

        selectedPaths = [...selectedPaths, path];
    }

    function selectVisibleImportables() {
        const visibleImportablePaths = visibleFiles
            .filter((file) => !isImported(file.path))
            .map((file) => file.path);

        if (visibleImportablePaths.length === 0) {
            return;
        }

        const allVisibleSelected = visibleImportablePaths.every((path) =>
            selectedPaths.includes(path),
        );

        if (allVisibleSelected) {
            selectedPaths = selectedPaths.filter(
                (path) => !visibleImportablePaths.includes(path),
            );
            return;
        }

        const nextSelection = new Set(selectedPaths);

        for (const path of visibleImportablePaths) {
            nextSelection.add(path);
        }

        selectedPaths = Array.from(nextSelection);
    }

    function formatSize(bytes) {
        if (bytes === 0) {
            return "0 B";
        }

        const unit = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const index = Math.floor(Math.log(bytes) / Math.log(unit));

        return `${parseFloat((bytes / unit ** index).toFixed(2))} ${sizes[index]}`;
    }

    function importSelected() {
        if (selectedPaths.length === 0 || isImporting) {
            return;
        }

        isImporting = true;

        router.post(
            "/audio-browser/import",
            { paths: selectedPaths },
            {
                preserveScroll: true,
                onFinish: () => {
                    isImporting = false;
                    selectedPaths = [];
                },
            },
        );
    }
</script>

<div class="px-6 pb-10 pt-10" in:fade={{ duration: 220 }}>
    <section
        class="rounded-[2rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
    >
        <div class="flex items-start justify-between gap-4">
            <div>
                <p
                    class="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/35"
                >
                    Importador
                </p>
                <h1
                    class="mt-3 text-3xl font-black tracking-[-0.04em] text-white"
                >
                    Selecciona tu música del dispositivo
                </h1>
                <p class="mt-3 max-w-md text-sm leading-relaxed text-white/55">
                    Revisa carpetas, filtra por estado y arma el lote antes de
                    importar a la biblioteca.
                </p>
            </div>

            <Link
                href="/"
                class="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.4"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M15 19l-7-7 7-7"
                    />
                </svg>
                Biblioteca
            </Link>
        </div>
    </section>

    {#if permissionState === "missing" || permissionState === "requesting" || permissionState === "denied"}
        <div
            class="mt-6 rounded-[2rem] border border-white/8 bg-white/[0.03] p-6"
        >
            <div class="flex items-start gap-4">
                <div
                    class="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.4rem] bg-purple-500/12 text-purple-300"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-7 w-7"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                    </svg>
                </div>

                <div class="min-w-0 flex-1">
                    <h2 class="text-lg font-semibold text-white">
                        {permissionState === "requesting"
                            ? "Esperando permiso de lectura"
                            : permissionState === "denied"
                              ? "Permiso denegado o sin respuesta"
                              : "Hace falta acceso a multimedia"}
                    </h2>
                    <p class="mt-2 text-sm leading-relaxed text-white/48">
                        {permissionState === "requesting"
                            ? "Si aceptas el diálogo del sistema, refrescaré la lista automáticamente."
                            : permissionState === "denied"
                              ? "No pude confirmar el permiso. Puedes volver a intentarlo o revisar los permisos del dispositivo si no apareció el diálogo."
                              : "Para escanear canciones locales dentro del webview necesito permiso para leer los archivos multimedia del dispositivo."}
                    </p>

                    <div class="mt-5 flex flex-wrap gap-3">
                        <button
                            type="button"
                            class="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition-transform active:scale-[0.98] disabled:opacity-65"
                            onclick={requestPermissions}
                            disabled={permissionState === "requesting"}
                        >
                            {permissionState === "requesting"
                                ? "Solicitando..."
                                : "Conceder acceso"}
                        </button>

                        {#if permissionState === "denied"}
                            <button
                                type="button"
                                class="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/6 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                                onclick={resolvePermissionState}
                            >
                                Volver a comprobar
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <section
            class="mt-6 rounded-[1.8rem] border border-white/8 bg-white/[0.03] p-4"
        >
            <div class="flex flex-col gap-4">
                <div class="relative">
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="Buscar por nombre, extensión o carpeta..."
                        class="w-full rounded-[1.35rem] border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/28 outline-none transition-colors focus:border-white/20"
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

                <div
                    class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div class="flex flex-wrap gap-2">
                        {#each filterOptions as option}
                            <button
                                type="button"
                                class={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                                    filterMode === option.id
                                        ? "bg-white text-black"
                                        : "bg-white/6 text-white/45 hover:bg-white/10 hover:text-white/70"
                                }`}
                                onclick={() => {
                                    filterMode = option.id;
                                }}
                            >
                                {option.label}
                            </button>
                        {/each}
                    </div>

                    <button
                        type="button"
                        class="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70 transition-colors hover:bg-white/10"
                        onclick={selectVisibleImportables}
                        disabled={visibleFiles.filter(
                            (file) => !isImported(file.path),
                        ).length === 0}
                    >
                        Seleccionar visibles
                    </button>
                </div>
            </div>
        </section>

        {#if files.length === 0}
            <div
                class="mt-8 rounded-[2rem] border border-white/8 bg-white/[0.03] px-6 py-14 text-center"
            >
                <div
                    class="mx-auto mb-4 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.6rem] bg-white/6 text-white/28"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-8 w-8"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                        />
                    </svg>
                </div>
                <h2 class="text-lg font-semibold text-white">
                    No se encontraron archivos de audio.
                </h2>
                <p class="mt-2 text-sm text-white/45">
                    Revisa que el dispositivo tenga música en las carpetas
                    escaneadas o vuelve a comprobar los permisos.
                </p>
            </div>
        {:else if visibleFiles.length === 0}
            <div
                class="mt-8 rounded-[2rem] border border-white/8 bg-white/[0.03] px-6 py-14 text-center"
            >
                <h2 class="text-lg font-semibold text-white">
                    No hay resultados con los filtros actuales.
                </h2>
                <p class="mt-2 text-sm text-white/45">
                    Cambia la búsqueda o el filtro para ver más archivos
                    disponibles.
                </p>
            </div>
        {:else}
            <div class="mt-8 flex flex-col gap-6">
                {#each groupedFiles as [folder, folderFiles]}
                    <section in:fly={{ y: 18, opacity: 0, duration: 220 }}>
                        <div
                            class="mb-3 flex items-center justify-between gap-3"
                        >
                            <div>
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-white/25"
                                >
                                    Carpeta
                                </p>
                                <h2
                                    class="mt-1 text-sm font-semibold text-white/75"
                                >
                                    {folder}
                                </h2>
                            </div>

                            <p class="text-xs text-white/30">
                                {folderFiles.length} archivo{folderFiles.length ===
                                1
                                    ? ""
                                    : "s"}
                            </p>
                        </div>

                        <div class="space-y-2">
                            {#each folderFiles as file (file.path)}
                                {@const imported = isImported(file.path)}
                                {@const selected = selectedPaths.includes(
                                    file.path,
                                )}

                                <button
                                    type="button"
                                    class={`flex w-full items-center justify-between gap-4 rounded-[1.5rem] border px-4 py-4 text-left transition-colors ${
                                        selected
                                            ? "border-white/14 bg-white/[0.08]"
                                            : imported
                                              ? "border-white/6 bg-transparent opacity-55"
                                              : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
                                    }`}
                                    onclick={() => toggleSelection(file.path)}
                                    disabled={imported}
                                >
                                    <div
                                        class="flex min-w-0 items-center gap-4"
                                    >
                                        <div
                                            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] bg-white/8 text-white/65"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="h-6 w-6"
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

                                        <div class="min-w-0">
                                            <p
                                                class={`truncate text-sm font-semibold ${imported ? "text-white/55" : "text-white"}`}
                                            >
                                                {file.name}
                                            </p>
                                            <p
                                                class="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-white/28"
                                            >
                                                {file.extension} • {formatSize(
                                                    file.size,
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <div
                                        class="flex shrink-0 items-center gap-3"
                                    >
                                        {#if imported}
                                            <span
                                                class="rounded-full bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55"
                                            >
                                                Importado
                                            </span>
                                        {/if}

                                        <div
                                            class={`flex h-7 w-7 items-center justify-center rounded-full border ${
                                                selected
                                                    ? "border-transparent bg-white text-black"
                                                    : imported
                                                      ? "border-transparent bg-white/8 text-white/45"
                                                      : "border-white/16 bg-transparent text-transparent"
                                            }`}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="h-4 w-4"
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
                                        </div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </section>
                {/each}
            </div>
        {/if}
    {/if}
</div>

{#if permissionState === "granted" && selectionSummary.count > 0}
    <div
        class="fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-[55] px-4"
        in:fly={{ y: 24, duration: 220 }}
        out:fade={{ duration: 120 }}
    >
        <div
            class="mx-auto max-w-md overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/75 shadow-[0_18px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl"
        >
            <div class="flex items-center justify-between gap-3 px-5 py-4">
                <div>
                    <p
                        class="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35"
                    >
                        Lote listo
                    </p>
                    <p class="mt-1 text-sm font-semibold text-white">
                        {selectionSummary.count} canción{selectionSummary.count ===
                        1
                            ? ""
                            : "es"} • {formatSize(selectionSummary.size)}
                    </p>
                </div>

                <button
                    type="button"
                    class="inline-flex items-center justify-center rounded-[1.15rem] bg-white px-4 py-3 text-sm font-semibold text-black transition-transform active:scale-[0.98] disabled:opacity-65"
                    onclick={importSelected}
                    disabled={isImporting}
                >
                    {#if isImporting}
                        <span class="inline-flex items-center gap-2">
                            <span
                                class="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black"
                            ></span>
                            Importando...
                        </span>
                    {:else}
                        Importar
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}
