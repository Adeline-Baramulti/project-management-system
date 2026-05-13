import { json } from '@sveltejs/kit';
import { query, queryOne, insert } from '$lib/server/db.js';
import { logActivity } from '$lib/server/progress.js';

/** GET /api/projects/[id]/comments?entity_type=project&entity_id=... */
export async function GET({ params, url }) {
    const entityType = url.searchParams.get('entity_type') || 'project';
    const entityId = url.searchParams.get('entity_id') || params.id;

    const comments = await query(
        `SELECT c.*, u.full_name as user_name, u.email as user_email, u.avatar_url
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.project_id = ? AND c.entity_type = ? AND c.entity_id = ?
         ORDER BY c.created_at ASC`,
        [params.id, entityType, entityId]
    );
    return json(comments);
}

/** POST /api/projects/[id]/comments - Add a comment */
export async function POST({ params, request, locals }) {
    const user = locals.user;
    if (!user) return json({ error: 'Auth required' }, { status: 401 });

    const { content, entity_type = 'project', entity_id } = await request.json();
    if (!content?.trim()) return json({ error: 'Comment cannot be empty' }, { status: 400 });

    const eid = entity_id || params.id;
    const commentId = await insert(
        `INSERT INTO comments (entity_type, entity_id, project_id, user_id, content)
         VALUES (?, ?, ?, ?, ?)`,
        [entity_type, eid, params.id, user.id, content.trim()]
    );

    await logActivity(params.id, user.id, entity_type, eid, 'comment_added',
        `Comment added`);

    const comment = await queryOne(
        `SELECT c.*, u.full_name as user_name, u.email as user_email, u.avatar_url
         FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
        [commentId]
    );
    return json(comment, { status: 201 });
}

/** DELETE /api/projects/[id]/comments?comment_id=... - Author or admin only */
export async function DELETE({ params, url, locals }) {
    const user = locals.user;
    const commentId = url.searchParams.get('comment_id');
    if (!commentId) return json({ error: 'comment_id required' }, { status: 400 });

    const comment = await queryOne('SELECT user_id FROM comments WHERE id = ?', [commentId]);
    if (!comment) return json({ error: 'Not found' }, { status: 404 });
    if (comment.user_id !== user.id && user.role !== 'admin') {
        return json({ error: 'Only the author or an admin can delete this comment' }, { status: 403 });
    }

    await query('DELETE FROM comments WHERE id = ?', [commentId]);
    return json({ success: true });
}
