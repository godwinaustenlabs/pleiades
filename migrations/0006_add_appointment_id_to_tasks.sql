-- Migration: Add appointment_id to universal_tasks

-- 1) Turn off FK checks temporarily
PRAGMA foreign_keys = OFF;

-- 2) Rename old table
ALTER TABLE universal_tasks RENAME TO universal_tasks_old;

-- 3) Recreate table with appointment_id FK
CREATE TABLE universal_tasks (
    task_id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    
    -- HR Fields
    employee_id TEXT,
    appointment_id TEXT, 
    
    -- Finance Fields
    transaction_id TEXT,
    
    -- Legal Fields
    agreement_id TEXT,
    
    -- Tech Fields
    project_id TEXT,
    issue_id TEXT,
    
    -- Ops Fields
    lab_id TEXT,
    
    -- Shared Fields
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT,
    due_date TIMESTAMP,
    status TEXT,
    assignee_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- FIX: Add proper FK constraint
    FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    -- Other existing FKs
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (agreement_id) REFERENCES agreements(agreement_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (project_id) REFERENCES tech_projects(project_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (issue_id) REFERENCES issues(issue_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (lab_id) REFERENCES labs(lab_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES employees(employee_id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4) Copy old data into new table
INSERT INTO universal_tasks (
    task_id,
    task_type,
    employee_id,
    appointment_id,
    transaction_id,
    agreement_id,
    project_id,
    issue_id,
    lab_id,
    title,
    description,
    priority,
    due_date,
    status,
    assignee_id,
    created_at
)
SELECT
    task_id,
    task_type,
    employee_id,
    appointment_id,
    transaction_id,
    agreement_id,
    project_id,
    issue_id,
    lab_id,
    title,
    description,
    priority,
    due_date,
    status,
    assignee_id,
    created_at
FROM universal_tasks_old;

-- 5) Drop old table
DROP TABLE universal_tasks_old;

-- 6) Re-enable FK checks
PRAGMA foreign_keys=ON;