# ProjectHub — IT Project Management System

A SvelteKit + MySQL project management system designed for in-house IT teams.

## Features

### Core
- **WBS (Work Breakdown Structure)** — 4-level hierarchy: Phase → Task → Sub-task → Sub-sub-task + Checklist
- **Auto progress calculation** — Bottom-up: binary at leaf, averaged up, weighted at phase level
- **Auto status sync** — Parent items auto-derive status from children (⚡ indicator)
- **Phase templates** — Pre-built templates (Standard IT, Agile, Infrastructure) with editable weights
- **Planned + Actual dates** — Track schedule variance (phases/tasks get start+end, sub-items get due date)

### Views
- **Overview** — Dashboard with progress, health, phase breakdown, schedule variance, activity log
- **WBS Table** — Inline-editable hierarchical table with WBS numbering (1.1.1.1)
- **Kanban Board** — Cards by status column, quick status updates
- **Gantt Chart** — Timeline bars with progress fill and today marker

### Roles
| Role | Can Create Projects | See All Projects | Manage WBS | Manage Users |
|------|-------------------|-----------------|------------|-------------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| Project Manager | ✅ | ✅ | ✅ | ❌ |
| Staff/Officer | ❌ | Assigned only | Update own status | ❌ |

### Other
- **My Tasks** — Filtered view showing only tasks assigned to the logged-in user
- **Attachments** — File upload on any WBS item
- **Activity Log** — Audit trail of all changes
- **Notes** — On projects, tasks, and all WBS levels

---

## Setup

### Prerequisites
- **Node.js** 18+
- **MySQL** 8.0+

### 1. Clone and install

```bash
cd sveltekit-pm
npm install
```

### 2. Create MySQL database

```bash
mysql -u root -p < schema.sql
```

Or run in MySQL Workbench / phpMyAdmin.

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your MySQL credentials:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=projecthub
SESSION_SECRET=change-this-to-something-random
```

### 4. Seed demo data

```bash
npm run seed
```

This creates:
- 6 demo users with password `password123`
- Phase templates
- A sample project with full WBS

### 5. Run

```bash
npm run dev
```

Open **http://localhost:5173**

### Demo Accounts

| Email | Role | Password |
|-------|------|----------|
| admin@company.com | Admin | password123 |
| andi@company.com | Project Manager | password123 |
| citra@company.com | Staff | password123 |
| budi@company.com | Staff | password123 |
| eko@company.com | Staff | password123 |
| farah@company.com | Staff | password123 |

---

## How Progress Works

```
Sub-sub-task:  0% or 100%  (Completed = 100%, else 0%)
Sub-task:      avg of sub-sub-tasks  (or binary if no children)
Task:          avg of sub-tasks  (or binary if no children)
Phase:         avg of tasks
Project:       Σ (phase_progress × phase_weight) / Σ weights
```

Example:
```
Planning (10% weight)
  ├─ Gather Requirements
  │   ├─ Finance Reqs (Completed → 100%)
  │   └─ HR Reqs (Not Started → 0%)
  │   → Task = 50%
  └─ Stakeholder Analysis (Completed → 100%)
  → Phase = 75%
  → Contribution to project = 75% × 10% = 7.5%
```

## Project Structure

```
sveltekit-pm/
├── schema.sql                # MySQL database schema
├── scripts/seed.js           # Database seeder
├── src/
│   ├── hooks.server.js       # Auth middleware
│   ├── app.html              # HTML template
│   ├── app.css               # Global styles
│   ├── lib/server/
│   │   ├── db.js             # MySQL connection pool
│   │   ├── auth.js           # Session & authentication
│   │   └── progress.js       # Progress calculation engine
│   └── routes/
│       ├── login/            # Login page
│       ├── api/
│       │   ├── auth/         # Login/logout API
│       │   ├── projects/     # Projects CRUD
│       │   │   └── [id]/
│       │   │       ├── wbs/          # WBS CRUD (all levels)
│       │   │       ├── attachments/  # File uploads
│       │   │       └── phases/       # Phase templates
│       │   ├── users/        # User management
│       │   └── my-tasks/     # Filtered task view
│       └── (app)/            # Authenticated pages
│           ├── projects/     # Project list
│           │   └── [id]/     # Project detail (4 tabs)
│           ├── my-tasks/     # Staff task view
│           └── admin/        # User management
```