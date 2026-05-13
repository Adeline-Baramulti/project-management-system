<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';

    export let data;
    $: user = data.user;
    $: projectId = $page.params.id;

    let project = null;
    let users = [];
    let loading = true;
    let activeTab = 'overview';
    let exp = {};          // expand state
    let checkInputs = {};  // checklist input per sst
    let panel = null;      // detail drawer: { type, item, attachments }
    let panelNotes = '';   // live textarea value for link-chip reactivity
    let fileInput;

    // ─── LOAD ONCE ───
    onMount(async () => {
        const [pRes, uRes] = await Promise.all([
            fetch(`/api/projects/${projectId}`),
            fetch('/api/users')
        ]);
        if (pRes.ok) project = await pRes.json();
        if (uRes.ok) users = await uRes.json();
        // Default expand all phases
        if (project) {
            for (const ph of project.phases || []) exp['p' + ph.id] = true;
            exp = { ...exp };
        }
        loading = false;
    });

    // ─── TOGGLE ───
    // Keys are namespaced ('p'+id, 't'+id, 's'+id, 'cl-…') because phase/task/sub_task/sub_sub_task
    // each have their own auto-increment PK and would otherwise collide on exp[id].
    function toggle(key) {
        exp = { ...exp, [key]: !exp[key] };
        _tick++;
    }

    // After a temp local id is swapped for the real DB id, migrate any expand state to the new key.
    function remapExpKey(prefix, oldId, newId) {
        const oldK = prefix + oldId, newK = prefix + newId;
        if (oldK === newK) return;
        const next = { ...exp };
        if (oldK in next) { next[newK] = next[oldK]; delete next[oldK]; exp = next; }
    }

    // ─── LOCAL ID GENERATOR ───
    let localId = 9000;
    function nextId() { return ++localId; }
    function autoResize(e) { const t = e.target; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

    // ─── BACKGROUND SAVE (fire and forget) ───
    function apiPost(type, parent_id, extra = {}) {
        return fetch(`/api/projects/${projectId}/wbs`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, parent_id, ...extra })
        }).then(r => r.json());
    }
    function apiPatch(type, item_id, fields) {
        fetch(`/api/projects/${projectId}/wbs`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, item_id, ...fields })
        });
    }
    function apiDelete(type, item_id) {
        fetch(`/api/projects/${projectId}/wbs`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, item_id })
        });
    }
    function apiPatchProject(fields) {
        fetch(`/api/projects/${projectId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields)
        });
    }

    // ─── LOCAL STATE MUTATIONS (React-style) ───
    function addPhase() {
        const id = nextId();
        project.phases = [...project.phases, {
            id, name: '', weight: 0, sort_order: project.phases.length,
            planned_start: null, planned_end: null, actual_start: null, actual_end: null,
            notes: '', tasks: []
        }];
        exp = { ...exp, ['p' + id]: true };
        project = { ...project };
        apiPost('phase', null).then(res => {
            const ph = project.phases.find(p => p.id === id);
            if (ph && res?.id) { remapExpKey('p', id, res.id); ph.id = res.id; project = { ...project }; }
        });
    }

    function addTask(phase) {
        const id = nextId();
        phase.tasks = [...(phase.tasks || []), {
            id, name: '', status: 'Not Started', priority: 'Medium',
            assigned_to: null, assignee_name: '',
            planned_start: null, planned_end: null, actual_start: null, actual_end: null,
            sort_order: phase.tasks.length, notes: '', subTasks: [], checklist: []
        }];
        exp = { ...exp, ['p' + phase.id]: true };
        project = { ...project };
        apiPost('task', phase.id).then(res => {
            const t = phase.tasks.find(t => t.id === id);
            if (t && res?.id) { remapExpKey('t', id, res.id); t.id = res.id; project = { ...project }; }
        });
    }

    function addSubTask(task) {
        const id = nextId();
        task.subTasks = [...(task.subTasks || []), {
            id, name: '', status: 'Not Started', priority: task.priority || 'Medium',
            assigned_to: task.assigned_to, assignee_name: task.assignee_name || '',
            planned_start: null, planned_end: null, actual_start: null, actual_end: null,
            sort_order: (task.subTasks || []).length, notes: '', subSubTasks: [], checklist: []
        }];
        exp = { ...exp, ['t' + task.id]: true };
        project = { ...project };
        apiPost('sub_task', task.id).then(res => {
            const st = task.subTasks.find(s => s.id === id);
            if (st && res?.id) { remapExpKey('s', id, res.id); st.id = res.id; project = { ...project }; }
        });
    }

    function addSubSubTask(st) {
        const id = nextId();
        st.subSubTasks = [...(st.subSubTasks || []), {
            id, name: '', status: 'Not Started', priority: st.priority || 'Medium',
            assigned_to: st.assigned_to, assignee_name: st.assignee_name || '',
            planned_start: null, planned_end: null, actual_start: null, actual_end: null,
            sort_order: (st.subSubTasks || []).length, notes: '', checklist: []
        }];
        exp = { ...exp, ['s' + st.id]: true };
        project = { ...project };
        apiPost('sub_sub_task', st.id).then(res => {
            const sst = st.subSubTasks.find(s => s.id === id);
            if (sst && res?.id) { sst.id = res.id; project = { ...project }; }
        });
    }

    function updatePhase(phase, field, value) {
        phase[field] = value;
        project = { ...project };
        apiPatch('phase', phase.id, { [field]: value });
    }

    function updateTask(task, field, value) {
        task[field] = value;
        if (field === 'assigned_to') {
            const u = users.find(x => x.id == value);
            task.assignee_name = u?.full_name || '';
        }
        project = { ...project };
        apiPatch('task', task.id, { [field]: value });
    }

    function updateSubTask(st, field, value) {
        st[field] = value;
        if (field === 'assigned_to') {
            const u = users.find(x => x.id == value);
            st.assignee_name = u?.full_name || '';
        }
        project = { ...project };
        apiPatch('sub_task', st.id, { [field]: value });
    }

    function updateSubSubTask(sst, field, value) {
        sst[field] = value;
        if (field === 'assigned_to') {
            const u = users.find(x => x.id == value);
            sst.assignee_name = u?.full_name || '';
        }
        project = { ...project };
        apiPatch('sub_sub_task', sst.id, { [field]: value });
    }

    function deletePhase(idx) {
        if (!confirm('Delete this phase?')) return;
        const ph = project.phases[idx];
        project.phases = project.phases.filter((_, i) => i !== idx);
        project = { ...project };
        apiDelete('phase', ph.id);
    }

    function deleteTask(phase, idx) {
        if (!confirm('Delete this task?')) return;
        const t = phase.tasks[idx];
        phase.tasks = phase.tasks.filter((_, i) => i !== idx);
        project = { ...project };
        apiDelete('task', t.id);
    }

    function deleteSubTask(task, idx) {
        if (!confirm('Delete?')) return;
        const st = task.subTasks[idx];
        task.subTasks = task.subTasks.filter((_, i) => i !== idx);
        project = { ...project };
        apiDelete('sub_task', st.id);
    }

    function deleteSubSubTask(st, idx) {
        if (!confirm('Delete?')) return;
        const sst = st.subSubTasks[idx];
        st.subSubTasks = st.subSubTasks.filter((_, i) => i !== idx);
        project = { ...project };
        apiDelete('sub_sub_task', sst.id);
    }

    function updateProjectField(field, value) {
        project[field] = value;
        project = { ...project };
        apiPatchProject({ [field]: value });
    }

    // Single dispatcher used by Gantt inline editors — picks the right type-specific updater.
    function updateRow(r, field, value) {
        if (r.type === 'phase') updatePhase(r.item, field, value);
        else if (r.type === 'task') updateTask(r.item, field, value);
        else if (r.type === 'sub_task') updateSubTask(r.item, field, value);
        else if (r.type === 'sub_sub_task') updateSubSubTask(r.item, field, value);
    }

    // ─── CHECKLIST (local-first) ───
    // inputKey lets the caller tell us which checkInputs slot to clear after add.
    // Always retrigger panel reactivity since the panel renders item.checklist by deep reference.
    function addCheckItem(entity, entityType, title, inputKey) {
        if (!title?.trim()) return;
        const id = nextId();
        entity.checklist = [...(entity.checklist || []), { id, title: title.trim(), is_checked: false }];
        if (inputKey) checkInputs = { ...checkInputs, [inputKey]: '' };
        project = { ...project };
        if (panel) panel = { ...panel };
        apiPost('checklist', entity.id, { name: title.trim(), checklist_parent_type: entityType }).then(res => {
            const ci = entity.checklist.find(c => c.id === id);
            if (ci && res?.id) { ci.id = res.id; project = { ...project }; if (panel) panel = { ...panel }; }
        });
    }

    function toggleCheck(ci) {
        ci.is_checked = !ci.is_checked;
        project = { ...project };
        if (panel) panel = { ...panel };
        apiPatch('checklist', ci.id, { is_checked: ci.is_checked ? 1 : 0 });
    }

    function updateCheck(ci, newTitle) {
        const t = (newTitle || '').trim();
        if (!t || t === ci.title) return;
        ci.title = t;
        project = { ...project };
        if (panel) panel = { ...panel };
        apiPatch('checklist', ci.id, { title: t });
    }

    function deleteCheck(entity, idx) {
        const ci = entity.checklist[idx];
        entity.checklist = entity.checklist.filter((_, i) => i !== idx);
        project = { ...project };
        if (panel) panel = { ...panel };
        apiDelete('checklist', ci.id);
    }

    // ─── DETAIL PANEL ───
    async function openPanel(type, item) {
        const res = await fetch(`/api/projects/${projectId}/attachments?entity_type=${type}&entity_id=${item.id}`);
        panelNotes = item.notes || '';
        panel = { type, item, attachments: res.ok ? await res.json() : [] };
    }
    // Pull URLs out of free-form text so the panel can show clickable chips.
    function extractLinks(text) {
        if (!text) return [];
        const re = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
        return [...new Set(text.match(re) || [])];
    }
    function linkHref(u) {
        return /^https?:\/\//i.test(u) ? u : 'https://' + u;
    }
    function shortUrl(u) {
        try {
            const p = new URL(linkHref(u));
            const tail = p.pathname === '/' ? '' : (p.pathname.length > 24 ? p.pathname.slice(0,24)+'…' : p.pathname);
            return p.host + tail;
        } catch { return u; }
    }
    // Route a panel field edit to the right type-specific updater so live edits reach the server.
    // Spread panel after mutating the item so Svelte sees a new top-level reference and re-renders
    // (deep mutations on item.notes alone don't invalidate the panel's template).
    function panelUpdate(field, value) {
        if (!panel) return;
        const { type, item } = panel;
        if (type === 'phase') updatePhase(item, field, value);
        else if (type === 'task') updateTask(item, field, value);
        else if (type === 'sub_task') updateSubTask(item, field, value);
        else if (type === 'sub_sub_task') updateSubSubTask(item, field, value);
        panel = { ...panel };
    }
    function hasDetails(item) {
        return !!(item?.notes || item?.checklist?.length);
    }
    async function uploadFile() {
        if (!fileInput?.files?.length || !panel) return;
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        fd.append('entity_type', panel.type);
        fd.append('entity_id', panel.item.id);
        const res = await fetch(`/api/projects/${projectId}/attachments`, { method: 'POST', body: fd });
        if (res.ok) {
            const att = await res.json();
            panel = { ...panel, attachments: [...panel.attachments, att] };
            fileInput.value = '';
        }
    }
    async function deleteAttach(attId) {
        await fetch(`/api/projects/${projectId}/attachments`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachment_id: attId }) });
        if (panel) panel = { ...panel, attachments: panel.attachments.filter(a => a.id !== attId) };
    }
    function fmtSize(b) { if (!b) return ''; if (b<1024) return b+'B'; if (b<1048576) return (b/1024).toFixed(1)+'KB'; return (b/1048576).toFixed(1)+'MB'; }

    // ─── PROGRESS (reactive, same formula as React) ───
    // Spread to force a NEW array reference each time `project` changes. Without this,
    // Svelte 5 legacy mode sees the same array ref and skips invalidating dependents
    // (the Gantt's keyed {#each gRowsList} won't redraw bars after edits).
    $: phases = project?.phases ? [...project.phases] : [];
    $: projectProgress = calcProjectProgress(phases);
    // Bump _tick on every project change so the Gantt's {#key _tick} blocks rebuild
    // after dropdown picks, name edits, status changes — not just drag. Without this,
    // assignee/status dropdown changes only become visible after switching tabs.
    $: project, _tick++;
    // Gantt-derived state. Must be computed in a reactive statement (not {@const} in the
    // template) so Svelte sees the read of phases/exp/_tick as explicit dependencies —
    // {@const} can't see through the ganttRange/ganttRows function-body closure reads,
    // and would cache stale values when expanding/collapsing rows.
    let gRowsList = [];
    let gRange = { start: '', end: '' };
    let gDays = [];
    let gMonths = [];
    $: { phases; _tick; customRangeStart; customRangeEnd;
        gRange = (customRangeStart && customRangeEnd)
            ? { start: customRangeStart, end: customRangeEnd }
            : ganttRange();
    }
    $: { gRange; gDays = dayList(gRange.start, gRange.end); }
    $: { gDays; gMonths = monthGroups(gDays); }
    $: { phases; exp; _tick; gRowsList = ganttRows(); }

    function sstP(sst) { return sst.status === 'Completed' ? 100 : 0; }
    function stP(st) { return st.subSubTasks?.length ? st.subSubTasks.reduce((s,x) => s+sstP(x),0)/st.subSubTasks.length : (st.status==='Completed'?100:0); }
    function tP(t) { return t.subTasks?.length ? t.subTasks.reduce((s,x) => s+stP(x),0)/t.subTasks.length : (t.status==='Completed'?100:0); }
    function phP(p) { return p.tasks?.length ? p.tasks.reduce((s,x) => s+tP(x),0)/p.tasks.length : 0; }
    function calcProjectProgress(phases) {
        const tw = phases.reduce((s,p) => s+parseFloat(p.weight||0), 0);
        if (tw === 0) return 0;
        return phases.reduce((s,p) => s + (phP(p) * parseFloat(p.weight||0) / tw), 0);
    }
    function drv(children) {
        if (!children?.length) return null;
        const s = children.map(c => c.status);
        if (s.some(x => x==='On Hold')) return 'On Hold';
        if (s.every(x => x==='Completed')) return 'Completed';
        if (s.every(x => x==='Not Started')) return 'Not Started';
        return 'In Progress';
    }

    // Recursively derive effective status, looking through children regardless of staleness
    // of the parent's own .status field. The server cascades status server-side after each
    // save, but the client doesn't refetch — so a phase's task.status can lag behind reality.
    function effStatus(item) {
        if (item.subSubTasks?.length) return drv(item.subSubTasks) || 'Not Started';
        if (item.subTasks?.length) return drv(item.subTasks.map(s => ({ status: effStatus(s) }))) || 'Not Started';
        if (item.tasks?.length) return drv(item.tasks.map(t => ({ status: effStatus(t) }))) || 'Not Started';
        return item.status;
    }

    // ─── DATE DERIVATION (parents auto-roll-up from children) ───
    // Every level now carries planned_start, planned_end, actual_start, actual_end. So derivation
    // is uniform: a non-leaf takes min(starts) and max(ends) of its direct children, recursively.
    // The user edits only at the leaf; parents read the rolled-up range.
    const childKey = it => it.tasks?.length ? 'tasks' : it.subTasks?.length ? 'subTasks' : it.subSubTasks?.length ? 'subSubTasks' : null;
    const minD = arr => { const v = arr.filter(Boolean); return v.length ? v.reduce((a,b) => a<b?a:b) : null; };
    const maxD = arr => { const v = arr.filter(Boolean); return v.length ? v.reduce((a,b) => a>b?a:b) : null; };
    function effPlanStart(it) { const k = childKey(it); return k ? minD(it[k].map(effPlanStart)) : (it.planned_start || null); }
    function effPlanEnd(it)   { const k = childKey(it); return k ? maxD(it[k].map(effPlanEnd))   : (it.planned_end   || null); }
    function effActStart(it)  { const k = childKey(it); return k ? minD(it[k].map(effActStart))  : (it.actual_start  || null); }
    function effActEnd(it)    { const k = childKey(it); return k ? maxD(it[k].map(effActEnd))    : (it.actual_end    || null); }

    // Color classes for status/priority dropdowns and badges
    const sCls = s => 's-' + (s||'not-started').toLowerCase().replace(/\s/g,'-');
    const pCls = p => 'p-' + (p||'medium').toLowerCase();

    const fmt = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—';
    const fmtF = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
    // Strict YYYY-MM-DD for <input type="date">; trims any ISO timestamp / Date toString output.
    const toD = d => { if (!d) return ''; const s = String(d); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0,10) : ''; };
    const sc = s => `badge badge-${(s||'not-started').toLowerCase().replace(/\s/g,'-')}`;
    const hcl = h => `badge badge-${(h||'on-track').toLowerCase().replace(/\s/g,'-')}`;
    const pcl = p => `badge badge-${(p||'medium').toLowerCase()}`;
    const pCol = v => v>=100?'#22c55e':v>=60?'#3b82f6':v>=30?'#f59e0b':'#94a3b8';
    $: canEdit = user?.role==='admin'||user?.role==='project_manager';
    const STS = ['Not Started','In Progress','Completed','On Hold','Cancelled'];
    const PRI = ['Low','Medium','High','Critical'];

    function getKanban() {
        const r = [];
        for (const ph of phases) for (const t of ph.tasks||[]) {
            if (!t.subTasks?.length) r.push({...t,itype:'task',pn:ph.name});
            for (const s of t.subTasks||[]) {
                if (!s.subSubTasks?.length) r.push({...s,itype:'sub_task',pn:ph.name,tn:t.name});
                for (const ss of s.subSubTasks||[]) r.push({...ss,itype:'sub_sub_task',pn:ph.name,tn:t.name});
            }
        }
        return r;
    }
    // ─── GANTT (daily timeline with drag-to-edit) ───
    let DAY_W = 28;               // pixels per day column (zoomable, 12–60)
    const G_ROW_H = 44;           // pixels per row (fits planned + actual bar)
    const G_BAR_H = 16;           // bar height
    // Optional manual range override. When both are set the chart uses these dates
    // instead of auto-fitting to the project's tasks.
    let customRangeStart = '';
    let customRangeEnd = '';
    let scrollEl;                 // ref to .g2-scroll for the Today-jump button
    function zoomIn()  { DAY_W = Math.min(60, DAY_W + 6); _tick++; }
    function zoomOut() { DAY_W = Math.max(12, DAY_W - 6); _tick++; }
    function clearCustomRange() { customRangeStart = ''; customRangeEnd = ''; _tick++; }
    function onCustomRangeChange() { _tick++; }
    function jumpToToday() {
        if (!scrollEl) return;
        const todayISO = new Date().toISOString().slice(0,10);
        const idx = dayDiff(gRange.start, todayISO);
        if (idx < 0 || idx >= gDays.length) {
            // Today is outside the current chart range — pin a manual range that
            // includes today, then jump.
            customRangeStart = addDays(todayISO, -14);
            customRangeEnd = addDays(todayISO, 45);
            _tick++;
            // Defer the scroll until after the reactive flush rebuilds the grid.
            queueMicrotask(() => doScrollToToday());
        } else {
            doScrollToToday();
        }
    }
    function doScrollToToday() {
        if (!scrollEl) return;
        const todayISO = new Date().toISOString().slice(0,10);
        const idx = dayDiff(gRange.start, todayISO);
        if (idx < 0) return;
        const leftPaneW = 560;
        const target = Math.max(0, idx * DAY_W + leftPaneW - scrollEl.clientWidth / 2);
        scrollEl.scrollTo({ left: target, behavior: 'smooth' });
    }
    const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    let dragG = null;             // drag state: { row, kind:'plan'|'act', mode:'move'|'start'|'end', startX, origStart, origEnd, fieldStart, fieldEnd }
    // Primitive counter bumped on every drag mutation. Inside keyed {#each} blocks,
    // Svelte 5 can't see through rowPlanStart(r) to track r.item.planned_start as a
    // template dependency — so position-only changes (drag) don't re-evaluate the bar
    // {@const}s. Reading _tick in the Gantt's _dep forces re-render after every mutation.
    let _tick = 0;

    function dayDiff(a, b) { return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5); }
    function addDays(d, n) {
        if (!d) return null;
        const dt = new Date(d);
        dt.setDate(dt.getDate() + n);
        return dt.toISOString().slice(0, 10);
    }
    function dayList(startISO, endISO) {
        const out = [];
        const end = new Date(endISO).getTime();
        for (let d = new Date(startISO); d.getTime() <= end; d.setDate(d.getDate()+1)) {
            const dow = d.getDay();
            out.push({
                iso: d.toISOString().slice(0,10),
                day: d.getDate(),
                month: d.getMonth(),
                year: d.getFullYear(),
                weekend: dow === 0 || dow === 6
            });
        }
        return out;
    }
    function monthGroups(days) {
        const out = [];
        for (const d of days) {
            const key = `${d.year}-${d.month}`;
            const last = out[out.length-1];
            if (!last || last.key !== key) out.push({ key, label: `${MONTHS_LONG[d.month]} ${d.year}`, span: 1 });
            else last.span++;
        }
        return out;
    }
    function ganttRange() {
        const all = [];
        const collect = it => {
            for (const f of ['planned_start','planned_end','actual_start','actual_end']) {
                if (it[f]) all.push(toD(it[f]));
            }
        };
        for (const ph of phases) {
            collect(ph);
            for (const t of ph.tasks||[]) {
                collect(t);
                for (const st of t.subTasks||[]) {
                    collect(st);
                    for (const sst of st.subSubTasks||[]) collect(sst);
                }
            }
        }
        if (!all.length) {
            const today = new Date().toISOString().slice(0,10);
            return { start: addDays(today, -14), end: addDays(today, 45) };
        }
        all.sort();
        return { start: addDays(all[0], -7), end: addDays(all[all.length-1], 14) };
    }
    function ganttRows() {
        const rows = [];
        phases.forEach((ph, pi) => {
            rows.push({ type:'phase', item:ph, lvl:0, wbs:`${pi+1}`, name:ph.name, assignee:'', isLeaf:false, hasToggle:!!(ph.tasks?.length), key:'p'+ph.id });
            if (exp['p'+ph.id]) {
                (ph.tasks||[]).forEach((t, ti) => {
                    rows.push({ type:'task', item:t, lvl:1, wbs:`${pi+1}.${ti+1}`, name:t.name, assignee:t.assignee_name, isLeaf:!(t.subTasks?.length), hasToggle:!!(t.subTasks?.length), key:'t'+t.id });
                    if (exp['t'+t.id] && t.subTasks?.length) {
                        t.subTasks.forEach((st, si) => {
                            rows.push({ type:'sub_task', item:st, lvl:2, wbs:`${pi+1}.${ti+1}.${si+1}`, name:st.name, assignee:st.assignee_name, isLeaf:!(st.subSubTasks?.length), hasToggle:!!(st.subSubTasks?.length), key:'s'+st.id });
                            if (exp['s'+st.id] && st.subSubTasks?.length) {
                                st.subSubTasks.forEach((sst, ssi) => {
                                    rows.push({ type:'sub_sub_task', item:sst, lvl:3, wbs:`${pi+1}.${ti+1}.${si+1}.${ssi+1}`, name:sst.name, assignee:sst.assignee_name, isLeaf:true, hasToggle:false, key:'ss'+sst.id });
                                });
                            }
                        });
                    }
                });
            }
        });
        return rows;
    }
    // Bar dates: parents derive, leaves use own. Planned always has a meaningful range; actual only when leaf has set both.
    const rowPlanStart = r => r.isLeaf ? r.item.planned_start : effPlanStart(r.item);
    const rowPlanEnd   = r => r.isLeaf ? r.item.planned_end   : effPlanEnd(r.item);
    const rowActStart  = r => r.isLeaf ? r.item.actual_start  : effActStart(r.item);
    const rowActEnd    = r => r.isLeaf ? r.item.actual_end    : effActEnd(r.item);

    // Single pointerdown handler per row that dispatches based on what was clicked:
    //   • handle (.g2-handle-l/-r)    → resize the bar's start or end
    //   • bar body (.g2-bar)          → move the whole bar
    //   • empty row area              → "paint" a new planned range (Excel-style click+drag)
    function onGanttRowDown(e, row) {
        if (!row.isLeaf) return;             // parents are derived; no interaction
        if (e.button !== 0) return;          // left-click only
        const t = e.target;
        const barEl = t.closest('.g2-bar');
        const isHL = t.classList?.contains('g2-handle-l');
        const isHR = t.classList?.contains('g2-handle-r');
        let mode, kind;
        if ((isHL || isHR) && barEl) {
            kind = barEl.classList.contains('g2-act') ? 'act' : 'plan';
            mode = isHL ? 'start' : 'end';
        } else if (barEl) {
            kind = barEl.classList.contains('g2-act') ? 'act' : 'plan';
            mode = 'move';
        } else {
            mode = 'draw';
            // Vertical position within row decides which bar is being painted.
            // Top half → planned (matches the plan bar position at top of row).
            // Bottom half → actual (matches the actual bar position at bottom).
            const rowRect = e.currentTarget.getBoundingClientRect();
            kind = (e.clientY - rowRect.top) < rowRect.height / 2 ? 'plan' : 'act';
        }
        e.preventDefault();
        const fieldStart = kind === 'plan' ? 'planned_start' : 'actual_start';
        const fieldEnd   = kind === 'plan' ? 'planned_end'   : 'actual_end';
        if (mode === 'draw') {
            const rect = e.currentTarget.getBoundingClientRect();
            const d = Math.max(0, Math.floor((e.clientX - rect.left) / DAY_W));
            dragG = { row, mode, kind, fieldStart, fieldEnd, startDay: d, endDay: d, rowLeft: rect.left, rangeStart: gRange.start };
        } else {
            const origStart = toD(row.item[fieldStart]);
            const origEnd   = toD(row.item[fieldEnd]);
            if (!origStart || !origEnd) return;
            dragG = { row, mode, kind, fieldStart, fieldEnd, startX: e.clientX, origStart, origEnd };
        }
        window.addEventListener('pointermove', onGanttMove);
        window.addEventListener('pointerup', onGanttUp);
    }
    function onGanttMove(e) {
        if (!dragG) return;
        if (dragG.mode === 'draw') {
            const d = Math.max(0, Math.floor((e.clientX - dragG.rowLeft) / DAY_W));
            dragG = { ...dragG, endDay: d };
            return;
        }
        const { row, mode, origStart, origEnd, fieldStart, fieldEnd } = dragG;
        const days = Math.round((e.clientX - dragG.startX) / DAY_W);
        if (mode === 'move') {
            row.item[fieldStart] = addDays(origStart, days);
            row.item[fieldEnd]   = addDays(origEnd, days);
        } else if (mode === 'start') {
            const ns = addDays(origStart, days);
            if (ns <= origEnd) row.item[fieldStart] = ns;
        } else {
            const ne = addDays(origEnd, days);
            if (ne >= origStart) row.item[fieldEnd] = ne;
        }
        _tick++;
        project = { ...project };
    }
    function onGanttUp() {
        if (!dragG) return;
        const { row, mode, fieldStart, fieldEnd } = dragG;
        const item = row.item;
        const updater = row.type === 'task' ? updateTask : row.type === 'sub_task' ? updateSubTask : updateSubSubTask;
        if (mode === 'draw') {
            const lo = Math.min(dragG.startDay, dragG.endDay);
            const hi = Math.max(dragG.startDay, dragG.endDay);
            const sd = addDays(dragG.rangeStart, lo);
            const ed = addDays(dragG.rangeStart, hi);
            updater(item, fieldStart, sd);
            updater(item, fieldEnd,   ed);
        } else {
            const { origStart, origEnd } = dragG;
            if (item[fieldStart] !== origStart) updater(item, fieldStart, item[fieldStart]);
            if (item[fieldEnd]   !== origEnd)   updater(item, fieldEnd,   item[fieldEnd]);
        }
        dragG = null;
        _tick++;
        project = { ...project };
        window.removeEventListener('pointermove', onGanttMove);
        window.removeEventListener('pointerup', onGanttUp);
    }
</script>

{#if loading}
    <div style="padding:60px; text-align:center; color:var(--text-muted)">Loading...</div>
{:else if !project}
    <div style="padding:60px; text-align:center; color:var(--text-muted)">Project not found.</div>
{:else}
    <div class="ph">
        <div class="flex items-center gap-3">
            <button class="btn btn-secondary btn-sm" on:click={() => goto('/projects')}>← Back</button>
            <div><div style="font-size:11px; color:var(--text-muted)">{project.project_code}</div><h1 style="font-size:20px; font-weight:700">{project.name}</h1></div>
            <div style="margin-left:auto; display:flex; gap:8px"><span class={sc(project.status)}>{project.status}</span><span class={hcl(project.health)}>{project.health}</span></div>
        </div>
        <div class="tabs" style="margin-top:12px">
            {#each [{id:'overview',l:'📊 Overview'},{id:'wbs',l:'📋 Work Breakdown Structure'},{id:'kanban',l:'📌 Kanban'},{id:'gantt',l:'📅 Gantt'}] as t}
                <button class="tab" class:active={activeTab===t.id} on:click={() => activeTab=t.id}>{t.l}</button>
            {/each}
        </div>
    </div>

    <div class="pc">
        <!-- OVERVIEW -->
        {#if activeTab==='overview'}
            {@const wbsStart = phases.length ? phases.map(effPlanStart).filter(Boolean).reduce((a,b)=>a<b?a:b, null) : null}
            {@const wbsEnd   = phases.length ? phases.map(effPlanEnd).filter(Boolean).reduce((a,b)=>a>b?a:b, null) : null}
            {@const taskCounts = (() => {
                let tasks = 0, subs = 0, subsubs = 0, leaves = 0;
                for (const p of phases) {
                    for (const t of p.tasks||[]) {
                        tasks++;
                        if (t.subTasks?.length) {
                            for (const st of t.subTasks) {
                                subs++;
                                if (st.subSubTasks?.length) {
                                    for (const sst of st.subSubTasks) { subsubs++; leaves++; }
                                } else { leaves++; }
                            }
                        } else { leaves++; }
                    }
                }
                return { phases: phases.length, tasks, subs, subsubs, leaves };
            })()}
            <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
                <div class="card"><div class="sl">Progress</div><div class="sv">{Math.round(projectProgress)}%</div><div class="progress-bar" style="margin-top:8px"><div class="progress-bar-track" style="height:8px"><div class="progress-bar-fill" style="width:{projectProgress}%; background:{pCol(projectProgress)}; height:100%"></div></div></div></div>
                <div class="card">
                    <div class="sl">Status</div>
                    <div style="margin:8px 0"><span class={sc(project.status)}>{project.status}</span></div>
                    {#if canEdit}<select class="input input-sm" value={project.status} on:change={e => updateProjectField('status',e.target.value)}>{#each STS as s}<option>{s}</option>{/each}</select>{/if}
                    <div class="sl" style="margin-top:10px">Health</div>
                    <div style="margin:8px 0"><span class={hcl(project.health)}>{project.health}</span></div>
                    {#if canEdit}<select class="input input-sm" value={project.health} on:change={e => updateProjectField('health',e.target.value)}><option>On Track</option><option>At Risk</option><option>Off Track</option></select>{/if}
                </div>
                <div class="card">
                    <div class="sl">Work Items</div>
                    <div class="sv">{taskCounts.leaves}</div>
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:10px">leaf items (actual work)</div>
                    <div class="wc-row"><span class="wc-lbl">Phases</span><span class="wc-num">{taskCounts.phases}</span></div>
                    <div class="wc-row"><span class="wc-lbl">Tasks</span><span class="wc-num">{taskCounts.tasks}</span></div>
                    {#if taskCounts.subs > 0}<div class="wc-row"><span class="wc-lbl">Sub-tasks</span><span class="wc-num">{taskCounts.subs}</span></div>{/if}
                    {#if taskCounts.subsubs > 0}<div class="wc-row"><span class="wc-lbl">Sub-sub-tasks</span><span class="wc-num">{taskCounts.subsubs}</span></div>{/if}
                </div>
                <div class="card">
                    <div class="sl">Timeline (from WBS)</div>
                    <div style="font-size:13px; font-weight:600; margin:10px 0 2px">{fmtF(wbsStart) || '—'}</div>
                    <div style="font-size:11px; color:var(--text-muted)">to {fmtF(wbsEnd) || '—'}</div>
                    {#if !wbsStart && !wbsEnd}<div style="font-size:11px; color:var(--text-muted); margin-top:6px">Set dates in WBS tab</div>{/if}
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px">
                <div class="card">
                    <h3 style="font-size:14px; font-weight:700; margin-bottom:16px">Details</h3>
                    <div class="ov-row"><span class="ov-lbl">Manager</span>
                        {#if canEdit}<select class="input input-sm" value={project.manager_id||''} on:change={e => updateProjectField('manager_id',e.target.value||null)}><option value="">—</option>{#each users.filter(u=>u.role!=='staff') as u}<option value={u.id}>{u.full_name}</option>{/each}</select>
                        {:else}<span class="ov-val">{project.manager_name||'—'}</span>{/if}
                    </div>
                    <div class="ov-row"><span class="ov-lbl">Category</span>
                        {#if canEdit}<select class="input input-sm" value={project.category||''} on:change={e => updateProjectField('category',e.target.value)}>
                            {#each ['Web Application','Mobile App','Infrastructure','ERP/System Integration','Data & Analytics','Security','Other'] as c}<option>{c}</option>{/each}
                        </select>
                        {:else}<span class="ov-val">{project.category||'—'}</span>{/if}
                    </div>
                    <div class="ov-row"><span class="ov-lbl">Company</span>
                        {#if canEdit}<input class="input input-sm" value={project.company||''} on:change={e => updateProjectField('company',e.target.value)} placeholder="—" />
                        {:else}<span class="ov-val">{project.company||'—'}</span>{/if}
                    </div>
                    <div class="ov-row"><span class="ov-lbl">Department</span>
                        {#if canEdit}<input class="input input-sm" value={project.department||''} on:change={e => updateProjectField('department',e.target.value)} placeholder="—" />
                        {:else}<span class="ov-val">{project.department||'—'}</span>{/if}
                    </div>
                </div>
                <div class="card"><h3 style="font-size:14px; font-weight:700; margin-bottom:16px">Phases</h3>{#each phases as phase}{@const pp=phP(phase)}<div style="margin-bottom:14px"><div style="display:flex; justify-content:space-between; margin-bottom:4px"><span style="font-size:13px; font-weight:500">{phase.name||'—'}</span><span style="font-size:11px; color:var(--text-muted)">{Math.round(phase.weight)}%</span></div><div class="progress-bar"><div class="progress-bar-track" style="height:7px"><div class="progress-bar-fill" style="width:{pp}%; background:{pCol(pp)}; height:100%"></div></div><span class="progress-bar-label">{Math.round(pp)}%</span></div></div>{/each}</div>
            </div>

        <!-- WBS -->
        {:else if activeTab==='wbs'}
            {@const tw = phases.reduce((s,p) => s+parseFloat(p.weight||0),0)}
            <div class="flex items-center gap-5 card" style="margin-bottom:16px">
                <div style="flex:1"><div style="font-size:12px; color:var(--text-muted); margin-bottom:6px">Overall</div><div class="progress-bar"><div class="progress-bar-track" style="height:10px"><div class="progress-bar-fill" style="width:{projectProgress}%; background:{pCol(projectProgress)}; height:100%"></div></div><span class="progress-bar-label">{Math.round(projectProgress)}%</span></div></div>
                <div style="text-align:center; padding:0 16px; border-left:1px solid var(--border)"><div style="font-size:11px; color:var(--text-muted)">Weight</div><div style="font-size:20px; font-weight:700; color:{tw===100?'var(--success-text)':'var(--danger-text)'}">{tw}%</div></div>
            </div>

            <div class="table-container" style="overflow:auto">
                <table style="min-width:1200px">
                    <thead><tr>
                        <th style="min-width:260px">WBS Item</th><th style="width:55px; text-align:center">Wt%</th><th style="min-width:160px">Assignee</th><th style="width:115px">Status</th><th style="width:100px">Priority</th>
                        <th style="width:95px">Plan Start</th><th style="width:95px">Plan End</th><th style="width:95px; background:#f0fdf4">Act. Start</th><th style="width:95px; background:#f0fdf4">Act. End</th>
                        <th style="width:90px">Progress</th><th style="width:40px; text-align:center">📎</th><th style="width:55px; text-align:center">Act</th>
                    </tr></thead>
                    <tbody>
                        {#each phases as phase, pi}
                            {@const _pp=phP(phase)}
                            {@const _ps=effStatus(phase)}
                            <tr style="background:#eef2ff; border-left:4px solid #4f46e5">
                                <td style="padding-left:12px"><div class="flex items-center gap-2">
                                    <button class="xb" on:click={() => toggle('p'+phase.id)}>{exp['p'+phase.id]?'▾':'▸'}</button>
                                    <span class="wbs-number">{pi+1}.</span>
                                    <textarea class="ii" style="font-weight:700" rows="1" on:input={autoResize} on:change={e => updatePhase(phase,'name',e.target.value)}>{phase.name}</textarea>
                                </div></td>
                                <td style="text-align:center"><input type="number" class="input input-sm no-spin" style="width:44px; text-align:center" value={Math.round(phase.weight)} on:change={e => updatePhase(phase,'weight',parseFloat(e.target.value)||0)} /></td>
                                <td><span class="dm">—</span></td>
                                <td><span class={sc(_ps)} style="font-size:10px">{_ps}</span></td>
                                <td><span class="dm">—</span></td>
                                {#if phase.tasks?.length}
                                    <td><span class="dm">{fmtF(effPlanStart(phase))}</span></td>
                                    <td><span class="dm">{fmtF(effPlanEnd(phase))}</span></td>
                                    <td><span class="dm">{fmtF(effActStart(phase))}</span></td>
                                    <td><span class="dm">{fmtF(effActEnd(phase))}</span></td>
                                {:else}
                                    <td><input type="date" class="di" value={toD(phase.planned_start)} on:change={e => updatePhase(phase,'planned_start',e.target.value)} /></td>
                                    <td><input type="date" class="di" value={toD(phase.planned_end)} on:change={e => updatePhase(phase,'planned_end',e.target.value)} /></td>
                                    <td><input type="date" class="di ac" value={toD(phase.actual_start)} on:change={e => updatePhase(phase,'actual_start',e.target.value)} /></td>
                                    <td><input type="date" class="di ac" value={toD(phase.actual_end)} on:change={e => updatePhase(phase,'actual_end',e.target.value)} /></td>
                                {/if}
                                <td><div class="progress-bar"><div class="progress-bar-track"><div class="progress-bar-fill" style="width:{_pp}%; background:{pCol(_pp)}; height:100%"></div></div><span class="progress-bar-label">{Math.round(_pp)}%</span></div></td>
                                <td style="text-align:center"><button class="xb" title="Details" on:click={() => openPanel('phase',phase)}>{hasDetails(phase)?'📝':'📋'}</button></td>
                                <td style="text-align:center"><button class="xb" on:click={() => addTask(phase)}>＋</button><button class="xb dl" on:click={() => deletePhase(pi)}>✕</button></td>
                            </tr>
                            {#if exp['p'+phase.id]}
                                {#each phase.tasks||[] as task, ti}
                                    {@const _tp=tP(task)}
                                    {@const _tk=task.subTasks?.length>0}
                                    {@const _ts=effStatus(task)}
                                    <tr style="background:#f0fdfa; border-left:4px solid #0891b2">
                                        <td style="padding-left:40px"><div class="flex items-center gap-2">
                                            {#if _tk}<button class="xb" on:click={() => toggle('t'+task.id)}>{exp['t'+task.id]?'▾':'▸'}</button>{:else}<span style="width:20px"></span>{/if}
                                            <span class="wbs-number">{pi+1}.{ti+1}.</span>
                                            <textarea class="ii" style="font-weight:600" rows="1" on:input={autoResize} on:change={e => updateTask(task,'name',e.target.value)}>{task.name}</textarea>
                                        </div></td>
                                        <td><span class="dm">—</span></td>
                                        <td>{#if _tk}<span class="dm">—</span>{:else}<select class="input input-sm" bind:value={task.assigned_to} on:change={() => updateTask(task,'assigned_to',task.assigned_to)}><option value={null}>—</option>{#each users as u}<option value={u.id}>{u.full_name}</option>{/each}</select>{/if}</td>
                                        <td>{#if _tk}<span class={sc(_ts)} style="font-size:10px">{_ts}</span>{:else}<select class="input input-sm sel-status {sCls(task.status)}" value={task.status} on:change={e => updateTask(task,'status',e.target.value)}>{#each STS as s}<option>{s}</option>{/each}</select>{/if}</td>
                                        <td>{#if _tk}<span class="dm">—</span>{:else}<select class="input input-sm sel-priority {pCls(task.priority)}" value={task.priority} on:change={e => updateTask(task,'priority',e.target.value)}>{#each PRI as p}<option>{p}</option>{/each}</select>{/if}</td>
                                        {#if _tk}
                                            <td><span class="dm">{fmtF(effPlanStart(task))}</span></td>
                                            <td><span class="dm">{fmtF(effPlanEnd(task))}</span></td>
                                            <td><span class="dm">{fmtF(effActStart(task))}</span></td>
                                            <td><span class="dm">{fmtF(effActEnd(task))}</span></td>
                                        {:else}
                                            <td><input type="date" class="di" value={toD(task.planned_start)} on:change={e => updateTask(task,'planned_start',e.target.value)} /></td>
                                            <td><input type="date" class="di" value={toD(task.planned_end)} on:change={e => updateTask(task,'planned_end',e.target.value)} /></td>
                                            <td><input type="date" class="di ac" value={toD(task.actual_start)} on:change={e => updateTask(task,'actual_start',e.target.value)} /></td>
                                            <td><input type="date" class="di ac" value={toD(task.actual_end)} on:change={e => updateTask(task,'actual_end',e.target.value)} /></td>
                                        {/if}
                                        <td><div class="progress-bar"><div class="progress-bar-track"><div class="progress-bar-fill" style="width:{_tp}%; background:{pCol(_tp)}; height:100%"></div></div><span class="progress-bar-label">{Math.round(_tp)}%</span></div></td>
                                        <td style="text-align:center"><button class="xb" title="Details" on:click={() => openPanel('task',task)}>{hasDetails(task)?'📝':'📋'}</button></td>
                                        <td style="text-align:center"><button class="xb" on:click={() => addSubTask(task)}>＋</button><button class="xb dl" on:click={() => deleteTask(phase,ti)}>✕</button></td>
                                    </tr>
                                    {#if exp['t'+task.id]}
                                        {#each task.subTasks||[] as st, si}
                                            {@const _sp=stP(st)}
                                            {@const _sk=st.subSubTasks?.length>0}
                                            {@const _ss=effStatus(st)}
                                            <tr style="background:#faf5ff; border-left:4px solid #7c3aed">
                                                <td style="padding-left:68px"><div class="flex items-center gap-2">
                                                    {#if _sk}<button class="xb" on:click={() => toggle('s'+st.id)}>{exp['s'+st.id]?'▾':'▸'}</button>{:else}<span style="width:20px"></span>{/if}
                                                    <span class="wbs-number">{pi+1}.{ti+1}.{si+1}.</span>
                                                    <textarea class="ii" rows="1" on:input={autoResize} on:change={e => updateSubTask(st,'name',e.target.value)}>{st.name}</textarea>
                                                </div></td>
                                                <td><span class="dm">—</span></td>
                                                <td>{#if _sk}<span class="dm">—</span>{:else}<select class="input input-sm" bind:value={st.assigned_to} on:change={() => updateSubTask(st,'assigned_to',st.assigned_to)}><option value={null}>—</option>{#each users as u}<option value={u.id}>{u.full_name}</option>{/each}</select>{/if}</td>
                                                <td>{#if _sk}<span class={sc(_ss)} style="font-size:10px">{_ss}</span>{:else}<select class="input input-sm sel-status {sCls(st.status)}" value={st.status} on:change={e => updateSubTask(st,'status',e.target.value)}>{#each STS as s}<option>{s}</option>{/each}</select>{/if}</td>
                                                <td>{#if _sk}<span class="dm">—</span>{:else}<select class="input input-sm sel-priority {pCls(st.priority||task.priority)}" value={st.priority||task.priority} on:change={e => updateSubTask(st,'priority',e.target.value)}>{#each PRI as p}<option>{p}</option>{/each}</select>{/if}</td>
                                                {#if _sk}
                                                    <td><span class="dm">{fmtF(effPlanStart(st))}</span></td>
                                                    <td><span class="dm">{fmtF(effPlanEnd(st))}</span></td>
                                                    <td><span class="dm">{fmtF(effActStart(st))}</span></td>
                                                    <td><span class="dm">{fmtF(effActEnd(st))}</span></td>
                                                {:else}
                                                    <td><input type="date" class="di" value={toD(st.planned_start)} on:change={e => updateSubTask(st,'planned_start',e.target.value)} /></td>
                                                    <td><input type="date" class="di" value={toD(st.planned_end)} on:change={e => updateSubTask(st,'planned_end',e.target.value)} /></td>
                                                    <td><input type="date" class="di ac" value={toD(st.actual_start)} on:change={e => updateSubTask(st,'actual_start',e.target.value)} /></td>
                                                    <td><input type="date" class="di ac" value={toD(st.actual_end)} on:change={e => updateSubTask(st,'actual_end',e.target.value)} /></td>
                                                {/if}
                                                <td><div class="progress-bar"><div class="progress-bar-track"><div class="progress-bar-fill" style="width:{_sp}%; background:{pCol(_sp)}; height:100%"></div></div><span class="progress-bar-label">{Math.round(_sp)}%</span></div></td>
                                                <td style="text-align:center"><button class="xb" title="Details" on:click={() => openPanel('sub_task',st)}>{hasDetails(st)?'📝':'📋'}</button></td>
                                                <td style="text-align:center"><button class="xb" on:click={() => addSubSubTask(st)}>＋</button><button class="xb dl" on:click={() => deleteSubTask(task,si)}>✕</button></td>
                                            </tr>
                                            {#if exp['s'+st.id]}
                                                {#each st.subSubTasks||[] as sst, ssi}
                                                    {@const _sstp=sstP(sst)}
                                                    <tr style="background:#fff7ed; border-left:4px solid #c2410c">
                                                        <td style="padding-left:96px"><div class="flex items-center gap-2">
                                                            <span style="width:20px"></span>
                                                            <span class="wbs-number">{pi+1}.{ti+1}.{si+1}.{ssi+1}.</span>
                                                            <textarea class="ii" rows="1" on:input={autoResize} on:change={e => updateSubSubTask(sst,'name',e.target.value)}>{sst.name}</textarea>
                                                        </div></td>
                                                        <td><span class="dm">—</span></td>
                                                        <td><select class="input input-sm" bind:value={sst.assigned_to} on:change={() => updateSubSubTask(sst,'assigned_to',sst.assigned_to)}><option value={null}>—</option>{#each users as u}<option value={u.id}>{u.full_name}</option>{/each}</select></td>
                                                        <td><select class="input input-sm sel-status {sCls(sst.status)}" value={sst.status} on:change={e => updateSubSubTask(sst,'status',e.target.value)}>{#each STS as s}<option>{s}</option>{/each}</select></td>
                                                        <td><select class="input input-sm sel-priority {pCls(sst.priority||st.priority||task.priority)}" value={sst.priority||st.priority||task.priority} on:change={e => updateSubSubTask(sst,'priority',e.target.value)}>{#each PRI as p}<option>{p}</option>{/each}</select></td>
                                                        <td><input type="date" class="di" value={toD(sst.planned_start)} on:change={e => updateSubSubTask(sst,'planned_start',e.target.value)} /></td>
                                                        <td><input type="date" class="di" value={toD(sst.planned_end)} on:change={e => updateSubSubTask(sst,'planned_end',e.target.value)} /></td>
                                                        <td><input type="date" class="di ac" value={toD(sst.actual_start)} on:change={e => updateSubSubTask(sst,'actual_start',e.target.value)} /></td>
                                                        <td><input type="date" class="di ac" value={toD(sst.actual_end)} on:change={e => updateSubSubTask(sst,'actual_end',e.target.value)} /></td>
                                                        <td><div class="progress-bar"><div class="progress-bar-track"><div class="progress-bar-fill" style="width:{_sstp}%; background:{pCol(_sstp)}; height:100%"></div></div><span class="progress-bar-label">{_sstp}%</span></div></td>
                                                        <td style="text-align:center"><button class="xb" title="Details" on:click={() => openPanel('sub_sub_task',sst)}>{hasDetails(sst)?'📝':'📋'}</button></td>
                                                        <td style="text-align:center"><button class="xb dl" on:click={() => deleteSubSubTask(st,ssi)}>✕</button></td>
                                                    </tr>
                                                {/each}
                                            {/if}
                                        {/each}
                                    {/if}
                                {/each}
                            {/if}
                        {/each}
                    </tbody>
                </table>
            </div>
            {#if canEdit}<button class="btn btn-secondary" style="margin-top:12px" on:click={addPhase}>＋ Add Phase</button>{/if}

        <!-- KANBAN -->
        {:else if activeTab==='kanban'}
            {@const ki=getKanban()}
            {@const cols=['Not Started','In Progress','Completed','On Hold']}
            {@const cc={'Not Started':'#94a3b8','In Progress':'#3b82f6','Completed':'#22c55e','On Hold':'#eab308'}}
            <div class="kanban-board" style="grid-template-columns:repeat(4,1fr)">
                {#each cols as col}{@const ci=ki.filter(i=>i.status===col)}
                    <div class="kanban-column">
                        <div class="flex items-center gap-2" style="margin-bottom:12px"><span style="width:8px; height:8px; border-radius:50%; background:{cc[col]}"></span><b style="font-size:13px">{col}</b><span style="font-size:11px; color:var(--text-muted); margin-left:auto; background:var(--border); padding:1px 8px; border-radius:99px">{ci.length}</span></div>
                        {#each ci as item}<div class="kanban-card" style="margin-bottom:8px"><div style="font-size:12px; font-weight:600; margin-bottom:4px">{item.name||'—'}</div><div style="font-size:10px; color:var(--text-muted); margin-bottom:8px">{item.pn}{item.tn?` → ${item.tn}`:''}</div><div class="flex items-center gap-2">{#if item.assignee_name}<span style="font-size:10px; background:var(--info-bg); color:var(--info-text); padding:2px 6px; border-radius:4px">{item.assignee_name}</span>{/if}<span class={pcl(item.priority)} style="font-size:9px">{item.priority}</span></div></div>{/each}
                        {#if ci.length===0}<div style="text-align:center; padding:20px; color:var(--text-light); font-size:12px">No items</div>{/if}
                    </div>
                {/each}
            </div>

        <!-- GANTT -->
        {:else if activeTab==='gantt'}
            <!-- gRange, gDays, gMonths, gRowsList are computed in script reactive statements
                 so Svelte tracks their phases/exp/_tick dependencies properly. -->
            {@const todayISO = new Date().toISOString().slice(0,10)}
            {@const todayIdx = dayDiff(gRange.start, todayISO)}
            <div class="gantt2">
                <div class="g2-legend">
                    <span class="g2-leg-item"><span class="g2-leg-sw g2-leg-plan"></span>Planned</span>
                    <span class="g2-leg-item"><span class="g2-leg-sw g2-leg-act"></span>Actual</span>
                    <span class="g2-leg-item"><span class="g2-leg-sw g2-leg-weekend"></span>Weekend</span>
                    <span class="g2-leg-item"><span class="g2-leg-sw g2-leg-today"></span>Today</span>
                    <span class="g2-leg-divider"></span>
                    <div class="g2-tool">
                        <span class="g2-tool-label">Zoom</span>
                        <button class="g2-tool-btn" title="Zoom out" on:click={zoomOut} disabled={DAY_W <= 12}>−</button>
                        <span class="g2-tool-val">{DAY_W}px</span>
                        <button class="g2-tool-btn" title="Zoom in" on:click={zoomIn} disabled={DAY_W >= 60}>+</button>
                    </div>
                    <div class="g2-tool">
                        <span class="g2-tool-label">Range</span>
                        <input type="date" class="g2-tool-date" bind:value={customRangeStart} on:change={onCustomRangeChange} title="Custom start" />
                        <span>→</span>
                        <input type="date" class="g2-tool-date" bind:value={customRangeEnd} on:change={onCustomRangeChange} title="Custom end" />
                        {#if customRangeStart || customRangeEnd}
                            <button class="g2-tool-btn" title="Back to auto-fit" on:click={clearCustomRange}>Auto</button>
                        {/if}
                    </div>
                    <button class="g2-tool-btn g2-tool-today" title="Scroll to today" on:click={jumpToToday}>📍 Today</button>
                    <span class="g2-leg-hint">Drag empty row: top half = planned, bottom half = actual • drag bar to move • drag edge to resize</span>
                </div>
                <div class="g2-scroll" bind:this={scrollEl}>
                    <div class="g2-grid" style="width:{560 + gDays.length * DAY_W}px;">
                        <!-- Header row (sticky top). Wrapping tl + tr in a flex row makes
                             the sticky-left .g2-tl have a parent wider than itself, so it
                             can actually stick horizontally (a grid item can't, since its
                             containing block is its own cell). -->
                        <div class="g2-header-row">
                            <!-- Top-left header (sticky left, inside sticky top row = sticky both) -->
                            <div class="g2-tl">
                                <div class="g2-th" style="width:200px">WBS Item</div>
                                <div class="g2-th" style="width:120px">Assignee</div>
                                <div class="g2-th" style="width:110px">Status</div>
                                <div class="g2-th" style="width:65px">Start</div>
                                <div class="g2-th" style="width:65px">End</div>
                            </div>
                            <!-- Top-right: months + days -->
                            <div class="g2-tr" style="width:{gDays.length * DAY_W}px">
                                <div class="g2-months">
                                    {#each gMonths as m}
                                        <div class="g2-month" style="width:{m.span*DAY_W}px">{m.label}</div>
                                    {/each}
                                </div>
                                <div class="g2-days">
                                    {#each gDays as d}
                                        <div class="g2-day" class:weekend={d.weekend} class:today={d.iso===todayISO} style="width:{DAY_W}px">{d.day}</div>
                                    {/each}
                                </div>
                            </div>
                        </div>
                        <!-- Body row (flex; lets .g2-l stick horizontally within it) -->
                        <div class="g2-body-row">
                            <!-- Left body (sticky left). Wrapped in {#key _tick} so the
                                 row contents (name input, dropdowns, derived status badge,
                                 start/end dates) fully rebuild after every project change.
                                 Same reason as the bars: Svelte 5 can't see through helper
                                 functions like effStatus(r.item) inside a keyed each. -->
                            <div class="g2-l">
                                {#key _tick}
                                {#each gRowsList as r (r.key)}
                                    {@const lvlBg = ['#eef2ff','#f0fdfa','#faf5ff','#fff7ed'][r.lvl]}
                                    {@const isAssignable = r.type !== 'phase' && r.isLeaf}
                                    {@const isStatusable = r.type !== 'phase' && r.isLeaf}
                                    {@const derivedStatus = effStatus(r.item)}
                                    <div class="g2-row" style="height:{G_ROW_H}px; background:{lvlBg}">
                                        <div class="g2-cell" style="width:200px; padding-left:{8 + r.lvl*14}px">
                                            {#if r.hasToggle}
                                                <button class="g2-tog" on:click={() => toggle(r.key)}>{exp[r.key]?'▾':'▸'}</button>
                                            {:else}
                                                <span class="g2-tog-spacer"></span>
                                            {/if}
                                            <span class="g2-wbs">{r.wbs}</span>
                                            {#if canEdit}
                                                <input class="g2-name-input" value={r.item.name||''}
                                                    on:change={e => updateRow(r,'name',e.target.value)}
                                                    placeholder="—" title={r.item.name||''} />
                                            {:else}
                                                <span class="g2-name truncate" title={r.item.name||''}>{r.item.name||'—'}</span>
                                            {/if}
                                        </div>
                                        <div class="g2-cell" style="width:120px">
                                            {#if isAssignable && canEdit}
                                                <select class="g2-inline-select"
                                                    value={r.item.assigned_to ?? ''}
                                                    on:change={e => updateRow(r,'assigned_to', e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}>
                                                    <option value="">—</option>
                                                    {#each users as u}<option value={u.id}>{u.full_name}</option>{/each}
                                                </select>
                                            {:else if isAssignable}
                                                <span class="truncate dm">{r.item.assignee_name || '—'}</span>
                                            {:else}
                                                <span class="dm">—</span>
                                            {/if}
                                        </div>
                                        <div class="g2-cell" style="width:110px">
                                            {#if isStatusable && canEdit}
                                                <select class="g2-inline-select"
                                                    value={r.item.status}
                                                    on:change={e => updateRow(r,'status', e.currentTarget.value)}>
                                                    {#each STS as s}<option>{s}</option>{/each}
                                                </select>
                                            {:else}
                                                <span class={sc(derivedStatus)} style="font-size:10px">{derivedStatus}</span>
                                            {/if}
                                        </div>
                                        <div class="g2-cell" style="width:65px">{fmt(rowPlanStart(r))}</div>
                                        <div class="g2-cell" style="width:65px">{fmt(rowPlanEnd(r))}</div>
                                    </div>
                                {/each}
                                {/key}
                            </div>
                            <!-- Right body: bars + grid -->
                            <div class="g2-r" style="width:{gDays.length * DAY_W}px; height:{gRowsList.length * G_ROW_H}px">
                            <!-- Weekend column shading -->
                            {#each gDays as d, di}
                                {#if d.weekend}
                                    <div class="g2-weekend-col" style="left:{di*DAY_W}px; width:{DAY_W}px"></div>
                                {/if}
                            {/each}
                            <!-- Day grid lines -->
                            {#each gDays as d, di}
                                <div class="g2-grid-line" style="left:{di*DAY_W}px"></div>
                            {/each}
                            <!-- Horizontal row separators (match the left pane's row borders) -->
                            {#each gRowsList as r, ri (r.key)}
                                <div class="g2-row-line" style="top:{(ri+1)*G_ROW_H - 1}px"></div>
                            {/each}
                            <!-- Today line -->
                            {#if todayIdx >= 0 && todayIdx < gDays.length}
                                <div class="g2-today-line" style="left:{todayIdx*DAY_W + DAY_W/2}px"></div>
                            {/if}
                            <!-- Bars: wrapped in {#key _tick} so the entire bar tree is rebuilt
                                 after every drag mutation. Svelte 5 legacy mode doesn't deeply
                                 track r.item.planned_start through rowPlanStart(r) inside a
                                 keyed each, so without this the {@const}s stay cached and the
                                 bar doesn't move. Cheap enough: bars are simple absolute divs. -->
                            {#key _tick}
                            {#each gRowsList as r, ri (r.key)}
                                {@const ps = rowPlanStart(r)}
                                {@const pe = rowPlanEnd(r)}
                                {@const as = rowActStart(r)}
                                {@const ae = rowActEnd(r)}
                                <div class="g2-bar-row" class:leaf={r.isLeaf}
                                    style:top="{ri*G_ROW_H}px" style:height="{G_ROW_H}px"
                                    on:pointerdown={e => onGanttRowDown(e, r)}>
                                    {#if ps && pe}
                                        {@const psd = dayDiff(gRange.start, ps)}
                                        {@const ped = dayDiff(gRange.start, pe)}
                                        <div class="g2-bar g2-plan" class:locked={!r.isLeaf}
                                            style:left="{psd*DAY_W}px"
                                            style:width="{(ped-psd+1)*DAY_W}px"
                                            style:top="{r.isLeaf ? 4 : (G_ROW_H-G_BAR_H)/2}px"
                                            style:height="{G_BAR_H}px"
                                            title="Plan {fmt(ps)} → {fmt(pe)}">
                                            {#if r.isLeaf}
                                                <span class="g2-handle g2-handle-l"></span>
                                                <span class="g2-handle g2-handle-r"></span>
                                            {/if}
                                            <span class="g2-bar-label">{r.item.name||''}</span>
                                        </div>
                                    {/if}
                                    {#if r.isLeaf && as && ae}
                                        {@const asd = dayDiff(gRange.start, as)}
                                        {@const aed = dayDiff(gRange.start, ae)}
                                        <div class="g2-bar g2-act"
                                            style:left="{asd*DAY_W}px"
                                            style:width="{(aed-asd+1)*DAY_W}px"
                                            style:top="{G_ROW_H/2 + 2}px"
                                            style:height="{G_BAR_H}px"
                                            title="Actual {fmt(as)} → {fmt(ae)}">
                                            <span class="g2-handle g2-handle-l"></span>
                                            <span class="g2-handle g2-handle-r"></span>
                                        </div>
                                    {/if}
                                    {#if dragG && dragG.mode === 'draw' && dragG.row.key === r.key}
                                        {@const a = Math.min(dragG.startDay, dragG.endDay)}
                                        {@const b = Math.max(dragG.startDay, dragG.endDay)}
                                        <div class="g2-draw-preview" class:act={dragG.kind === 'act'}
                                            style:left="{a*DAY_W}px"
                                            style:width="{(b-a+1)*DAY_W}px"
                                            style:top="{dragG.kind === 'act' ? G_ROW_H/2 + 2 : 4}px"
                                            style:height="{G_BAR_H}px"></div>
                                    {/if}
                                </div>
                            {/each}
                            {/key}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    </div>
{/if}

{#if panel}
    {@const item = panel.item}
    {@const ptype = panel.type}
    {@const showCheck = ptype !== 'phase'}
    {@const typeLabel = ptype.replace(/_/g, '-')}
    {@const inputKey = 'panel-' + item.id}
    <div class="drawer-overlay" on:click={() => panel=null}></div>
    <div class="drawer">
        <div class="drawer-header">
            <div style="flex:1; min-width:0">
                <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; font-weight:600">{typeLabel} details</div>
                <h2 style="font-size:16px; font-weight:700; margin-top:4px; word-break:break-word">{item.name || '—'}</h2>
            </div>
            <button class="btn btn-ghost btn-icon" on:click={() => panel=null}>✕</button>
        </div>
        <div class="drawer-body">
            <div class="form-group">
                <label class="label">Notes <span style="font-weight:400; color:var(--text-light); font-size:11px">— paste URLs and they'll show as clickable chips below</span></label>
                <textarea class="input textarea" style="min-height:120px" bind:value={panelNotes} on:change={e => panelUpdate('notes', e.target.value)} placeholder="Notes, context, links — paste any https://... here"></textarea>
                {#if extractLinks(panelNotes).length}
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px">
                        {#each extractLinks(panelNotes) as url (url)}
                            <a href={linkHref(url)} target="_blank" rel="noopener" class="link-chip" title={url}>🔗 {shortUrl(url)}</a>
                        {/each}
                    </div>
                {/if}
            </div>

            {#if showCheck}
                <div class="form-group">
                    <label class="label">Checklist ({(item.checklist||[]).filter(c=>c.is_checked).length}/{(item.checklist||[]).length})</label>
                    {#if (item.checklist||[]).length === 0}
                        <div style="font-size:12px; color:var(--text-light); padding:4px 0 8px">No items yet.</div>
                    {/if}
                    {#each item.checklist||[] as ci, cidx (ci.id)}
                        <div class="flex items-center gap-2" style="padding:4px 0">
                            <input type="checkbox" checked={ci.is_checked} on:change={() => toggleCheck(ci)} style="cursor:pointer; accent-color:#eab308" />
                            <input class="check-edit" value={ci.title}
                                style="color:{ci.is_checked?'#94a3b8':'#334155'}; text-decoration:{ci.is_checked?'line-through':'none'}"
                                on:change={e => updateCheck(ci, e.target.value)} />
                            <button class="xb dl" on:click={() => deleteCheck(item, cidx)}>✕</button>
                        </div>
                    {/each}
                    <div class="flex gap-2" style="margin-top:8px">
                        <input class="input input-sm" style="flex:1" placeholder="Add item + Enter" bind:value={checkInputs[inputKey]} on:keydown={e => { if(e.key==='Enter') addCheckItem(item, ptype, checkInputs[inputKey], inputKey); }} />
                        <button class="btn btn-sm" style="background:#eab308; color:#fff" on:click={() => addCheckItem(item, ptype, checkInputs[inputKey], inputKey)}>Add</button>
                    </div>
                </div>
            {/if}

            <div class="form-group">
                <label class="label">Files</label>
                <div class="flex gap-2" style="margin-bottom:6px">
                    <input type="file" bind:this={fileInput} class="input" style="font-size:12px; flex:1" />
                    <button class="btn btn-primary btn-sm" on:click={uploadFile}>Upload</button>
                </div>
                {#if panel.attachments?.length}
                    <div style="margin-top:10px">
                        {#each panel.attachments as att (att.id)}
                            <div class="flex items-center gap-2" style="padding:6px 0; border-bottom:1px solid var(--border-light); font-size:12px">
                                {#if att.link_url}
                                    <span>🔗</span>
                                    <a href={att.link_url} target="_blank" rel="noopener" style="flex:1; font-weight:500; color:var(--primary, #4f46e5); word-break:break-all; text-decoration:none">{att.link_url}</a>
                                {:else}
                                    <span>📄</span>
                                    <a href="/api/projects/{projectId}/attachments/{att.id}" target="_blank" rel="noopener" style="flex:1; font-weight:500; color:var(--primary, #4f46e5); word-break:break-all; text-decoration:none">{att.file_name}</a>
                                    <span style="color:var(--text-muted)">{fmtSize(att.file_size)}</span>
                                {/if}
                                <button class="xb dl" on:click={() => deleteAttach(att.id)}>✕</button>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .wc-row { display:flex; justify-content:space-between; font-size:12px; padding:3px 0; color:var(--text-secondary); }
    .wc-lbl { color:var(--text-muted); }
    .wc-num { font-weight:600; }
    .ov-row { display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-light); font-size:13px; gap:8px; }
    .ov-lbl { color:var(--text-muted); white-space:nowrap; flex-shrink:0; }
    .ov-val { font-weight:500; }
    .no-spin::-webkit-inner-spin-button,
    .no-spin::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    .no-spin { -moz-appearance: textfield; appearance: textfield; }
    .ph { padding: 16px 24px; border-bottom: 1px solid var(--border); background: var(--bg-card); }
    /* overflow-x: hidden prevents .pc from being a horizontal scroller — the Gantt's
       inner .g2-scroll becomes the ONLY horizontal scroll context, so sticky-left actually pins. */
    .pc { flex: 1; min-width: 0; overflow-x: hidden; overflow-y: auto; padding: 24px; }
    .stats-grid { display: grid; gap: 12px; }
    .sl { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .sv { font-size: 28px; font-weight: 700; margin: 8px 0; }
    h3 { margin: 0; }
    .dm { color: var(--text-light); font-size: 11px; }
    .xb { background: none; border: none; cursor: pointer; padding: 3px 5px; border-radius: 4px; font-size: 13px; }
    .xb:hover { background: var(--bg-hover); }
    .dl { color: var(--danger); }
    .dl:hover { background: var(--danger-bg) !important; }
    .di { border: 1px solid var(--border); border-radius: 4px; padding: 2px 4px; font-size: 11px; outline: none; width: 100%; }
    .di:focus { border-color: var(--primary); }
    .ac { border-color: #bbf7d0; }
    .ii { border: none; outline: none; font-size: 13px; background: transparent; flex: 1; min-width: 60px; color: var(--text-primary); resize: none; overflow: hidden; line-height: 1.4; padding: 0; font-family: inherit; display: block; width: 100%; box-sizing: border-box; white-space: pre-wrap; word-break: break-word; }
    .ii:focus { border-bottom: 2px solid var(--primary); }
    /* Lark-style chip dropdowns: cell stays neutral, only the value-bubble is colored */
    .sel-status, .sel-priority {
        width: auto !important;
        min-width: 0;
        max-width: 100%;
        padding: 2px 22px 2px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.4;
        border: 1px solid;
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' stroke='%23475569' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
        background-repeat: no-repeat;
        background-position: right 6px center;
        background-size: 9px;
        cursor: pointer;
        transition: filter 0.15s;
    }
    .sel-status:hover, .sel-priority:hover { filter: brightness(0.96); }
    /* Native <option> rows pick up these inline styles in Chrome/Edge/Firefox; Safari falls back to default. */
    .sel-status.s-not-started { background-color:#f1f5f9; color:#475569; border-color:#cbd5e1; }
    .sel-status.s-in-progress { background-color:#dbeafe; color:#1e40af; border-color:#93c5fd; }
    .sel-status.s-completed { background-color:#dcfce7; color:#166534; border-color:#86efac; }
    .sel-status.s-on-hold { background-color:#fef3c7; color:#92400e; border-color:#fcd34d; }
    .sel-status.s-cancelled { background-color:#fee2e2; color:#991b1b; border-color:#fca5a5; }
    .sel-priority.p-low { background-color:#f1f5f9; color:#475569; border-color:#cbd5e1; }
    .sel-priority.p-medium { background-color:#dbeafe; color:#1e40af; border-color:#93c5fd; }
    .sel-priority.p-high { background-color:#fed7aa; color:#9a3412; border-color:#fdba74; }
    .sel-priority.p-critical { background-color:#fee2e2; color:#991b1b; border-color:#fca5a5; }
    .check-edit {
        flex: 1; font-size: 13px; padding: 2px 4px;
        border: 1px solid transparent; border-radius: 4px;
        background: transparent; outline: none;
    }
    .check-edit:hover { border-color: var(--border); }
    .check-edit:focus { border-color: var(--primary, #4f46e5); background: var(--bg-card, #fff); }
    .link-chip {
        display: inline-flex; align-items: center; gap: 4px;
        background: #eef2ff; color: #4f46e5;
        padding: 4px 10px; border-radius: 999px;
        font-size: 11px; font-weight: 500;
        text-decoration: none; border: 1px solid #c7d2fe;
        max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .link-chip:hover { background: #e0e7ff; }
    .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 100; }
    .drawer { position: fixed; top: 0; right: 0; width: 480px; max-width: 100vw; height: 100vh; background: var(--bg-card); z-index: 101; display: flex; flex-direction: column; box-shadow: -4px 0 16px rgba(0,0,0,0.12); animation: drawerIn 0.18s ease-out; }
    @keyframes drawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .drawer-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .drawer-body { flex: 1; overflow: auto; padding: 20px; }

    /* ─── Gantt 2 (daily, sticky pane, draggable bars) ─── */
    /* min-width:0 + overflow:hidden on the outer container prevents the wide grid inside
       from forcing the whole page to scroll horizontally. Without these, .pc became the
       horizontal scroller and sticky-left elements scrolled away with it. */
    .gantt2 { display: flex; flex-direction: column; gap: 8px; min-width: 0; max-width: 100%; overflow: hidden; }
    .g2-legend { display: flex; gap: 16px; align-items: center; padding: 8px 12px; font-size: 11px; color: var(--text-muted); background: var(--bg-hover); border-radius: 6px; flex-wrap: wrap; }
    .g2-leg-item { display: flex; align-items: center; gap: 6px; }
    .g2-leg-sw { width: 16px; height: 10px; border-radius: 3px; }
    .g2-leg-plan { background: #4f46e5; }
    .g2-leg-act { background: #10b981; }
    .g2-leg-weekend { background: #fee2e2; }
    .g2-leg-today { background: #ef4444; width: 2px; height: 12px; border-radius: 0; }
    .g2-leg-divider { width: 1px; height: 18px; background: var(--border); margin: 0 2px; }
    .g2-tool { display: inline-flex; align-items: center; gap: 4px; }
    .g2-tool-label { font-weight: 600; color: var(--text-secondary); font-size: 11px; margin-right: 2px; }
    .g2-tool-btn { background: #fff; border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; line-height: 1.4; color: var(--text-primary); }
    .g2-tool-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--primary); }
    .g2-tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .g2-tool-val { font-size: 11px; min-width: 32px; text-align: center; color: var(--text-secondary); }
    .g2-tool-date { font-size: 11px; padding: 2px 4px; border: 1px solid var(--border); border-radius: 4px; background: #fff; }
    .g2-tool-today { font-weight: 600; }
    .g2-leg-hint { margin-left: auto; color: var(--text-light); font-style: italic; }
    /* user-select: none was on .g2-scroll to suppress text selection during bar drag,
       but it can block native <select> dropdown interaction in some browsers. The drag
       handler calls e.preventDefault() already, which is enough. */
    .g2-scroll { overflow: auto; max-height: calc(100vh - 240px); width: 100%; min-width: 0; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
    /* Two flex rows (header + body) inside a width-set container. Sticky-left children
       (.g2-tl, .g2-l) live inside flex rows wider than themselves, so left:0 actually pins
       on horizontal scroll. A 2x2 CSS grid wouldn't work here because each grid item's
       containing block is its own cell — leaving zero room for sticky to offset. */
    .g2-grid { display: block; }
    .g2-header-row { display: flex; position: sticky; top: 0; z-index: 10; background: #f8fafc; border-bottom: 2px solid var(--border); }
    .g2-body-row { display: flex; }
    .g2-tl { position: sticky; left: 0; z-index: 1; flex-shrink: 0; width: 560px; display: flex; background: #f8fafc; border-right: 2px solid var(--border); }
    .g2-tr { flex-shrink: 0; background: #f8fafc; }
    .g2-l  { position: sticky; left: 0; z-index: 5; flex-shrink: 0; width: 560px; background: #fff; border-right: 2px solid var(--border); }
    .g2-r  { flex-shrink: 0; position: relative; }
    .g2-th { font-size: 11px; font-weight: 700; color: var(--text-secondary); padding: 8px 10px; border-right: 1px solid var(--border-light); display: flex; align-items: center; height: 44px; box-sizing: border-box; }
    .g2-months { display: flex; height: 22px; border-bottom: 1px solid var(--border-light); }
    .g2-month { font-size: 11px; font-weight: 700; color: var(--text-primary); padding: 0 8px; line-height: 22px; border-right: 1px solid var(--border); white-space: nowrap; overflow: hidden; }
    .g2-days { display: flex; height: 22px; }
    .g2-day { font-size: 10px; color: var(--text-muted); text-align: center; line-height: 22px; box-sizing: border-box; border-right: 1px solid var(--border-light); }
    .g2-day.weekend { background: #fee2e2; color: #b91c1c; font-weight: 600; }
    .g2-day.today { background: #fef2f2; color: #ef4444; font-weight: 700; }
    .g2-row { display: flex; align-items: center; border-bottom: 1px solid #cbd5e1; box-sizing: border-box; }
    /* overflow: visible (default) so native <select> dropdown popups can extend past
       the cell bounds. Text truncation is handled by the inner .truncate spans. */
    .g2-cell { padding: 0 8px; font-size: 12px; box-sizing: border-box; display: flex; align-items: center; gap: 6px; border-right: 1px solid var(--border-light); height: 100%; }
    .g2-tog { background: none; border: none; cursor: pointer; font-size: 11px; padding: 2px 4px; color: var(--text-secondary); }
    .g2-tog-spacer { display: inline-block; width: 18px; }
    .g2-wbs { font-size: 10px; color: var(--text-muted); font-family: monospace; flex-shrink: 0; }
    .g2-name { flex: 1; font-weight: 500; }
    .g2-name-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: 12px; font-weight: 500; color: var(--text-primary); padding: 2px 0; }
    .g2-name-input:focus { border-bottom: 2px solid var(--primary); }
    .g2-inline-select { position: relative; z-index: 1; width: 100%; max-width: 100%; font-size: 11px; padding: 3px 4px; border: 1px solid var(--border); border-radius: 4px; background: #fff; cursor: pointer; }
    .g2-inline-select:focus { outline: none; border-color: var(--primary); }
    /* Right body decorations */
    .g2-weekend-col { position: absolute; top: 0; bottom: 0; background: #fee2e2; opacity: 0.45; pointer-events: none; }
    .g2-grid-line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--border-light); pointer-events: none; }
    .g2-row-line  { position: absolute; left: 0; right: 0; height: 1px; background: #cbd5e1; pointer-events: none; z-index: 1; }
    .g2-today-line { position: absolute; top: 0; bottom: 0; width: 2px; background: #ef4444; z-index: 1; pointer-events: none; }
    .g2-bar-row { position: absolute; left: 0; right: 0; }
    .g2-bar-row.leaf { cursor: crosshair; }
    .g2-bar-row.leaf .g2-bar { cursor: grab; }
    .g2-bar-row.leaf .g2-bar:active { cursor: grabbing; }
    .g2-draw-preview { position: absolute; background: rgba(99,102,241,0.25); border: 2px dashed #4f46e5; border-radius: 4px; pointer-events: none; z-index: 3; }
    .g2-draw-preview.act { background: rgba(16,185,129,0.25); border-color: #059669; }
    .g2-bar { position: absolute; border-radius: 4px; display: flex; align-items: center; padding: 0 8px; font-size: 10px; font-weight: 600; color: #fff; cursor: grab; box-sizing: border-box; overflow: hidden; z-index: 2; }
    .g2-bar:active { cursor: grabbing; }
    .g2-plan { background: linear-gradient(180deg, #6366f1, #4f46e5); border: 1px solid #4338ca; box-shadow: 0 1px 3px rgba(79,70,229,0.3); }
    .g2-plan.locked { background: linear-gradient(180deg, #818cf8aa, #6366f1aa); border-style: dashed; cursor: default; }
    .g2-act { background: linear-gradient(180deg, #34d399, #10b981); border: 1px solid #059669; box-shadow: 0 1px 3px rgba(16,185,129,0.3); }
    .g2-bar-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; flex: 1; }
    .g2-handle { position: absolute; top: 0; bottom: 0; width: 6px; cursor: ew-resize; background: rgba(255,255,255,0.25); }
    .g2-handle-l { left: 0; border-radius: 4px 0 0 4px; }
    .g2-handle-r { right: 0; border-radius: 0 4px 4px 0; }
    .g2-handle:hover { background: rgba(255,255,255,0.5); }
</style>
