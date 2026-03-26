import './bootstrap';
import '../css/app.css';

import { createInertiaApp } from '@inertiajs/svelte';
import { mount } from 'svelte';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import Layout from './Layouts/Layout.svelte';

createInertiaApp({
    resolve: (name) => {
        const page = resolvePageComponent(
            `./Pages/${name}.svelte`,
            import.meta.glob('./Pages/**/*.svelte', { eager: true }),
        );

        return page.then((module) => {
            if (module.default && !module.default.layout) {
                module.default.layout = Layout;
            }
            return module;
        });
    },
    setup({ el, App, props }) {
        mount(App, { target: el, props });
    },
});
