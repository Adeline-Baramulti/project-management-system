import { query, queryOne } from './db.js';

/**
 * Recalculate and cache project progress
 * Called whenever any WBS item status changes
 *
 * Formula:
 *   sub_sub_task: 0% or 100% (binary)
 *   sub_task:     avg of sub_sub_tasks (or binary if no children)
 *   task:         avg of sub_tasks (or binary if no children)
 *   phase:        avg of tasks
 *   project:      weighted sum of phases (by phase.weight)
 */
export async function recalcProjectProgress(projectId) {
    // Get all phases with their weights
    const phases = await query(
        'SELECT id, weight FROM phases WHERE project_id = ? ORDER BY sort_order',
        [projectId]
    );

    if (phases.length === 0) {
        await query('UPDATE projects SET progress = 0 WHERE id = ?', [projectId]);
        return 0;
    }

    let totalWeight = 0;
    let weightedSum = 0;

    for (const phase of phases) {
        const phaseProgress = await calcPhaseProgress(phase.id);
        totalWeight += parseFloat(phase.weight);
        weightedSum += phaseProgress * parseFloat(phase.weight);
    }

    const projectProgress = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Cache the result
    await query('UPDATE projects SET progress = ? WHERE id = ?', [projectProgress, projectId]);

    // Also auto-derive project status
    await deriveProjectStatus(projectId);

    return projectProgress;
}

async function calcPhaseProgress(phaseId) {
    const tasks = await query('SELECT id, status FROM tasks WHERE phase_id = ?', [phaseId]);
    if (tasks.length === 0) return 0;

    let sum = 0;
    for (const task of tasks) {
        sum += await calcTaskProgress(task.id, task.status);
    }
    return sum / tasks.length;
}

async function calcTaskProgress(taskId, taskStatus) {
    const subTasks = await query('SELECT id, status FROM sub_tasks WHERE task_id = ?', [taskId]);
    if (subTasks.length === 0) return taskStatus === 'Completed' ? 100 : 0;

    let sum = 0;
    for (const st of subTasks) {
        sum += await calcSubTaskProgress(st.id, st.status);
    }
    return sum / subTasks.length;
}

async function calcSubTaskProgress(subTaskId, subTaskStatus) {
    const ssts = await query('SELECT status FROM sub_sub_tasks WHERE sub_task_id = ?', [subTaskId]);
    if (ssts.length === 0) return subTaskStatus === 'Completed' ? 100 : 0;

    const completed = ssts.filter(s => s.status === 'Completed').length;
    return (completed / ssts.length) * 100;
}

/**
 * Auto-derive status for parent items based on children
 */
export async function deriveAndUpdateStatuses(projectId) {
    // Bottom-up: sub_tasks first, then tasks
    // Sub-tasks with sub_sub_task children
    const subTasksWithChildren = await query(
        `SELECT DISTINCT st.id, st.task_id
         FROM sub_tasks st
         INNER JOIN sub_sub_tasks sst ON sst.sub_task_id = st.id
         WHERE st.project_id = ?`,
        [projectId]
    );

    for (const st of subTasksWithChildren) {
        const statuses = await query(
            'SELECT status FROM sub_sub_tasks WHERE sub_task_id = ?',
            [st.id]
        );
        const derived = deriveStatusFromChildren(statuses.map(s => s.status));
        if (derived) {
            await query('UPDATE sub_tasks SET status = ? WHERE id = ?', [derived, st.id]);
        }
    }

    // Tasks with sub_task children
    const tasksWithChildren = await query(
        `SELECT DISTINCT t.id
         FROM tasks t
         INNER JOIN sub_tasks st ON st.task_id = t.id
         WHERE t.project_id = ?`,
        [projectId]
    );

    for (const t of tasksWithChildren) {
        const statuses = await query(
            'SELECT status FROM sub_tasks WHERE task_id = ?',
            [t.id]
        );
        const derived = deriveStatusFromChildren(statuses.map(s => s.status));
        if (derived) {
            await query('UPDATE tasks SET status = ? WHERE id = ?', [derived, t.id]);
        }
    }
}

function deriveStatusFromChildren(statuses) {
    if (!statuses || statuses.length === 0) return null;

    const hasOnHold = statuses.includes('On Hold');
    if (hasOnHold) return 'On Hold';

    const allCompleted = statuses.every(s => s === 'Completed');
    if (allCompleted) return 'Completed';

    const allNotStarted = statuses.every(s => s === 'Not Started');
    if (allNotStarted) return 'Not Started';

    const allCancelled = statuses.every(s => s === 'Cancelled');
    if (allCancelled) return 'Cancelled';

    return 'In Progress';
}

async function deriveProjectStatus(projectId) {
    const phases = await query('SELECT id FROM phases WHERE project_id = ?', [projectId]);
    const phaseStatuses = [];

    for (const phase of phases) {
        const tasks = await query('SELECT status FROM tasks WHERE phase_id = ?', [phase.id]);
        if (tasks.length === 0) {
            phaseStatuses.push('Not Started');
        } else {
            // Derive phase status from tasks
            const taskStatuses = tasks.map(t => t.status);
            phaseStatuses.push(deriveStatusFromChildren(taskStatuses) || 'Not Started');
        }
    }

    const projectStatus = deriveStatusFromChildren(phaseStatuses);
    if (projectStatus) {
        await query('UPDATE projects SET status = ? WHERE id = ?', [projectStatus, projectId]);
    }
}

/**
 * Log an activity
 */
export async function logActivity(projectId, userId, entityType, entityId, action, description, oldValue = null, newValue = null) {
    await query(
        `INSERT INTO activity_log (project_id, user_id, entity_type, entity_id, action, description, old_value, new_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, userId, entityType, entityId, action, description, oldValue, newValue]
    );
}
