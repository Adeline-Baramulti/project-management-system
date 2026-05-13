-- ============================================================
-- Hybrid Scrum support migration
-- Adds: sprints, task.sprint_id, task.story_points, 'Urgent' priority,
--       and a "Backlog" phase (weight 0) for every existing project.
-- Safe to run multiple times.
-- ============================================================

USE projecthub;

-- ── 1. Sprints table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sprints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    goal TEXT,
    start_date DATE,
    end_date DATE,
    status ENUM('Planned', 'Active', 'Completed', 'Cancelled') DEFAULT 'Planned',
    sort_order INT NOT NULL DEFAULT 0,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_sprint_project (project_id, status, sort_order)
);

-- ── 2. Add sprint_id + story_points to tasks ────────────────
-- (Idempotent: only adds if missing)
SET @col := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'tasks' AND column_name = 'sprint_id');
SET @sql := IF(@col = 0,
    'ALTER TABLE tasks ADD COLUMN sprint_id INT NULL AFTER phase_id,
     ADD CONSTRAINT fk_task_sprint FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL,
     ADD INDEX idx_task_sprint (sprint_id, status)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'tasks' AND column_name = 'story_points');
SET @sql := IF(@col = 0,
    'ALTER TABLE tasks ADD COLUMN story_points DECIMAL(5,1) NULL AFTER priority',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. Extend priority enum to include 'Urgent' ─────────────
ALTER TABLE tasks
    MODIFY COLUMN priority ENUM('Low', 'Medium', 'High', 'Critical', 'Urgent') DEFAULT 'Medium';
ALTER TABLE sub_tasks
    MODIFY COLUMN priority ENUM('Low', 'Medium', 'High', 'Critical', 'Urgent');
ALTER TABLE sub_sub_tasks
    MODIFY COLUMN priority ENUM('Low', 'Medium', 'High', 'Critical', 'Urgent');

-- ── 4. Mark phase as "backlog" — kept simple via name convention ──
-- We use a dedicated flag column rather than relying on the name "Backlog",
-- so renaming is safe and the UI can find it reliably.
SET @col := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'phases' AND column_name = 'is_backlog');
SET @sql := IF(@col = 0,
    'ALTER TABLE phases ADD COLUMN is_backlog BOOLEAN NOT NULL DEFAULT FALSE AFTER name,
     ADD INDEX idx_phase_backlog (project_id, is_backlog)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5. Auto-create a Backlog phase for every existing project ──
-- weight 0 so it never affects project progress %
INSERT INTO phases (project_id, name, is_backlog, weight, sort_order)
SELECT p.id, 'Backlog', TRUE, 0, -1
FROM projects p
WHERE NOT EXISTS (
    SELECT 1 FROM phases ph WHERE ph.project_id = p.id AND ph.is_backlog = TRUE
);

-- ── 6. Refresh the v_all_assigned_items view to include sprint info ──
-- (Drop and recreate; harmless if it didn't exist.)
DROP VIEW IF EXISTS v_all_assigned_items;
CREATE VIEW v_all_assigned_items AS
SELECT
    'task' as item_type, t.id as item_id, t.name, t.status, t.priority,
    t.planned_start, t.planned_end, t.actual_start, t.actual_end,
    NULL as due_date, t.assigned_to, t.project_id,
    p.name as project_name, p.project_code,
    ph.name as phase_name, ph.id as phase_id, ph.is_backlog,
    t.sprint_id, s.name as sprint_name,
    t.id as task_id, NULL as sub_task_id,
    CONCAT(
        (SELECT COUNT(*) FROM sub_tasks WHERE task_id = t.id AND status = 'Completed'),
        '/',
        (SELECT COUNT(*) FROM sub_tasks WHERE task_id = t.id)
    ) as child_progress
FROM tasks t
JOIN phases ph ON t.phase_id = ph.id
JOIN projects p ON t.project_id = p.id
LEFT JOIN sprints s ON t.sprint_id = s.id
WHERE t.assigned_to IS NOT NULL

UNION ALL

SELECT
    'sub_task', st.id, st.name, st.status,
    COALESCE(st.priority, t.priority),
    t.planned_start, t.planned_end, NULL, NULL,
    NULL, st.assigned_to, st.project_id,
    p.name, p.project_code,
    ph.name, ph.id, ph.is_backlog,
    t.sprint_id, s.name,
    t.id, st.id,
    CONCAT(
        (SELECT COUNT(*) FROM sub_sub_tasks WHERE sub_task_id = st.id AND status = 'Completed'),
        '/',
        (SELECT COUNT(*) FROM sub_sub_tasks WHERE sub_task_id = st.id)
    )
FROM sub_tasks st
JOIN tasks t ON st.task_id = t.id
JOIN phases ph ON t.phase_id = ph.id
JOIN projects p ON st.project_id = p.id
LEFT JOIN sprints s ON t.sprint_id = s.id
WHERE st.assigned_to IS NOT NULL

UNION ALL

SELECT
    'sub_sub_task', sst.id, sst.name, sst.status,
    COALESCE(sst.priority, st.priority, t.priority),
    NULL, NULL, NULL, NULL,
    NULL, sst.assigned_to, sst.project_id,
    p.name, p.project_code,
    ph.name, ph.id, ph.is_backlog,
    t.sprint_id, s.name,
    t.id, st.id, NULL
FROM sub_sub_tasks sst
JOIN sub_tasks st ON sst.sub_task_id = st.id
JOIN tasks t ON st.task_id = t.id
JOIN phases ph ON t.phase_id = ph.id
JOIN projects p ON sst.project_id = p.id
LEFT JOIN sprints s ON t.sprint_id = s.id
WHERE sst.assigned_to IS NOT NULL;
