/**
 * Migration runner. Reads .env, connects to MySQL, executes a .sql file.
 * Usage: node --env-file=.env scripts/migrate.js migrate-dates.sql
 * Or via npm: npm run migrate migrate-dates.sql
 */

import mysql from 'mysql2/promise';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

const file = process.argv[2];
if (!file) {
    console.error('Usage: npm run migrate <file.sql>');
    process.exit(1);
}

const sql = await readFile(resolve(file), 'utf8');

const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'projecthub',
    multipleStatements: true
});

console.log(`Running ${file} against ${process.env.DB_NAME || 'projecthub'}...`);
try {
    await conn.query(sql);
    console.log('Migration completed successfully.');
} catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
} finally {
    await conn.end();
}
