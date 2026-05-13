import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db.js';

/** GET /api/projects/[id]/phases - Get phase templates */
export async function GET({ url }) {
    const templates = await query('SELECT * FROM phase_templates ORDER BY is_default DESC, template_name');

    for (const t of templates) {
        t.items = await query(
            'SELECT * FROM phase_template_items WHERE template_id = ? ORDER BY sort_order',
            [t.id]
        );
    }

    return json(templates);
}
