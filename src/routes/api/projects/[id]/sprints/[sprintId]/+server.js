import { json } from '@sveltejs/kit';
import { query, queryOne } from '$lib/server/db.js';
import { requireRole } from '$lib/server/auth.js';
import { logActivity } from '$lib/server/progress.js';

const ALLOWED = ['name', 'goal', 'start_date', 'end_date', 'status', 'sort_order'];

/** PATCH /api/projects/[id]/sprints/[sprintId] */
export async function PATCH({ params, request, locals }) {
    const user = locals.user;
    if (!requireRole(user, 'admin', 'project_manager')) {
        return json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const data = await request.json();
    const updates = [];
    const values = [];
    for (const [k, v] of Object.entries(data)) {
        if (ALLOWED.includes(k)) {
            updates.push(`${k} = ?`);
            values.push(v === '' ? null : v);
        }
    }
    if (updates.length === 0) return json({ error: 'No valid fields' }, { status: 400 });

    // Enforce: only one Active sprint per project
    if (data.status === 'Active') {
        await query(
            `UPDATE sprints SET status = 'Planned'
             WHERE project_id = ? AND id <> ? AND status = 'Active'`,
            [params.id, params.sprintId]
        );
    }

    values.push(params.sprintId, params.id);
    await query(
        `UPDATE sprints SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`,
        values
    );

    await logActivity(params.id, user.id, 'project', params.id, 'updated',
        `Sprint #${params.sprintId} updated: ${Object.keys(data).join(', ')}`);

    return json({ success: true });
}

/** DELETE /api/projects/[id]/sprints/[sprintId] - Detaches tasks (sets sprint_id NULL) then deletes */
export async function DELETE({ params, locals }) {
    const user = locals.user;
    if (!requireRole(user, 'admin', 'project_manager')) {
        return json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const sprint = await queryOne(
        'SELECT name FROM sprints WHERE id = ? AND project_id = ?',
        [params.sprintId, params.id]
    );
    if (!sprint) return json({ error: 'Sprint not found' }, { status: 404 });

    // FK is ON DELETE SET NULL, but we update explicitly for clarity
    await query('UPDATE tasks SET sprint_id = NULL WHERE sprint_id = ?', [params.sprintId]);
    await query('DELETE FROM sprints WHERE id = ? AND project_id = ?',
        [params.sprintId, params.id]);

    await logActivity(params.id, user.id, 'project', params.id, 'deleted',
        `Sprint "${sprint.name}" deleted`);

    return json({ success: true });
}
