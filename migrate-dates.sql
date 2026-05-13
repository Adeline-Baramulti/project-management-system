-- Migration: give sub_tasks and sub_sub_tasks the full date set (planned_start, planned_end,
-- actual_start, actual_end), matching tasks. Existing due_date values become planned_end.
-- Run on existing databases:

USE projecthub;

-- sub_tasks --
ALTER TABLE sub_tasks
    ADD COLUMN planned_start DATE AFTER priority,
    ADD COLUMN planned_end DATE AFTER planned_start,
    ADD COLUMN actual_start DATE AFTER planned_end,
    ADD COLUMN actual_end DATE AFTER actual_start;

UPDATE sub_tasks SET planned_end = due_date WHERE due_date IS NOT NULL;

ALTER TABLE sub_tasks DROP COLUMN due_date;

-- sub_sub_tasks --
ALTER TABLE sub_sub_tasks
    ADD COLUMN planned_start DATE AFTER priority,
    ADD COLUMN planned_end DATE AFTER planned_start,
    ADD COLUMN actual_start DATE AFTER planned_end,
    ADD COLUMN actual_end DATE AFTER actual_start;

UPDATE sub_sub_tasks SET planned_end = due_date WHERE due_date IS NOT NULL;

ALTER TABLE sub_sub_tasks DROP COLUMN due_date;
