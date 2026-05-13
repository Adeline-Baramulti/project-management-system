import { validateSession } from '$lib/server/auth.js';
import { redirect } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
    // Get session from cookie
    const sessionId = event.cookies.get('session_id');

    if (sessionId) {
        const user = await validateSession(sessionId);
        if (user) {
            event.locals.user = user;
        } else {
            // Session expired, clear cookie
            event.cookies.delete('session_id', { path: '/' });
        }
    }

    // Protect app routes - redirect to login if not authenticated
    if (event.url.pathname.startsWith('/projects') ||
        event.url.pathname.startsWith('/my-tasks') ||
        event.url.pathname.startsWith('/admin')) {
        if (!event.locals.user) {
            throw redirect(303, '/login');
        }
    }

    // Protect admin routes
    if (event.url.pathname.startsWith('/admin')) {
        if (event.locals.user?.role !== 'admin') {
            throw redirect(303, '/projects');
        }
    }

    // Protect API routes
    if (event.url.pathname.startsWith('/api/') && !event.url.pathname.startsWith('/api/auth')) {
        if (!event.locals.user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    return resolve(event);
}
