import { json } from '@sveltejs/kit';
import { query, queryOne } from '$lib/server/db.js';
import { requireRole } from '$lib/server/auth.js';
import { recalcProjectProgress, logActivity } from '$lib/server/progress.js';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

/** GET /api/projects/[id] - Get project with full WBS tree */
export async function GET({ params, locals }) {
    const project = await queryOne(
        `SELECT p.*, u.full_name as manager_name, u.email as manager_email,
                creator.full_name as created_by_name
         FROM projects p
         JOIN users u ON p.manager_id = u.id
         JOIN users creator ON p.created_by = creator.id
         WHERE p.id = ?`,
        [params.id]
    );

    if (!project) {
        return json({ error: 'Project not found' }, { status: 404 });
    }

    // Load full WBS tree
    const phases = await query(
        'SELECT * FROM phases WHERE project_id = ? ORDER BY sort_order',
        [params.id]
    );

    for (const phase of phases) {
        phase.tasks = await query(
            `SELECT t.*, u.full_name as assignee_name
             FROM tasks t
             LEFT JOIN users u ON t.assigned_to = u.id
             WHERE t.phase_id = ? ORDER BY t.sort_order`,
            [phase.id]
        );

        for (const task of phase.tasks) {
            // Load checklist for task
            task.checklist = await query(
                'SELECT * FROM checklist_items WHERE entity_type = ? AND entity_id = ? ORDER BY sort_order',
                ['task', task.id]
            );

            task.subTasks = await query(
                `SELECT st.*, u.full_name as assignee_name
                 FROM sub_tasks st
                 LEFT JOIN users u ON st.assigned_to = u.id
                 WHERE st.task_id = ? ORDER BY st.sort_order`,
                [task.id]
            );

            for (const st of task.subTasks) {
                // Load checklist for sub_task
                st.checklist = await query(
                    'SELECT * FROM checklist_items WHERE entity_type = ? AND entity_id = ? ORDER BY sort_order',
                    ['sub_task', st.id]
                );

                st.subSubTasks = await query(
                    `SELECT sst.*, u.full_name as assignee_name
                     FROM sub_sub_tasks sst
                     LEFT JOIN users u ON sst.assigned_to = u.id
                     WHERE sst.sub_task_id = ? ORDER BY sst.sort_order`,
                    [st.id]
                );

                for (const sst of st.subSubTasks) {
                    sst.checklist = await query(
                        'SELECT * FROM checklist_items WHERE entity_type = ? AND entity_id = ? ORDER BY sort_order',
                        ['sub_sub_task', sst.id]
                    );
                }
            }
        }
    }

    project.phases = phases;

    // Load sprints with rollup counts
    project.sprints = await query(
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

    // Load recent activity
    project.activity = await query(
        `SELECT al.*, u.full_name as user_name
         FROM activity_log al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.project_id = ?
         ORDER BY al.created_at DESC
         LIMIT 20`,
        [params.id]
    );

    // Load attachments count
    const attachCount = await queryOne(
        'SELECT COUNT(*) as count FROM attachments WHERE project_id = ?',
        [params.id]
    );
    project.attachment_count = attachCount?.count || 0;

    // Load project-level discussion comments (entity_type='project', entity_id=project.id)
    project.comments = await query(
        `SELECT c.*, u.full_name as user_name, u.email as user_email, u.avatar_url
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.project_id = ? AND c.entity_type = 'project' AND c.entity_id = ?
         ORDER BY c.created_at ASC`,
        [params.id, params.id]
    );

    return json(project);
}

/** PATCH /api/projects/[id] - Update project fields */
export async function PATCH({ params, request, locals }) {
    const user = locals.user;

    if (!requireRole(user, 'admin', 'project_manager')) {
        return json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const data = await request.json();
    const allowedFields = ['name', 'description', 'category', 'company', 'department',
                           'manager_id', 'status', 'health', 'planned_start', 'planned_end',
                           'actual_start', 'actual_end', 'notes'];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            updates.push(`${field} = ?`);
            values.push(data[field] || null);
        }
    }

    if (updates.length === 0) {
        return json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(params.id);
    await query(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, values);

    await logActivity(params.id, user.id, 'project', params.id, 'updated',
        `Project updated: ${Object.keys(data).join(', ')}`);

    const project = await queryOne('SELECT * FROM projects WHERE id = ?', [params.id]);
    return json(project);
}

/** DELETE /api/projects/[id] - Cascades DB rows AND removes the project's upload folder. */
export async function DELETE({ params, locals }) {
    if (!requireRole(locals.user, 'admin')) {
        return json({ error: 'Only admins can delete projects' }, { status: 403 });
    }

    await query('DELETE FROM projects WHERE id = ?', [params.id]);

    // Remove the project's upload folder (and everything inside).
    // Best-effort: failure here shouldn't fail the API call — the DB is already gone.
    const projUploads = path.join(UPLOAD_DIR, String(params.id));
    if (existsSync(projUploads)) {
        try { await rm(projUploads, { recursive: true, force: true }); }
        catch (e) { console.warn('[projects DELETE] failed to remove', projUploads, e?.message); }
    }

    return json({ success: true });
}
