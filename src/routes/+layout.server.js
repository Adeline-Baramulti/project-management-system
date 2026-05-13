import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, url }) {
    // Public routes that don't need auth
    const publicRoutes = ['/login'];
    if (publicRoutes.some(r => url.pathname.startsWith(r))) {
        return { user: locals.user || null };
    }

    if (!locals.user) {
        throw redirect(303, '/login');
    }

    return {
        user: locals.user
    };
}
