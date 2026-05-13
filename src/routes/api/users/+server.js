import { json } from '@sveltejs/kit';
import { query, queryOne, insert } from '$lib/server/db.js';
import { requireRole, hashPassword } from '$lib/server/auth.js';

/** GET /api/users - List users (for assignee dropdowns and admin) */
export async function GET({ locals, url }) {
    const activeOnly = url.searchParams.get('active') !== 'false';
    const role = url.searchParams.get('role');

    let sql = 'SELECT id, employee_id, full_name, email, role, department, position, is_active FROM users';
    const conditions = [];
    const params = [];

    if (activeOnly) {
        conditions.push('is_active = TRUE');
    }
    if (role) {
        conditions.push('role = ?');
        params.push(role);
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY full_name';

    const users = await query(sql, params);
    return json(users);
}

/** POST /api/users - Create user (admin only) */
export async function POST({ request, locals }) {
    if (!requireRole(locals.user, 'admin')) {
        return json({ error: 'Admin access required' }, { status: 403 });
    }

    const data = await request.json();
    const { employee_id, full_name, email, password, role, department, position } = data;

    if (!employee_id || !full_name || !email || !password) {
        return json({ error: 'Required fields: employee_id, full_name, email, password' }, { status: 400 });
    }

    // Check duplicates
    const existing = await queryOne('SELECT id FROM users WHERE email = ? OR employee_id = ?', [email, employee_id]);
    if (existing) {
        return json({ error: 'User with this email or employee ID already exists' }, { status: 409 });
    }

    const password_hash = await hashPassword(password);
    const userId = await insert(
        `INSERT INTO users (employee_id, full_name, email, password_hash, role, department, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [employee_id, full_name, email, password_hash, role || 'staff', department || null, position || null]
    );

    const user = await queryOne('SELECT id, employee_id, full_name, email, role, department, position FROM users WHERE id = ?', [userId]);
    return json(user, { status: 201 });
}
