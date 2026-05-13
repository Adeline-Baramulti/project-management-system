<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { goto } from '$app/navigation';

    export let data;
    $: user = data.user;

    let items = [];
    let summary = {};
    let loading = true;
    let filterStatus = 'all';
    let selectedItem = null;          // the item currently shown in the detail modal
    let newChecklistInput = '';
    let fileInput;                    // ref to <input type="file"> inside the modal
    let uploading = false;

    onMount(() => loadTasks());

    async function loadTasks() {
        loading = true;
        const params = new URLSearchParams();
        if (filterStatus !== 'all') params.set('status', filterStatus);
        const res = await fetch(`/api/my-tasks?${params}`);
        if (res.ok) {
            const data = await res.json();
            items = data.items;
            summary = data.summary;
            // If a modal is open, refresh its data from the new list
            if (selectedItem) {
                const fresh = items.find(i => i.item_type === selectedItem.item_type && i.id === selectedItem.id);
                if (fresh) selectedItem = fresh;
            }
        }
        loading = false;
    }

    async function patchItem(item, fields) {
        await fetch(`/api/projects/${item.project_id}/wbs`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: item.item_type, item_id: item.id, ...fields })
        });
    }

    // Inline status change from card — fire-and-update.
    async function updateStatus(item, newStatus) {
        await patchItem(item, { status: newStatus });
        await loadTasks();
    }

    // Modal edits — optimistic local update + background API call.
    async function updateField(field, value) {
        if (!selectedItem) return;
        selectedItem[field] = value === '' ? null : value;
        selectedItem = { ...selectedItem };
        await patchItem(selectedItem, { [field]: selectedItem[field] });
        // Mirror change into the list so summary cards stay accurate
        const i = items.findIndex(x => x.item_type === selectedItem.item_type && x.id === selectedItem.id);
        if (i >= 0) { items[i] = selectedItem; items = [...items]; }
    }

    // Checklist add/toggle/delete — uses the same /wbs endpoint.
    async function addChecklistItem() {
        const title = newChecklistInput.trim();
        if (!title || !selectedItem) return;
        const r = await fetch(`/api/projects/${selectedItem.project_id}/wbs`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'checklist',
                parent_id: selectedItem.id,
                checklist_parent_type: selectedItem.item_type,
                name: title
            })
        });
        if (r.ok) {
            const res = await r.json();
            selectedItem.checklist = [...(selectedItem.checklist || []), {
                id: res.id, entity_type: selectedItem.item_type, entity_id: selectedItem.id,
                title, is_checked: false, sort_order: (selectedItem.checklist || []).length
            }];
            selectedItem = { ...selectedItem };
            newChecklistInput = '';
        }
    }
    async function toggleChecklistItem(ci) {
        ci.is_checked = !ci.is_checked;
        selectedItem = { ...selectedItem };
        await fetch(`/api/projects/${selectedItem.project_id}/wbs`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'checklist', item_id: ci.id, is_checked: ci.is_checked })
        });
    }
    async function deleteChecklistItem(ci) {
        selectedItem.checklist = selectedItem.checklist.filter(x => x.id !== ci.id);
        selectedItem = { ...selectedItem };
        await fetch(`/api/projects/${selectedItem.project_id}/wbs`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'checklist', item_id: ci.id })
        });
    }

    // Attachment upload/delete — same /attachments endpoint as the project page.
    async function uploadAttachment() {
        if (!fileInput?.files?.length || !selectedItem || uploading) return;
        uploading = true;
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        fd.append('entity_type', selectedItem.item_type);
        fd.append('entity_id', selectedItem.id);
        const r = await fetch(`/api/projects/${selectedItem.project_id}/attachments`, {
            method: 'POST', body: fd
        });
        if (r.ok) {
            const att = await r.json();
            selectedItem.attachments = [att, ...(selectedItem.attachments || [])];
            selectedItem = { ...selectedItem };
            fileInput.value = '';
        }
        uploading = false;
    }
    async function deleteAttachment(att) {
        if (!confirm(`Delete "${att.file_name}"?`)) return;
        await fetch(`/api/projects/${selectedItem.project_id}/attachments`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachment_id: att.id })
        });
        selectedItem.attachments = selectedItem.attachments.filter(a => a.id !== att.id);
        selectedItem = { ...selectedItem };
    }
    function fmtFileSize(b) {
        if (!b) return '';
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
        return (b/1048576).toFixed(1) + ' MB';
    }

    function openItem(item) { selectedItem = item; newChecklistInput = ''; }
    function closeItem() { selectedItem = null; }
    function openInProject() {
        if (selectedItem) goto(`/projects/${selectedItem.project_id}`);
    }
    function onModalBg(e) { if (e.target === e.currentTarget) closeItem(); }
    function onModalKey(e) { if (e.key === 'Escape') closeItem(); }

    // Guard with `browser` because $: blocks run once during SSR too — without it,
    // loadTasks() fires server-side and crashes on the relative-URL fetch.
    $: if (browser) { filterStatus; loadTasks(); }

    const STATUSES = ['Not Started','In Progress','Completed','On Hold','Cancelled'];
    const PRIORITIES = ['Low','Medium','High','Critical','Urgent'];
    const statusClass = (s) => `badge badge-${s?.toLowerCase().replace(/\s/g, '-')}`;
    const priorityClass = (p) => `badge badge-${p?.toLowerCase()}`;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
    const toDateInput = (d) => { if (!d) return ''; const s = String(d); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0,10) : ''; };
    const isOverdue = (item) => item.planned_end && new Date(item.planned_end) < new Date() && item.status !== 'Completed';
    const typeLabel = (t) => ({ task: 'Task', sub_task: 'Sub-task', sub_sub_task: 'Sub-sub-task' })[t] || t;
</script>

<svelte:window on:keydown={onModalKey} />

<div class="page">
    <div class="page-header">
        <div>
            <h1>My Tasks</h1>
            <p class="text-muted">Tasks assigned to you across all projects</p>
        </div>
    </div>

    <!-- Summary Cards -->
    <div class="summary-cards">
        <div class="summary-card">
            <div class="summary-number">{summary.total || 0}</div>
            <div class="summary-label">Total</div>
        </div>
        <div class="summary-card" on:click={() => filterStatus = filterStatus === 'In Progress' ? 'all' : 'In Progress'}>
            <div class="summary-number" style="color:var(--info-text)">{summary.in_progress || 0}</div>
            <div class="summary-label">In Progress</div>
        </div>
        <div class="summary-card" on:click={() => filterStatus = filterStatus === 'Not Started' ? 'all' : 'Not Started'}>
            <div class="summary-number" style="color:var(--text-muted)">{summary.not_started || 0}</div>
            <div class="summary-label">Not Started</div>
        </div>
        <div class="summary-card">
            <div class="summary-number" style="color:var(--success-text)">{summary.completed || 0}</div>
            <div class="summary-label">Completed</div>
        </div>
        <div class="summary-card">
            <div class="summary-number" style="color:var(--danger-text)">{summary.overdue || 0}</div>
            <div class="summary-label">Overdue</div>
        </div>
    </div>

    <!-- Filter -->
    <div class="filter-bar">
        <select class="input select" style="width:160px" bind:value={filterStatus}>
            <option value="all">All Status</option>
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Completed</option>
            <option>On Hold</option>
        </select>
    </div>

    <!-- Task List -->
    {#if loading}
        <div class="loading">Loading tasks...</div>
    {:else if items.length === 0}
        <div class="empty">
            <div style="font-size:40px; margin-bottom:12px">📋</div>
            <div style="font-weight:600">No tasks assigned to you</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px">
                {filterStatus !== 'all' ? 'Try changing the filter.' : 'When a project manager assigns tasks to you, they will appear here.'}
            </div>
        </div>
    {:else}
        <div class="task-list">
            {#each items as item}
                {@const cl = item.checklist || []}
                {@const clDone = cl.filter(c => c.is_checked).length}
                <div class="task-card" class:overdue={isOverdue(item)} on:click={() => openItem(item)} role="button" tabindex="0"
                     on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openItem(item)}>
                    <div class="task-main">
                        <div class="task-header">
                            <span class="task-type-badge">{typeLabel(item.item_type)}</span>
                            <span class="task-project">{item.project_code} · {item.project_name}</span>
                        </div>
                        <div class="task-name">{item.name}</div>
                        <div class="task-path">{item.phase_name}{item.parent_task_name ? ` → ${item.parent_task_name}` : ''}{item.parent_sub_task_name ? ` → ${item.parent_sub_task_name}` : ''}</div>
                        {#if cl.length > 0}
                            <div class="task-checklist-summary">☑ {clDone}/{cl.length} subtasks done</div>
                        {/if}
                        {#if item.notes}
                            <div class="task-notes">{item.notes}</div>
                        {/if}
                    </div>
                    <div class="task-meta" on:click|stopPropagation role="presentation">
                        <span class={priorityClass(item.priority)}>{item.priority}</span>
                        <span class={statusClass(item.status)}>{item.status}</span>
                        <div class="task-date" class:overdue-date={isOverdue(item)}>
                            {#if item.planned_end}
                                Due: {fmtDate(item.planned_end)}
                            {:else}
                                No date
                            {/if}
                        </div>
                        <select class="input input-sm" style="width:120px" value={item.status}
                                on:change={(e) => updateStatus(item, e.target.value)}>
                            {#each STATUSES as s}<option>{s}</option>{/each}
                        </select>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- ─────────── DETAIL MODAL ─────────── -->
{#if selectedItem}
    <div class="modal-bg" on:click={onModalBg} role="presentation">
        <div class="modal" role="dialog" aria-modal="true">
            <div class="modal-header">
                <div style="flex:1; min-width:0">
                    <div class="modal-crumb">{selectedItem.project_code} · {selectedItem.project_name}</div>
                    <div class="modal-crumb">{selectedItem.phase_name}{selectedItem.parent_task_name ? ` → ${selectedItem.parent_task_name}` : ''}{selectedItem.parent_sub_task_name ? ` → ${selectedItem.parent_sub_task_name}` : ''}</div>
                </div>
                <button class="modal-link" on:click={openInProject} title="Open in project view">↗ Open in project</button>
                <button class="modal-close" on:click={closeItem} aria-label="Close">✕</button>
            </div>

            <div class="modal-body">
                <input class="modal-title" placeholder="Task name" value={selectedItem.name || ''}
                       on:change={(e) => updateField('name', e.target.value)} />

                <div class="modal-grid">
                    <div class="field"><label>Status</label>
                        <select class="input input-sm" value={selectedItem.status} on:change={e => updateField('status', e.target.value)}>
                            {#each STATUSES as s}<option>{s}</option>{/each}
                        </select>
                    </div>
                    <div class="field"><label>Priority</label>
                        <select class="input input-sm" value={selectedItem.priority || ''} on:change={e => updateField('priority', e.target.value)}>
                            <option value="">—</option>
                            {#each PRIORITIES as p}<option>{p}</option>{/each}
                        </select>
                    </div>
                    {#if selectedItem.planned_start !== undefined}
                        <div class="field"><label>Planned start</label>
                            <input type="date" class="input input-sm" value={toDateInput(selectedItem.planned_start)} on:change={e => updateField('planned_start', e.target.value)} />
                        </div>
                        <div class="field"><label>Planned end</label>
                            <input type="date" class="input input-sm" value={toDateInput(selectedItem.planned_end)} on:change={e => updateField('planned_end', e.target.value)} />
                        </div>
                        <div class="field"><label>Actual start</label>
                            <input type="date" class="input input-sm ac" value={toDateInput(selectedItem.actual_start)} on:change={e => updateField('actual_start', e.target.value)} />
                        </div>
                        <div class="field"><label>Actual end</label>
                            <input type="date" class="input input-sm ac" value={toDateInput(selectedItem.actual_end)} on:change={e => updateField('actual_end', e.target.value)} />
                        </div>
                    {/if}
                </div>

                <div class="field" style="margin-top:12px">
                    <label>Notes</label>
                    <textarea class="input" rows="3" placeholder="Add a quick note..."
                              value={selectedItem.notes || ''}
                              on:change={e => updateField('notes', e.target.value)}></textarea>
                </div>

                <div class="field" style="margin-top:12px">
                    <label>Checklist <span style="color:var(--text-muted); font-weight:400">— small steps to get this done</span></label>
                    <div class="checklist-box">
                        {#each selectedItem.checklist || [] as ci (ci.id)}
                            <div class="cl-row" class:done={ci.is_checked}>
                                <input type="checkbox" checked={ci.is_checked} on:change={() => toggleChecklistItem(ci)} />
                                <span style="flex:1">{ci.title}</span>
                                <button class="xb dl" title="Delete" on:click={() => deleteChecklistItem(ci)}>✕</button>
                            </div>
                        {/each}
                        <form on:submit|preventDefault={addChecklistItem} class="cl-add">
                            <input class="input input-sm" placeholder="Add a checklist item..." bind:value={newChecklistInput} />
                            <button class="btn btn-primary btn-sm" type="submit" disabled={!newChecklistInput.trim()}>＋</button>
                        </form>
                    </div>
                </div>

                <div class="field" style="margin-top:12px">
                    <label>Attachments
                        <span style="color:var(--text-muted); font-weight:400">— files uploaded to this {typeLabel(selectedItem.item_type).toLowerCase()}</span>
                    </label>
                    <div class="attach-box">
                        {#if !selectedItem.attachments || selectedItem.attachments.length === 0}
                            <div class="attach-empty">No files attached yet.</div>
                        {:else}
                            {#each selectedItem.attachments as att (att.id)}
                                <div class="att-row">
                                    <span class="att-icon">📎</span>
                                    <a href="/api/projects/{selectedItem.project_id}/attachments/{att.id}"
                                       target="_blank" rel="noopener" class="att-name" title={att.file_name}>{att.file_name}</a>
                                    <span class="att-meta">{fmtFileSize(att.file_size)}</span>
                                    <span class="att-meta">· {att.uploaded_by_name}</span>
                                    <button class="xb dl" title="Delete" on:click={() => deleteAttachment(att)}>✕</button>
                                </div>
                            {/each}
                        {/if}
                        <div class="att-upload">
                            <input type="file" bind:this={fileInput} on:change={uploadAttachment} disabled={uploading} />
                            {#if uploading}<span style="font-size:11px; color:var(--text-muted)">Uploading…</span>{/if}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .page { padding: 24px; }
    .page-header { margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; }
    .text-muted { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
    .loading, .empty { text-align: center; padding: 60px; color: var(--text-muted); }

    .summary-cards {
        display: grid; grid-template-columns: repeat(5, 1fr);
        gap: 12px; margin-bottom: 20px;
    }
    .summary-card {
        background: var(--bg-card); border-radius: var(--radius-lg);
        border: 1px solid var(--border); padding: 16px; text-align: center;
        cursor: pointer; transition: box-shadow 0.15s;
    }
    .summary-card:hover { box-shadow: var(--shadow); }
    .summary-number { font-size: 28px; font-weight: 700; }
    .summary-label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }

    .filter-bar { margin-bottom: 16px; }

    .task-list { display: flex; flex-direction: column; gap: 8px; }
    .task-card {
        background: var(--bg-card); border-radius: var(--radius);
        border: 1px solid var(--border); padding: 16px;
        display: flex; justify-content: space-between; align-items: center;
        gap: 16px; transition: box-shadow 0.15s;
    }
    .task-card:hover { box-shadow: var(--shadow); }
    .task-card.overdue { border-left: 3px solid var(--danger); }

    .task-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .task-type-badge {
        font-size: 9px; font-weight: 700; padding: 1px 6px;
        border-radius: 4px; background: var(--primary-light); color: var(--primary);
        text-transform: uppercase;
    }
    .task-project { font-size: 11px; color: var(--text-muted); }
    .task-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .task-path { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .task-notes { font-size: 12px; color: var(--text-secondary); margin-top: 4px; font-style: italic; }

    .task-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .task-date { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
    .overdue-date { color: var(--danger-text); font-weight: 600; }
    .task-card { cursor: pointer; }
    .task-card:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
    .task-checklist-summary { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

    /* ─── Detail modal ─── */
    .modal-bg {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, 0.55);
        display: flex; justify-content: center; align-items: flex-start;
        padding: 60px 16px 16px;
        z-index: 100;
        overflow-y: auto;
    }
    .modal {
        background: var(--bg-card);
        border-radius: 12px;
        width: 100%;
        max-width: 640px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        display: flex; flex-direction: column;
        max-height: calc(100vh - 80px);
    }
    .modal-header {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 14px 18px; border-bottom: 1px solid var(--border);
    }
    .modal-crumb { font-size: 11px; color: var(--text-muted); }
    .modal-crumb + .modal-crumb { margin-top: 2px; }
    .modal-link {
        background: transparent; border: 1px solid var(--border);
        color: var(--text-secondary); border-radius: 6px;
        padding: 4px 10px; font-size: 11px; cursor: pointer;
        white-space: nowrap;
    }
    .modal-link:hover { background: var(--bg-hover); color: var(--primary); }
    .modal-close {
        background: transparent; border: none; color: var(--text-muted);
        font-size: 18px; cursor: pointer; width: 28px; height: 28px;
        border-radius: 6px;
    }
    .modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
    .modal-body { padding: 16px 18px; overflow-y: auto; }
    .modal-title {
        width: 100%; border: 1px solid transparent;
        font-size: 18px; font-weight: 700; padding: 6px 8px;
        margin-bottom: 14px; background: transparent;
        border-radius: 6px; color: var(--text-primary);
    }
    .modal-title:hover, .modal-title:focus {
        border-color: var(--border); background: var(--bg-card);
        outline: none;
    }
    .modal-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px;
    }
    .field label {
        display: block; font-size: 11px; font-weight: 600;
        color: var(--text-muted); margin-bottom: 4px;
        text-transform: uppercase; letter-spacing: 0.3px;
    }
    .field .ac { background-color: #f0fdf4; }

    .checklist-box {
        border: 1px solid var(--border); border-radius: 8px;
        padding: 6px;
    }
    .cl-row {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; border-radius: 4px; font-size: 13px;
    }
    .cl-row:hover { background: var(--bg-hover); }
    .cl-row.done { color: var(--text-muted); text-decoration: line-through; }
    .cl-row input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; }
    .cl-add {
        display: flex; gap: 6px;
        padding: 6px 8px; border-top: 1px solid var(--border); margin-top: 4px;
    }
    .cl-add .input { flex: 1; }
    .xb {
        background: transparent; border: none; cursor: pointer;
        color: var(--text-muted); font-size: 14px; padding: 2px 6px;
        border-radius: 4px;
    }
    .xb:hover { background: var(--bg-hover); }
    .xb.dl:hover { background: var(--danger-bg); color: var(--danger-text); }

    .attach-box {
        border: 1px solid var(--border); border-radius: 8px;
        padding: 6px;
    }
    .attach-empty { padding: 8px 10px; font-size: 12px; color: var(--text-muted); }
    .att-row {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; border-radius: 4px; font-size: 12px;
    }
    .att-row:hover { background: var(--bg-hover); }
    .att-icon { flex-shrink: 0; }
    .att-name {
        flex: 1; min-width: 0; color: var(--primary, #4f46e5);
        text-decoration: none; font-weight: 500;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .att-name:hover { text-decoration: underline; }
    .att-meta { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
    .att-upload {
        padding: 8px; border-top: 1px solid var(--border); margin-top: 4px;
        display: flex; align-items: center; gap: 10px;
    }
    .att-upload input[type="file"] { font-size: 12px; }
</style>
