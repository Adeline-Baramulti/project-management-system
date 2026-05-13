-- ============================================================
-- ProjectHub: IT Project Management System
-- Database Schema for MySQL 8.0+
-- ============================================================

CREATE DATABASE IF NOT EXISTS projecthub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE projecthub;

-- ──────────────────────────────────────────────
-- USERS & AUTH
-- ──────────────────────────────────────────────

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'project_manager', 'staff') NOT NULL DEFAULT 'staff',
    department VARCHAR(100),
    position VARCHAR(100),
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    id VARCHAR(100) PRIMARY KEY,
    user_id INT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ──────────────────────────────────────────────
-- PROJECTS
-- ──────────────────────────────────────────────

CREATE TABLE projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_code VARCHAR(20) UNIQUE NOT NULL,  -- PRJ-2026-0001
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category ENUM(
        'Web Application', 'Mobile App', 'Infrastructure',
        'ERP/System Integration', 'Data & Analytics', 'Security', 'Other'
    ) NOT NULL DEFAULT 'Other',
    company VARCHAR(200),
    department VARCHAR(100),
    manager_id INT NOT NULL,
    status ENUM('Not Started', 'In Progress', 'Completed', 'On Hold', 'Cancelled') DEFAULT 'Not Started',
    health ENUM('On Track', 'At Risk', 'Off Track') DEFAULT 'On Track',
    planned_start DATE,
    planned_end DATE,
    actual_start DATE,
    actual_end DATE,
    progress DECIMAL(5,2) DEFAULT 0.00,  -- cached, recalculated on WBS changes
    notes TEXT,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Auto-generate project_code
DELIMITER //
CREATE TRIGGER before_project_insert
BEFORE INSERT ON projects
FOR EACH ROW
BEGIN
    DECLARE next_num INT;
    SELECT IFNULL(MAX(CAST(SUBSTRING(project_code, 10) AS UNSIGNED)), 0) + 1
    INTO next_num
    FROM projects
    WHERE project_code LIKE CONCAT('PRJ-', YEAR(CURRENT_DATE), '-%');
    SET NEW.project_code = CONCAT('PRJ-', YEAR(CURRENT_DATE), '-', LPAD(next_num, 4, '0'));
END//
DELIMITER ;

-- ──────────────────────────────────────────────
-- PHASE TEMPLATES
-- ──────────────────────────────────────────────

CREATE TABLE phase_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE phase_template_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    weight DECIMAL(5,2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    FOREIGN KEY (template_id) REFERENCES phase_templates(id) ON DELETE CASCADE
);

-- Insert default templates
INSERT INTO phase_templates (template_name, is_default) VALUES
('Standard IT Project', TRUE),
('Agile Sprint', FALSE),
('Infrastructure / Migration', FALSE);

INSERT INTO phase_template_items (template_id, name, weight, sort_order) VALUES
-- Standard IT Project
(1, 'Planning', 10, 0),
(1, 'Design', 20, 1),
(1, 'Development', 30, 2),
(1, 'UAT', 15, 3),
(1, 'Training', 10, 4),
(1, 'Go-Live & Handover', 15, 5),
-- Agile Sprint
(2, 'Sprint Planning', 10, 0),
(2, 'Development', 50, 1),
(2, 'Testing', 25, 2),
(2, 'Review & Retrospective', 15, 3),
-- Infrastructure / Migration
(3, 'Assessment', 15, 0),
(3, 'Planning', 15, 1),
(3, 'Setup & Configuration', 25, 2),
(3, 'Migration', 20, 3),
(3, 'Testing', 15, 4),
(3, 'Go-Live', 10, 5);

-- ──────────────────────────────────────────────
-- WBS: PHASES
-- ──────────────────────────────────────────────

CREATE TABLE phases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    weight DECIMAL(5,2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    planned_start DATE,
    planned_end DATE,
    actual_start DATE,
    actual_end DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_phase_project (project_id, sort_order)
);

-- ──────────────────────────────────────────────
-- WBS: TASKS (Level 2)
-- ──────────────────────────────────────────────

CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phase_id INT NOT NULL,
    project_id INT NOT NULL,  -- denormalized for easy querying
    name VARCHAR(200) NOT NULL,
    description TEXT,
    assigned_to INT,
    status ENUM('Not Started', 'In Progress', 'Completed', 'On Hold', 'Cancelled') DEFAULT 'Not Started',
    priority ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
    planned_start DATE,
    planned_end DATE,
    actual_start DATE,
    actual_end DATE,
    sort_order INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_task_phase (phase_id, sort_order),
    INDEX idx_task_assigned (assigned_to, status),
    INDEX idx_task_project (project_id)
);

-- ──────────────────────────────────────────────
-- WBS: SUB-TASKS (Level 3)
-- ──────────────────────────────────────────────

CREATE TABLE sub_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    project_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    assigned_to INT,
    status ENUM('Not Started', 'In Progress', 'Completed', 'On Hold', 'Cancelled') DEFAULT 'Not Started',
    priority ENUM('Low', 'Medium', 'High', 'Critical'),  -- nullable, inherits from task
    planned_start DATE,
    planned_end DATE,
    actual_start DATE,
    actual_end DATE,
    sort_order INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_subtask_task (task_id, sort_order),
    INDEX idx_subtask_assigned (assigned_to, status)
);

-- ──────────────────────────────────────────────
-- WBS: SUB-SUB-TASKS (Level 4 — leaf nodes)
-- ──────────────────────────────────────────────

CREATE TABLE sub_sub_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sub_task_id INT NOT NULL,
    project_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    assigned_to INT,
    status ENUM('Not Started', 'In Progress', 'Completed', 'On Hold', 'Cancelled') DEFAULT 'Not Started',
    priority ENUM('Low', 'Medium', 'High', 'Critical'),
    planned_start DATE,
    planned_end DATE,
    actual_start DATE,
    actual_end DATE,
    sort_order INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sub_task_id) REFERENCES sub_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_sst_subtask (sub_task_id, sort_order),
    INDEX idx_sst_assigned (assigned_to, status)
);

-- ──────────────────────────────────────────────
-- CHECKLIST (inside sub-sub-tasks)
-- ──────────────────────────────────────────────

CREATE TABLE checklist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity_type ENUM('task', 'sub_task', 'sub_sub_task') NOT NULL,
    entity_id INT NOT NULL,
    project_id INT NOT NULL,
    title VARCHAR(300) NOT NULL,
    is_checked BOOLEAN DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_checklist_entity (entity_type, entity_id, sort_order)
);

-- ──────────────────────────────────────────────
-- ATTACHMENTS (for tasks at any level)
-- ──────────────────────────────────────────────

CREATE TABLE attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- Polymorphic: attach to any WBS level
    entity_type ENUM('project', 'phase', 'task', 'sub_task', 'sub_sub_task') NOT NULL,
    entity_id INT NOT NULL,
    project_id INT NOT NULL,  -- for easy filtering
    file_name VARCHAR(300) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT,  -- bytes
    mime_type VARCHAR(100),
    uploaded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id),
    INDEX idx_attach_entity (entity_type, entity_id),
    INDEX idx_attach_project (project_id)
);

-- ──────────────────────────────────────────────
-- ACTIVITY LOG (audit trail)
-- ──────────────────────────────────────────────

CREATE TABLE activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    user_id INT,
    entity_type ENUM('project', 'phase', 'task', 'sub_task', 'sub_sub_task', 'checklist') NOT NULL,
    entity_id INT NOT NULL,
    action ENUM('created', 'updated', 'deleted', 'status_changed', 'assigned', 'attachment_added', 'comment_added') NOT NULL,
    old_value TEXT,
    new_value TEXT,
    description VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_activity_project (project_id, created_at DESC),
    INDEX idx_activity_user (user_id, created_at DESC)
);

-- ──────────────────────────────────────────────
-- COMMENTS (discussions on any WBS item)
-- ──────────────────────────────────────────────

CREATE TABLE comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity_type ENUM('project', 'task', 'sub_task', 'sub_sub_task') NOT NULL,
    entity_id INT NOT NULL,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_comment_entity (entity_type, entity_id, created_at DESC)
);

-- ──────────────────────────────────────────────
-- VIEWS: Useful computed views
-- ──────────────────────────────────────────────

-- View: All assignable items for "My Tasks" page
CREATE OR REPLACE VIEW v_all_assigned_items AS
SELECT
    'task' as item_type,
    t.id as item_id,
    t.name,
    t.status,
    t.priority,
    t.planned_start,
    t.planned_end,
    t.actual_start,
    t.actual_end,
    NULL as due_date,
    t.assigned_to,
    t.project_id,
    p.name as project_name,
    p.project_code,
    ph.name as phase_name,
    ph.id as phase_id,
    t.id as task_id,
    NULL as sub_task_id,
    CONCAT(
        (SELECT COUNT(*) FROM sub_tasks WHERE task_id = t.id AND status = 'Completed'),
        '/',
        (SELECT COUNT(*) FROM sub_tasks WHERE task_id = t.id)
    ) as child_progress
FROM tasks t
JOIN phases ph ON t.phase_id = ph.id
JOIN projects p ON t.project_id = p.id
WHERE t.assigned_to IS NOT NULL

UNION ALL

SELECT
    'sub_task',
    st.id,
    st.name,
    st.status,
    COALESCE(st.priority, t.priority),
    t.planned_start,
    t.planned_end,
    NULL, NULL,
    st.due_date,
    st.assigned_to,
    st.project_id,
    p.name,
    p.project_code,
    ph.name,
    ph.id,
    t.id,
    st.id,
    CONCAT(
        (SELECT COUNT(*) FROM sub_sub_tasks WHERE sub_task_id = st.id AND status = 'Completed'),
        '/',
        (SELECT COUNT(*) FROM sub_sub_tasks WHERE sub_task_id = st.id)
    )
FROM sub_tasks st
JOIN tasks t ON st.task_id = t.id
JOIN phases ph ON t.phase_id = ph.id
JOIN projects p ON st.project_id = p.id
WHERE st.assigned_to IS NOT NULL

UNION ALL

SELECT
    'sub_sub_task',
    sst.id,
    sst.name,
    sst.status,
    COALESCE(sst.priority, st.priority, t.priority),
    NULL, NULL, NULL, NULL,
    sst.due_date,
    sst.assigned_to,
    sst.project_id,
    p.name,
    p.project_code,
    ph.name,
    ph.id,
    t.id,
    st.id,
    NULL
FROM sub_sub_tasks sst
JOIN sub_tasks st ON sst.sub_task_id = st.id
JOIN tasks t ON st.task_id = t.id
JOIN phases ph ON t.phase_id = ph.id
JOIN projects p ON sst.project_id = p.id
WHERE sst.assigned_to IS NOT NULL;

-- ──────────────────────────────────────────────
-- SEED: Default admin user (password: admin123)
-- ──────────────────────────────────────────────

INSERT INTO users (employee_id, full_name, email, password_hash, role, department, position) VALUES
('EMP-001', 'Admin User', 'admin@company.com', '$2b$10$placeholder_hash_replace_on_setup', 'admin', 'IT', 'IT Manager'),
('EMP-002', 'Andi Pratama', 'andi@company.com', '$2b$10$placeholder_hash_replace_on_setup', 'project_manager', 'IT', 'Senior Developer'),
('EMP-003', 'Citra Dewi', 'citra@company.com', '$2b$10$placeholder_hash_replace_on_setup', 'staff', 'IT', 'UI/UX Designer'),
('EMP-004', 'Budi Santoso', 'budi@company.com', '$2b$10$placeholder_hash_replace_on_setup', 'staff', 'IT', 'Developer'),
('EMP-005', 'Eko Wijaya', 'eko@company.com', '$2b$10$placeholder_hash_replace_on_setup', 'staff', 'IT', 'Backend Developer'),
('EMP-006', 'Farah Putri', 'farah@company.com', '$2b$10$placeholder_hash_replace_on_setup', 'staff', 'IT', 'QA Engineer');
