import { json } from '@sveltejs/kit';
import { query, queryOne, insert } from '$lib/server/db.js';
import { recalcProjectProgress, deriveAndUpdateStatuses, logActivity } from '$lib/server/progress.js';

/** POST /api/projects/[id]/wbs - Create a WBS item */
export async function POST({ params, request, locals }) {
    const projectId = params.id;
    const user = locals.user;
    const data = await request.json();
    const { type, parent_id, name, description, assigned_to, priority, status,
            planned_start, planned_end, actual_start, actual_end,
            weight, sort_order, notes } = data;

    let itemId;

    switch (type) {
        case 'phase': {
            const maxOrder = await queryOne(
                'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM phases WHERE project_id = ?',
                [projectId]
            );
            itemId = await insert(
                `INSERT INTO phases (project_id, name, weight, sort_order, planned_start, planned_end, actual_start, actual_end, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [projectId, name || '', weight || 0, sort_order ?? maxOrder.next_order,
                 planned_start || null, planned_end || null, actual_start || null, actual_end || null, notes || null]
            );
            break;
        }
        case 'task': {
            const maxOrder = await queryOne(
                'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM tasks WHERE phase_id = ?',
                [parent_id]
            );
            itemId = await insert(
                `INSERT INTO tasks (phase_id, project_id, name, description, assigned_to, status, priority,
                 planned_start, planned_end, actual_start, actual_end, sort_order, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [parent_id, projectId, name || '', description || null,
                 assigned_to || null, status || 'Not Started', priority || 'Medium',
                 planned_start || null, planned_end || null, actual_start || null, actual_end || null,
                 sort_order ?? maxOrder.next_order, notes || null]
            );
            break;
        }
        case 'sub_task': {
            const maxOrder = await queryOne(
                'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM sub_tasks WHERE task_id = ?',
                [parent_id]
            );
            // Inherit assignee from parent task if not specified
            let effectiveAssignee = assigned_to;
            if (!effectiveAssignee) {
                const parentTask = await queryOne('SELECT assigned_to FROM tasks WHERE id = ?', [parent_id]);
                effectiveAssignee = parentTask?.assigned_to || null;
            }
            itemId = await insert(
                `INSERT INTO sub_tasks (task_id, project_id, name, description, assigned_to, status, priority,
                 planned_start, planned_end, actual_start, actual_end, sort_order, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [parent_id, projectId, name || '', description || null,
                 effectiveAssignee, status || 'Not Started', priority || null,
                 planned_start || null, planned_end || null, actual_start || null, actual_end || null,
                 sort_order ?? maxOrder.next_order, notes || null]
            );
            break;
        }
        case 'sub_sub_task': {
            const maxOrder = await queryOne(
                'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM sub_sub_tasks WHERE sub_task_id = ?',
                [parent_id]
            );
            // Inherit assignee from parent chain
            let effectiveAssignee = assigned_to;
            if (!effectiveAssignee) {
                const parentSt = await queryOne(
                    `SELECT COALESCE(st.assigned_to, t.assigned_to) as inherited_assignee
                     FROM sub_tasks st JOIN tasks t ON st.task_id = t.id WHERE st.id = ?`,
                    [parent_id]
                );
                effectiveAssignee = parentSt?.inherited_assignee || null;
            }
            itemId = await insert(
                `INSERT INTO sub_sub_tasks (sub_task_id, project_id, name, description, assigned_to, status, priority,
                 planned_start, planned_end, actual_start, actual_end, sort_order, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [parent_id, projectId, name || '', description || null,
                 effectiveAssignee, status || 'Not Started', priority || null,
                 planned_start || null, planned_end || null, actual_start || null, actual_end || null,
                 sort_order ?? maxOrder.next_order, notes || null]
            );
            break;
        }
        case 'checklist': {
            // parent_id is the entity_id, checklist_parent_type tells us which table
            const parentType = data.checklist_parent_type || 'sub_sub_task';
            const maxOrder = await queryOne(
                'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM checklist_items WHERE entity_type = ? AND entity_id = ?',
                [parentType, parent_id]
            );
            itemId = await insert(
                'INSERT INTO checklist_items (entity_type, entity_id, project_id, title, sort_order) VALUES (?, ?, ?, ?, ?)',
                [parentType, parent_id, projectId, name || '', sort_order ?? maxOrder.next_order]
            );
            break;
        }
        default:
            return json({ error: 'Invalid type' }, { status: 400 });
    }

    await logActivity(projectId, user.id, type === 'checklist' ? 'checklist' : type, itemId, 'created',
        `${type} "${name}" added`);

    // Recalculate progress
    await deriveAndUpdateStatuses(projectId);
    await recalcProjectProgress(projectId);

    return json({ id: itemId, type }, { status: 201 });
}

/** PATCH /api/projects/[id]/wbs - Update a WBS item */
export async function PATCH({ params, request, locals }) {
    const projectId = params.id;
    const user = locals.user;
    const data = await request.json();
    const { type, item_id, ...fields } = data;

    const tableMap = {
        phase: 'phases',
        task: 'tasks',
        sub_task: 'sub_tasks',
        sub_sub_task: 'sub_sub_tasks',
        checklist: 'checklist_items'
    };

    const table = tableMap[type];
    if (!table || !item_id) {
        return json({ error: 'Invalid type or missing item_id' }, { status: 400 });
    }

    // Build dynamic update
    const allowedByType = {
        phase: ['name', 'weight', 'sort_order', 'planned_start', 'planned_end', 'actual_start', 'actual_end', 'notes'],
        task: ['name', 'description', 'assigned_to', 'status', 'priority', 'planned_start', 'planned_end', 'actual_start', 'actual_end', 'sort_order', 'notes', 'sprint_id', 'story_points', 'phase_id'],
        sub_task: ['name', 'description', 'assigned_to', 'status', 'priority', 'planned_start', 'planned_end', 'actual_start', 'actual_end', 'sort_order', 'notes'],
        sub_sub_task: ['name', 'description', 'assigned_to', 'status', 'priority', 'planned_start', 'planned_end', 'actual_start', 'actual_end', 'sort_order', 'notes'],
        checklist: ['title', 'is_checked', 'sort_order']
    };

    const allowed = allowedByType[type] || [];
    const updates = [];
    const values = [];
    let oldStatus = null;

    // Track status changes for activity log
    if (fields.status && type !== 'phase') {
        const old = await queryOne(`SELECT status FROM ${table} WHERE id = ?`, [item_id]);
        oldStatus = old?.status;
    }

    for (const [key, value] of Object.entries(fields)) {
        if (allowed.includes(key)) {
            updates.push(`${key} = ?`);
            values.push(value === '' ? null : value);
        }
    }

    if (updates.length === 0) {
        return json({ error: 'No valid fields to update' }, { status: 400 });
    }

    values.push(item_id);
    await query(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`, values);

    // Log status changes
    if (fields.status && oldStatus && oldStatus !== fields.status) {
        await logActivity(projectId, user.id, type, item_id, 'status_changed',
            `Status changed from "${oldStatus}" to "${fields.status}"`,
            oldStatus, fields.status);
    } else if (Object.keys(fields).length > 0) {
        await logActivity(projectId, user.id, type === 'checklist' ? 'checklist' : type, item_id, 'updated',
            `${type} updated: ${Object.keys(fields).join(', ')}`);
    }

    // Recalculate progress after any update
    await deriveAndUpdateStatuses(projectId);
    await recalcProjectProgress(projectId);

    return json({ success: true });
}

/** DELETE /api/projects/[id]/wbs - Delete a WBS item */
export async function DELETE({ params, request, locals }) {
    const projectId = params.id;
    const user = locals.user;
    const { type, item_id } = await request.json();

    const tableMap = {
        phase: 'phases',
        task: 'tasks',
        sub_task: 'sub_tasks',
        sub_sub_task: 'sub_sub_tasks',
        checklist: 'checklist_items'
    };

    const table = tableMap[type];
    if (!table || !item_id) {
        return json({ error: 'Invalid type or missing item_id' }, { status: 400 });
    }

    // Get name for activity log
    const nameField = type === 'checklist' ? 'title' : 'name';
    const item = await queryOne(`SELECT ${nameField} as item_name FROM ${table} WHERE id = ?`, [item_id]);

    await query(`DELETE FROM ${table} WHERE id = ?`, [item_id]);

    await logActivity(projectId, user.id, type === 'checklist' ? 'checklist' : type, item_id, 'deleted',
        `${type} "${item?.item_name}" deleted`);

    // Recalculate progress
    await deriveAndUpdateStatuses(projectId);
    await recalcProjectProgress(projectId);

    return json({ success: true });
}
