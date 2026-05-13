import { json } from '@sveltejs/kit';
import { query, queryOne, insert } from '$lib/server/db.js';
import { logActivity } from '$lib/server/progress.js';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

/** GET /api/projects/[id]/attachments */
export async function GET({ params, url }) {
    const entityType = url.searchParams.get('entity_type');
    const entityId = url.searchParams.get('entity_id');

    let sql = `SELECT a.*, u.full_name as uploaded_by_name
               FROM attachments a
               JOIN users u ON a.uploaded_by = u.id
               WHERE a.project_id = ?`;
    const p = [params.id];

    if (entityType && entityId) {
        sql += ' AND a.entity_type = ? AND a.entity_id = ?';
        p.push(entityType, entityId);
    }
    sql += ' ORDER BY a.created_at DESC';

    const attachments = await query(sql, p);
    return json(attachments);
}

/** POST /api/projects/[id]/attachments
 *  Accepts EITHER multipart form-data (file upload) OR JSON { entity_type, entity_id, link_url } (link).
 */
export async function POST({ params, request, locals }) {
    const contentType = request.headers.get('content-type') || '';

    // Link attachment (JSON body)
    if (contentType.includes('application/json')) {
        const { entity_type, entity_id, link_url } = await request.json();
        if (!entity_type || !entity_id || !link_url?.trim()) {
            return json({ error: 'entity_type, entity_id, link_url required' }, { status: 400 });
        }
        const url = link_url.trim();
        // Store the URL as both file_name (for display fallback) and link_url. file_path/size/mime stay null.
        const id = await insert(
            `INSERT INTO attachments (entity_type, entity_id, project_id, file_name, link_url, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [entity_type, entity_id, params.id, url, url, locals.user.id]
        );
        await logActivity(params.id, locals.user.id, entity_type, entity_id, 'link_added',
            `Link added: ${url}`);
        return json({ id, file_name: url, link_url: url, file_size: null }, { status: 201 });
    }

    // File attachment (multipart)
    const formData = await request.formData();
    const file = formData.get('file');
    const entityType = formData.get('entity_type');
    const entityId = formData.get('entity_id');

    if (!file || !entityType || !entityId) {
        return json({ error: 'File, entity_type, and entity_id are required' }, { status: 400 });
    }

    const uploadPath = path.join(UPLOAD_DIR, params.id);
    if (!existsSync(uploadPath)) {
        await mkdir(uploadPath, { recursive: true });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${timestamp}_${safeName}`;
    const filePath = path.join(uploadPath, fileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const id = await insert(
        `INSERT INTO attachments (entity_type, entity_id, project_id, file_name, file_path, file_size, mime_type, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [entityType, entityId, params.id, file.name, filePath, buffer.length, file.type, locals.user.id]
    );

    await logActivity(params.id, locals.user.id, entityType, entityId, 'attachment_added',
        `File "${file.name}" attached`);

    return json({ id, file_name: file.name, file_size: buffer.length, mime_type: file.type }, { status: 201 });
}

/** DELETE /api/projects/[id]/attachments - Removes DB row AND the underlying file on disk. */
export async function DELETE({ params, request, locals }) {
    const { attachment_id } = await request.json();

    // Read first so we have the file_path before the row disappears.
    const att = await queryOne(
        'SELECT file_path, file_name FROM attachments WHERE id = ? AND project_id = ?',
        [attachment_id, params.id]
    );
    if (!att) return json({ error: 'Attachment not found' }, { status: 404 });

    await query('DELETE FROM attachments WHERE id = ? AND project_id = ?', [attachment_id, params.id]);

    // Best-effort file removal. Don't fail the request if the file is already gone
    // (could happen if someone deleted it manually, or for link-only attachments).
    if (att.file_path && existsSync(att.file_path)) {
        try { await unlink(att.file_path); }
        catch (e) { console.warn('[attachments] failed to unlink', att.file_path, e?.message); }
    }

    if (locals.user) {
        await logActivity(params.id, locals.user.id, 'project', params.id, 'deleted',
            `Attachment "${att.file_name}" deleted`);
    }

    return json({ success: true });
}
