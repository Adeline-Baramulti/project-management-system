import { query, queryOne, insert } from './db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const SESSION_DURATION_HOURS = 24;

/**
 * Authenticate user with email + password
 */
export async function authenticateUser(email, password) {
    const user = await queryOne(
        'SELECT id, employee_id, full_name, email, password_hash, role, department, position, avatar_url FROM users WHERE email = ? AND is_active = TRUE',
        [email]
    );
    if (!user) return null;

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;

    delete user.password_hash;
    return user;
}

/**
 * Create a new session for a user
 */
export async function createSession(userId) {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

    await query(
        'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
        [sessionId, userId, expiresAt]
    );

    return { sessionId, expiresAt };
}

/**
 * Validate a session and return the user
 */
export async function validateSession(sessionId) {
    if (!sessionId) return null;

    const row = await queryOne(
        `SELECT u.id, u.employee_id, u.full_name, u.email, u.role, u.department, u.position, u.avatar_url
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.id = ? AND s.expires_at > NOW() AND u.is_active = TRUE`,
        [sessionId]
    );

    return row || null;
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(sessionId) {
    await query('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

/**
 * Hash a password
 */
export async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

/**
 * Check if user has required role
 */
export function requireRole(user, ...roles) {
    if (!user) return false;
    return roles.includes(user.role);
}
