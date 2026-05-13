import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db.js';

/** GET /api/my-tasks - Get all tasks assigned to current user */
export async function GET({ locals, url }) {
    const userId = locals.user.id;
    const status = url.searchParams.get('status');
    const projectId = url.searchParams.get('project_id');

    let conditions = ['assigned_to = ?'];
    let params = [userId];

    if (status && status !== 'all') {
        conditions.push('status = ?');
        params.push(status);
    }
    if (projectId) {
        conditions.push('project_id = ?');
        params.push(projectId);
    }

    const whereClause = conditions.join(' AND ');

    // Tasks
    const tasks = await query(
        `SELECT 'task' as item_type, t.id, t.name, t.status, t.priority,
                t.planned_start, t.planned_end, t.actual_start, t.actual_end,
                t.description, t.notes,
                t.project_id, p.name as project_name, p.project_code,
                ph.name as phase_name, ph.id as phase_id,
                t.updated_at
         FROM tasks t
         JOIN phases ph ON t.phase_id = ph.id
         JOIN projects p ON t.project_id = p.id
         WHERE ${whereClause.replace('assigned_to', 't.assigned_to').replace('status', 't.status').replace('project_id', 't.project_id')}
         ORDER BY
            CASE t.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
            COALESCE(t.planned_end, '9999-12-31')`,
        params
    );

    // Sub-tasks
    const subTasks = await query(
        `SELECT 'sub_task' as item_type, st.id, st.name, st.status,
                COALESCE(st.priority, t.priority) as priority,
                st.planned_start, st.planned_end, st.actual_start, st.actual_end,
                st.description, st.notes,
                st.project_id, p.name as project_name, p.project_code,
                ph.name as phase_name, ph.id as phase_id,
                st.updated_at,
                t.name as parent_task_name
         FROM sub_tasks st
         JOIN tasks t ON st.task_id = t.id
         JOIN phases ph ON t.phase_id = ph.id
         JOIN projects p ON st.project_id = p.id
         WHERE ${whereClause.replace('assigned_to', 'st.assigned_to').replace('status', 'st.status').replace('project_id', 'st.project_id')}
         ORDER BY
            CASE COALESCE(st.priority, t.priority) WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
            COALESCE(st.planned_end, '9999-12-31')`,
        params
    );

    // Sub-sub-tasks
    const subSubTasks = await query(
        `SELECT 'sub_sub_task' as item_type, sst.id, sst.name, sst.status,
                COALESCE(sst.priority, st.priority, t.priority) as priority,
                sst.planned_start, sst.planned_end, sst.actual_start, sst.actual_end,
                sst.description, sst.notes,
                sst.project_id, p.name as project_name, p.project_code,
                ph.name as phase_name, ph.id as phase_id,
                sst.updated_at,
                t.name as parent_task_name,
                st.name as parent_sub_task_name
         FROM sub_sub_tasks sst
         JOIN sub_tasks st ON sst.sub_task_id = st.id
         JOIN tasks t ON st.task_id = t.id
         JOIN phases ph ON t.phase_id = ph.id
         JOIN projects p ON sst.project_id = p.id
         WHERE ${whereClause.replace('assigned_to', 'sst.assigned_to').replace('status', 'sst.status').replace('project_id', 'sst.project_id')}
         ORDER BY
            CASE COALESCE(sst.priority, st.priority, t.priority) WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
            COALESCE(sst.planned_end, '9999-12-31')`,
        params
    );

    // Merge and sort by priority then date
    const allItems = [...tasks, ...subTasks, ...subSubTasks];

    // Summary counts
    const summary = {
        total: allItems.length,
        not_started: allItems.filter(i => i.status === 'Not Started').length,
        in_progress: allItems.filter(i => i.status === 'In Progress').length,
        completed: allItems.filter(i => i.status === 'Completed').length,
        overdue: allItems.filter(i => i.planned_end && new Date(i.planned_end) < new Date() && i.status !== 'Completed').length
    };

    return json({ items: allItems, summary });
}
