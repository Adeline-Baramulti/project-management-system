/**
 * Cleanup orphan upload folders.
 *
 * Each project's files live under <UPLOAD_DIR>/<project_id>/. When a project is
 * deleted (especially before the cascade-cleanup fix), the folder is left behind.
 * This script finds every <project_id> folder whose project no longer exists in
 * the database and prints / deletes them.
 *
 * Also flags individual files inside *live* project folders that have no matching
 * row in the attachments table.
 *
 * Usage:
 *   npm run cleanup:uploads          → dry run (lists what WOULD be deleted)
 *   npm run cleanup:uploads -- --apply  → actually delete
 */

import mysql from 'mysql2/promise';
import { readdir, stat, rm, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const APPLY = process.argv.includes('--apply');

function fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
}

async function dirSize(dir) {
    let total = 0;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) total += await dirSize(p);
        else { const s = await stat(p); total += s.size; }
    }
    return total;
}

if (!existsSync(UPLOAD_DIR)) {
    console.log(`Upload dir "${UPLOAD_DIR}" does not exist. Nothing to do.`);
    process.exit(0);
}

console.log(`Mode: ${APPLY ? '⚠️  APPLY (will delete)' : '🔍 DRY RUN (no changes)'}`);
console.log(`Upload dir: ${path.resolve(UPLOAD_DIR)}\n`);

const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'projecthub'
});

const [projectRows] = await conn.query('SELECT id FROM projects');
const liveProjectIds = new Set(projectRows.map(r => r.id));

const [attachmentRows] = await conn.query('SELECT file_path FROM attachments WHERE file_path IS NOT NULL');
const liveFilePaths = new Set(
    attachmentRows.map(r => path.resolve(r.file_path))
);

const entries = await readdir(UPLOAD_DIR, { withFileTypes: true });

let orphanFolders = [];
let orphanFiles = [];

for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folderName = entry.name;
    const folderPath = path.join(UPLOAD_DIR, folderName);
    const projectId = parseInt(folderName, 10);

    if (!Number.isFinite(projectId) || !liveProjectIds.has(projectId)) {
        // Whole folder is orphan
        const size = await dirSize(folderPath).catch(() => 0);
        orphanFolders.push({ path: folderPath, size });
        continue;
    }

    // Project still exists — scan files inside for individual orphans
    const files = await readdir(folderPath, { withFileTypes: true });
    for (const f of files) {
        if (!f.isFile()) continue;
        const filePath = path.join(folderPath, f.name);
        if (!liveFilePaths.has(path.resolve(filePath))) {
            const s = await stat(filePath).catch(() => ({ size: 0 }));
            orphanFiles.push({ path: filePath, size: s.size });
        }
    }
}

let totalBytes = 0;
console.log(`═══ Orphan folders (project deleted) ═══`);
if (orphanFolders.length === 0) console.log('  None.');
for (const f of orphanFolders) {
    console.log(`  ${f.path}  (${fmtBytes(f.size)})`);
    totalBytes += f.size;
}

console.log(`\n═══ Orphan files (project exists, no DB row) ═══`);
if (orphanFiles.length === 0) console.log('  None.');
for (const f of orphanFiles) {
    console.log(`  ${f.path}  (${fmtBytes(f.size)})`);
    totalBytes += f.size;
}

console.log(`\nTotal recoverable: ${fmtBytes(totalBytes)}`);
console.log(`Folders to delete: ${orphanFolders.length}`);
console.log(`Files to delete:   ${orphanFiles.length}`);

if (!APPLY) {
    console.log('\nDry-run complete. Re-run with `-- --apply` to actually delete.');
    await conn.end();
    process.exit(0);
}

console.log('\nDeleting…');
for (const f of orphanFolders) {
    try { await rm(f.path, { recursive: true, force: true }); console.log('  ✓ removed folder', f.path); }
    catch (e) { console.error('  ✗ failed', f.path, e.message); }
}
for (const f of orphanFiles) {
    try { await unlink(f.path); console.log('  ✓ removed file', f.path); }
    catch (e) { console.error('  ✗ failed', f.path, e.message); }
}
console.log(`\nDone. Freed approximately ${fmtBytes(totalBytes)}.`);

await conn.end();
