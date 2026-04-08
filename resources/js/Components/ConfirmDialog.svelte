<script>
    import { fade, scale } from "svelte/transition";

    let {
        show = false,
        title = "Confirmar acción",
        message = "",
        confirmLabel = "Continuar",
        cancelLabel = "Cancelar",
        busy = false,
        tone = "danger",
        onCancel,
        onConfirm,
    } = $props();

    const confirmToneClasses = {
        danger: "bg-rose-500 text-white hover:bg-rose-400",
        primary: "bg-white text-black hover:bg-white/90",
    };

    function close() {
        if (busy) {
            return;
        }

        onCancel?.();
    }

    function confirm() {
        if (busy) {
            return;
        }

        onConfirm?.();
    }

    function handleWindowKeydown(event) {
        if (event.key === "Escape") {
            close();
        }
    }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if show}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-6 backdrop-blur-md sm:items-center sm:pb-6"
        in:fade={{ duration: 180 }}
        out:fade={{ duration: 120 }}
        onclick={(event) => {
            if (event.target === event.currentTarget) {
                close();
            }
        }}
    >
        <div
            class="w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/10 bg-[#121212] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            in:scale={{ start: 0.95, duration: 180 }}
            out:scale={{ start: 1, end: 0.98, duration: 120 }}
        >
            <div class="border-b border-white/5 px-6 pb-4 pt-5">
                <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-300">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.66 18h16.68a1 1 0 00.87-1.5l-7.5-13a1 1 0 00-1.74 0z"
                        />
                    </svg>
                </div>

                <h2 class="text-lg font-semibold tracking-tight text-white">
                    {title}
                </h2>

                {#if message}
                    <p class="mt-2 text-sm leading-relaxed text-white/55">
                        {message}
                    </p>
                {/if}
            </div>

            <div class="grid grid-cols-2 gap-3 p-4">
                <button
                    type="button"
                    class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
                    onclick={close}
                    disabled={busy}
                >
                    {cancelLabel}
                </button>

                <button
                    type="button"
                    class={`rounded-2xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-70 ${confirmToneClasses[tone] ?? confirmToneClasses.primary}`}
                    onclick={confirm}
                    disabled={busy}
                >
                    {#if busy}
                        <span class="inline-flex items-center gap-2">
                            <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                            Procesando...
                        </span>
                    {:else}
                        {confirmLabel}
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}
