import { json } from '@sveltejs/kit';
import { query, insert } from '$lib/server/db.js';
import { requireRole } from '$lib/server/auth.js';
import { logActivity } from '$lib/server/progress.js';

/** GET /api/projects/[id]/sprints - List sprints with task counts */
export async function GET({ params }) {
    const sprints = await query(
        `SELECT s.*,
                (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id) AS task_count,
                (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id AND status = 'Completed') AS task_done,
                (SELECT COALESCE(SUM(story_points), 0) FROM tasks WHERE sprint_id = s.id) AS total_points,
                (SELECT COALESCE(SUM(story_points), 0) FROM tasks WHERE sprint_id = s.id AND status = 'Completed') AS done_points
         FROM sprints s
         WHERE s.project_id = ?
         ORDER BY
            CASE s.status WHEN 'Active' THEN 0 WHEN 'Planned' THEN 1 WHEN 'Completed' THEN 2 ELSE 3 END,
            s.start_date, s.id`,
        [params.id]
    );
    return json(sprints);
}

/** POST /api/projects/[id]/sprints - Create a sprint */
export async function POST({ params, request, locals }) {
    const user = locals.user;
    if (!requireRole(user, 'admin', 'project_manager')) {
        return json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { name, goal, start_date, end_date, status } = await request.json();
    if (!name?.trim()) return json({ error: 'Sprint name is required' }, { status: 400 });

    const sprintId = await insert(
        `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [params.id, name.trim(), goal || null, start_date || null, end_date || null,
         status || 'Planned', user.id]
    );

    await logActivity(params.id, user.id, 'project', params.id, 'created',
        `Sprint "${name}" created`);

    return json({ id: sprintId }, { status: 201 });
}
