-- Migration: Make checklist available on task, sub_task, and sub_sub_task
-- Run this on existing databases:

USE projecthub;

-- Backup existing data
CREATE TABLE IF NOT EXISTS checklist_items_backup AS SELECT * FROM checklist_items;

-- Drop old table
DROP TABLE IF EXISTS checklist_items;

-- Create new polymorphic table
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

-- Migrate old data (old sub_sub_task_id -> new entity_id with entity_type='sub_sub_task')
INSERT INTO checklist_items (entity_type, entity_id, project_id, title, is_checked, sort_order, created_at)
SELECT 'sub_sub_task', b.sub_sub_task_id, sst.project_id, b.title, b.is_checked, b.sort_order, b.created_at
FROM checklist_items_backup b
JOIN sub_sub_tasks sst ON b.sub_sub_task_id = sst.id;

-- Clean up
DROP TABLE IF EXISTS checklist_items_backup;
