import { authenticateUser, createSession } from '$lib/server/auth.js';
import { json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, cookies }) {
    const { email, password } = await request.json();

    if (!email || !password) {
        return json({ error: 'Email and password are required' }, { status: 400 });
    }

    const user = await authenticateUser(email, password);
    if (!user) {
        return json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const { sessionId, expiresAt } = await createSession(user.id);

    cookies.set('session_id', sessionId, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: false, // Set to true in production with HTTPS
        expires: expiresAt
    });

    return json({ user });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ cookies }) {
    const sessionId = cookies.get('session_id');
    if (sessionId) {
        const { deleteSession } = await import('$lib/server/auth.js');
        await deleteSession(sessionId);
        cookies.delete('session_id', { path: '/' });
    }
    return json({ success: true });
}
