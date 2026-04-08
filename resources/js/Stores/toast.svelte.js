let timeout = null;

export const toastState = $state({
    message: '',
    visible: false,
    icon: null,
});

export function showToast(message, icon = null, duration = 1800) {
    if (timeout) clearTimeout(timeout);

    toastState.message = message;
    toastState.icon = icon;
    toastState.visible = true;

    timeout = setTimeout(() => {
        toastState.visible = false;
        timeout = null;
    }, duration);
}
