/**
 * Seed script - Run with: node scripts/seed.js
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: 'projecthub'
};

async function seed() {
    console.log('🌱 Seeding database...\n');

    const conn = await mysql.createConnection(DB_CONFIG);

    // Hash password
    const hash = await bcrypt.hash('password123', 10);
    console.log('👤 Updating user passwords...');

    const emails = [
        'admin@company.com', 'andi@company.com', 'citra@company.com',
        'budi@company.com', 'eko@company.com', 'farah@company.com'
    ];

    for (const email of emails) {
        try {
            await conn.query('UPDATE users SET password_hash = ? WHERE email = ?', [hash, email]);
            console.log(`  ✓ ${email} → password123`);
        } catch (e) {
            console.warn(`  ⚠ ${email}: ${e.message.substring(0, 60)}`);
        }
    }

    // Check if sample project exists
    const [existing] = await conn.query("SELECT id FROM projects WHERE name = 'ERP System Enhancement'");
    if (existing.length > 0) {
        console.log('\n⏭ Sample project already exists, skipping...');
        await conn.end();
        console.log('\n✅ Seed completed!');
        return;
    }

    console.log('\n📁 Creating sample project...');

    await conn.query(
        `INSERT INTO projects (project_code, name, description, category, company, department, manager_id, status, health, planned_start, planned_end, actual_start, created_by)
         VALUES ('PRJ-2026-0001', 'ERP System Enhancement', 'Enhance the ERP system with new financial and HR modules', 'ERP/System Integration', 'PT Maju Bersama', 'IT', 2, 'In Progress', 'On Track', '2026-01-06', '2026-05-01', '2026-01-06', 1)`
    );
    const [[proj]] = await conn.query("SELECT id FROM projects WHERE name = 'ERP System Enhancement'");
    const pid = proj.id;
    console.log(`  ✓ Project created (id: ${pid})`);

    // Phases
    const phases = [
        ['Planning', 10, 0, '2026-01-06', '2026-01-17', '2026-01-06', '2026-01-17'],
        ['Design', 20, 1, '2026-01-20', '2026-02-07', '2026-01-20', null],
        ['Development', 30, 2, '2026-02-10', '2026-03-27', null, null],
        ['UAT', 15, 3, '2026-03-30', '2026-04-17', null, null],
        ['Training', 10, 4, '2026-04-20', '2026-04-24', null, null],
        ['Go-Live & Handover', 15, 5, '2026-04-27', '2026-05-01', null, null],
    ];

    for (const [name, weight, order, ps, pe, as_, ae] of phases) {
        await conn.query(
            'INSERT INTO phases (project_id, name, weight, sort_order, planned_start, planned_end, actual_start, actual_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [pid, name, weight, order, ps, pe, as_, ae]
        );
    }
    console.log('  ✓ 6 phases created');

    const [phaseRows] = await conn.query('SELECT id, name FROM phases WHERE project_id = ? ORDER BY sort_order', [pid]);
    const phaseId = {};
    phaseRows.forEach(r => { phaseId[r.name] = r.id; });

    // Tasks
    const tasks = [
        [phaseId['Planning'], 'Gather Requirements', 2, 'Completed', 'High', '2026-01-06', '2026-01-17', '2026-01-06', '2026-01-16', 0],
        [phaseId['Planning'], 'Stakeholder Analysis', 2, 'Completed', 'Medium', '2026-01-06', '2026-01-10', '2026-01-06', '2026-01-09', 1],
        [phaseId['Design'], 'UI/UX Design', 3, 'In Progress', 'High', '2026-01-20', '2026-02-07', '2026-01-20', null, 0],
        [phaseId['Design'], 'Database Design', 5, 'Not Started', 'High', '2026-01-27', '2026-02-07', null, null, 1],
        [phaseId['Development'], 'Backend API', 5, 'Not Started', 'High', '2026-02-10', '2026-03-20', null, null, 0],
        [phaseId['Development'], 'Frontend Development', 3, 'Not Started', 'High', '2026-02-17', '2026-03-27', null, null, 1],
        [phaseId['UAT'], 'Test Case Preparation', 6, 'Not Started', 'Medium', '2026-03-30', '2026-04-03', null, null, 0],
        [phaseId['UAT'], 'User Acceptance Testing', 6, 'Not Started', 'High', '2026-04-06', '2026-04-17', null, null, 1],
        [phaseId['Training'], 'Training Material', 4, 'Not Started', 'Medium', '2026-04-20', '2026-04-24', null, null, 0],
        [phaseId['Go-Live & Handover'], 'Deployment', 5, 'Not Started', 'Critical', '2026-04-27', '2026-04-30', null, null, 0],
        [phaseId['Go-Live & Handover'], 'Documentation & Handover', 2, 'Not Started', 'Medium', '2026-04-27', '2026-05-01', null, null, 1],
    ];

    for (const [phase_id, name, assigned_to, status, priority, ps, pe, as_, ae, order] of tasks) {
        await conn.query(
            'INSERT INTO tasks (phase_id, project_id, name, assigned_to, status, priority, planned_start, planned_end, actual_start, actual_end, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [phase_id, pid, name, assigned_to, status, priority, ps, pe, as_, ae, order]
        );
    }
    console.log('  ✓ 11 tasks created');

    const [[gatherReq]] = await conn.query("SELECT id FROM tasks WHERE project_id = ? AND name = 'Gather Requirements'", [pid]);

    await conn.query('INSERT INTO sub_tasks (task_id, project_id, name, assigned_to, status, priority, sort_order) VALUES (?, ?, ?, 2, ?, ?, 0)', [gatherReq.id, pid, 'Finance Team Requirements', 'Completed', 'High']);
    await conn.query('INSERT INTO sub_tasks (task_id, project_id, name, assigned_to, status, priority, sort_order) VALUES (?, ?, ?, 4, ?, ?, 1)', [gatherReq.id, pid, 'HR Team Requirements', 'Completed', 'Medium']);
    console.log('  ✓ 2 sub-tasks created');

    const [stRows] = await conn.query('SELECT id FROM sub_tasks WHERE task_id = ? ORDER BY sort_order', [gatherReq.id]);

    await conn.query('INSERT INTO sub_sub_tasks (sub_task_id, project_id, name, assigned_to, status, priority, due_date, sort_order) VALUES (?, ?, ?, 2, ?, ?, ?, 0)', [stRows[0].id, pid, 'Cost Control Module', 'Completed', 'High', '2026-01-10']);
    await conn.query('INSERT INTO sub_sub_tasks (sub_task_id, project_id, name, assigned_to, status, priority, due_date, sort_order) VALUES (?, ?, ?, 2, ?, ?, ?, 1)', [stRows[0].id, pid, 'Budgeting Module', 'Completed', 'Medium', '2026-01-14']);
    await conn.query('INSERT INTO sub_sub_tasks (sub_task_id, project_id, name, assigned_to, status, priority, due_date, sort_order) VALUES (?, ?, ?, 4, ?, ?, ?, 0)', [stRows[1].id, pid, 'Payroll Module', 'Completed', 'Medium', '2026-01-17']);
    console.log('  ✓ 3 sub-sub-tasks created');

    await conn.query('UPDATE projects SET progress = 10.00 WHERE id = ?', [pid]);

    await conn.end();
    console.log('\n✅ Seed completed!\n');
    console.log('Run: npm run dev');
    console.log('Open: http://localhost:5173/login');
    console.log('\nDemo accounts (password: password123):');
    console.log('  admin@company.com    → Admin');
    console.log('  andi@company.com     → Project Manager');
    console.log('  citra@company.com    → Staff');
}

seed().catch(err => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
});
