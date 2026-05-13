import { error, json, redirect } from '@sveltejs/kit';
import { queryOne } from '$lib/server/db.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

/** GET /api/projects/[id]/attachments/[attachmentId]
 *  - For file attachments: streams the file (inline so PDFs/images preview in-browser).
 *  - For link attachments: 302 redirects to the URL.
 */
export async function GET({ params }) {
    const att = await queryOne(
        'SELECT * FROM attachments WHERE id = ? AND project_id = ?',
        [params.attachmentId, params.id]
    );

    if (!att) throw error(404, 'Attachment not found');

    if (att.link_url) {
        throw redirect(302, att.link_url);
    }

    if (!att.file_path || !existsSync(att.file_path)) {
        throw error(404, 'File missing on disk');
    }

    const buf = await readFile(att.file_path);
    return new Response(buf, {
        headers: {
            'Content-Type': att.mime_type || 'application/octet-stream',
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.file_name)}`,
            'Content-Length': String(buf.length),
            'Cache-Control': 'private, max-age=3600'
        }
    });
}
