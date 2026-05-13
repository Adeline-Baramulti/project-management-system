import mysql from 'mysql2/promise';
import { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } from '$env/static/private';

const pool = mysql.createPool({
    host: DB_HOST || 'localhost',
    port: parseInt(DB_PORT || '3306'),
    user: DB_USER || 'root',
    password: DB_PASSWORD || '',
    database: DB_NAME || 'projecthub',
    // Return DATE/DATETIME/TIMESTAMP as strings ('YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS').
    // Default Date-object conversion produced ISO strings with timezone offsets that
    // <input type="date"> won't accept, so the input cleared on every re-render.
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

/**
 * Execute a query with parameters
 * @param {string} sql
 * @param {any[]} params
 */
export async function query(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

/**
 * Get a single row
 */
export async function queryOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] || null;
}

/**
 * Execute an insert and return the insertId
 */
export async function insert(sql, params = []) {
    const [result] = await pool.execute(sql, params);
    return result.insertId;
}

/**
 * Execute within a transaction
 */
export async function transaction(callback) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export default pool;
