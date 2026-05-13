<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    export let data;
    $: user = data.user;

    let projects = [];
    let loading = true;
    let users = [];
    // Unified modal state: null when closed, otherwise { mode: 'create'|'edit', form, id? }
    let modal = null;

    onMount(async () => {
        await loadProjects();
        const uRes = await fetch('/api/users');
        if (uRes.ok) users = await uRes.json();
    });

    async function loadProjects() {
        loading = true;
        const res = await fetch('/api/projects');
        if (res.ok) projects = await res.json();
        loading = false;
    }

    // MySQL DATE/TIMESTAMP comes back as ISO; <input type="date"> wants yyyy-mm-dd.
    function toInputDate(d) {
        if (!d) return '';
        const s = String(d);
        return s.length >= 10 ? s.slice(0, 10) : '';
    }

    function openCreate() {
        modal = {
            mode: 'create',
            form: {
                name: '', description: '', category: 'Web Application',
                company: '', department: '', manager_id: '',
                planned_start: '', planned_end: '', template_id: '1', notes: ''
            }
        };
    }

    function openEdit(p) {
        modal = {
            mode: 'edit',
            id: p.id,
            form: {
                name: p.name || '',
                description: p.description || '',
                category: p.category || 'Other',
                company: p.company || '',
                department: p.department || '',
                manager_id: p.manager_id || '',
                planned_start: toInputDate(p.planned_start),
                planned_end: toInputDate(p.planned_end),
                status: p.status || 'Not Started',
                health: p.health || 'On Track',
                notes: p.notes || ''
            }
        };
    }

    async function submitModal() {
        if (!modal) return;
        if (modal.mode === 'create') {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...modal.form, manager_id: modal.form.manager_id || user.id })
            });
            if (res.ok) {
                const proj = await res.json();
                modal = null;
                goto(`/projects/${proj.id}`);
            }
        } else {
            const id = modal.id;
            const res = await fetch(`/api/projects/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modal.form)
            });
            if (res.ok) {
                modal = null;
                await loadProjects();
            }
        }
    }

    async function deleteProject(p) {
        if (!confirm(`Delete project "${p.name}"? This will remove all phases, tasks, and attachments — this cannot be undone.`)) return;
        const res = await fetch(`/api/projects/${p.id}`, { method: 'DELETE' });
        if (res.ok) await loadProjects();
        else alert('Failed to delete project.');
    }

    $: canCreate = user?.role === 'admin' || user?.role === 'project_manager';
    $: canEdit = user?.role === 'admin' || user?.role === 'project_manager';
    $: canDelete = user?.role === 'admin';
    const categories = ['Web Application', 'Mobile App', 'Infrastructure', 'ERP/System Integration', 'Data & Analytics', 'Security', 'Other'];
    const statuses = ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Cancelled'];
    const healths = ['On Track', 'At Risk', 'Off Track'];

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
    const fmtDateFull = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    const statusClass = (s) => `badge badge-${s?.toLowerCase().replace(/\s/g, '-')}`;
    const healthClass = (h) => `badge badge-${h?.toLowerCase().replace(/\s/g, '-')}`;

    const progressColor = (v) => v >= 100 ? '#22c55e' : v >= 60 ? '#3b82f6' : v >= 30 ? '#f59e0b' : '#94a3b8';
</script>

<div class="page">
    <div class="page-header">
        <div>
            <h1>IT Projects</h1>
            <p class="text-muted">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        {#if canCreate}
            <button class="btn btn-primary" on:click={openCreate}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New Project
            </button>
        {/if}
    </div>

    {#if loading}
        <div class="loading">Loading projects...</div>
    {:else}
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Project</th>
                        <th>Company</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Health</th>
                        <th>Manager</th>
                        <th style="min-width:130px">Progress</th>
                        <th>Timeline</th>
                        {#if canEdit || canDelete}<th style="width:80px; text-align:center">Actions</th>{/if}
                    </tr>
                </thead>
                <tbody>
                    {#each projects as p}
                        <tr on:click={() => goto(`/projects/${p.id}`)} style="cursor:pointer">
                            <td>
                                <div style="font-weight:600">{p.name}</div>
                                <div style="font-size:11px; color:var(--text-muted)">{p.project_code}</div>
                            </td>
                            <td>{p.company || '—'}</td>
                            <td style="font-size:12px; color:var(--text-secondary)">{p.category}</td>
                            <td><span class={statusClass(p.status)}>{p.status}</span></td>
                            <td><span class={healthClass(p.health)}>{p.health}</span></td>
                            <td>{p.manager_name || '—'}</td>
                            <td>
                                <div class="progress-bar">
                                    <div class="progress-bar-track">
                                        <div class="progress-bar-fill" style="width:{Math.min(100, p.progress || 0)}%; background:{progressColor(p.progress)}"></div>
                                    </div>
                                    <span class="progress-bar-label">{Math.round(p.progress || 0)}%</span>
                                </div>
                            </td>
                            <td style="font-size:11px; color:var(--text-muted); white-space:nowrap">
                                {fmtDate(p.planned_start)} → {fmtDateFull(p.planned_end)}
                            </td>
                            {#if canEdit || canDelete}
                                <td style="text-align:center; white-space:nowrap">
                                    {#if canEdit}
                                        <button class="row-act" title="Edit" on:click|stopPropagation={() => openEdit(p)}>✏️</button>
                                    {/if}
                                    {#if canDelete}
                                        <button class="row-act dl" title="Delete" on:click|stopPropagation={() => deleteProject(p)}>🗑️</button>
                                    {/if}
                                </td>
                            {/if}
                        </tr>
                    {/each}
                    {#if projects.length === 0}
                        <tr>
                            <td colspan={canEdit || canDelete ? 9 : 8} style="text-align:center; padding:40px; color:var(--text-muted)">
                                No projects yet. {canCreate ? 'Create your first project!' : 'Ask your project manager to assign you.'}
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    {/if}
</div>

<!-- Create / Edit Project Modal -->
{#if modal}
    {@const isCreate = modal.mode === 'create'}
    <div class="modal-overlay" on:click={() => modal = null}>
        <div class="modal" on:click|stopPropagation>
            <div class="modal-header">
                <h2>{isCreate ? 'Create New Project' : 'Edit Project'}</h2>
                <button class="btn btn-ghost btn-icon" on:click={() => modal = null}>✕</button>
            </div>
            <div class="modal-body">
                <form on:submit|preventDefault={submitModal}>
                    <div class="form-group">
                        <label class="label">Project Name *</label>
                        <input class="input" bind:value={modal.form.name} placeholder="e.g. ERP Enhancement Phase 2" required />
                    </div>
                    <div class="form-group">
                        <label class="label">Description</label>
                        <textarea class="input textarea" bind:value={modal.form.description} placeholder="Brief project description..."></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="label">Category</label>
                            <select class="input select" bind:value={modal.form.category}>
                                {#each categories as c}<option>{c}</option>{/each}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="label">Company</label>
                            <input class="input" bind:value={modal.form.company} placeholder="Company name" />
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="label">Department</label>
                            <input class="input" bind:value={modal.form.department} placeholder="e.g. IT, Finance" />
                        </div>
                        <div class="form-group">
                            <label class="label">Project Manager</label>
                            <select class="input select" bind:value={modal.form.manager_id}>
                                <option value="">— Select —</option>
                                {#each users.filter(u => u.role !== 'staff') as u}
                                    <option value={u.id}>{u.full_name}</option>
                                {/each}
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="label">Planned Start</label>
                            <input type="date" class="input" bind:value={modal.form.planned_start} />
                        </div>
                        <div class="form-group">
                            <label class="label">Planned End</label>
                            <input type="date" class="input" bind:value={modal.form.planned_end} />
                        </div>
                    </div>
                    {#if !isCreate}
                        <div class="form-row">
                            <div class="form-group">
                                <label class="label">Status</label>
                                <select class="input select" bind:value={modal.form.status}>
                                    {#each statuses as s}<option>{s}</option>{/each}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="label">Health</label>
                                <select class="input select" bind:value={modal.form.health}>
                                    {#each healths as h}<option>{h}</option>{/each}
                                </select>
                            </div>
                        </div>
                    {/if}
                    {#if isCreate}
                        <div class="form-group" style="border-top:1px solid var(--border-light); padding-top:16px">
                            <label class="label">Phase Template</label>
                            <select class="input select" bind:value={modal.form.template_id}>
                                <option value="1">Standard IT Project</option>
                                <option value="2">Agile Sprint</option>
                                <option value="3">Infrastructure / Migration</option>
                                <option value="">Custom (Empty)</option>
                            </select>
                        </div>
                    {/if}
                    <div class="form-group">
                        <label class="label">Notes</label>
                        <textarea class="input textarea" bind:value={modal.form.notes} placeholder="Any additional notes..."></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary btn-lg w-full">{isCreate ? 'Create Project' : 'Save Changes'}</button>
                </form>
            </div>
        </div>
    </div>
{/if}

<style>
    .page { padding: 24px; }
    .page-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px;
    }
    h1 { font-size: 22px; font-weight: 700; }
    h2 { font-size: 20px; font-weight: 700; }
    .text-muted { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
    .loading { text-align: center; padding: 60px; color: var(--text-muted); }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .w-full { width: 100%; justify-content: center; }
    .row-act { background: none; border: none; cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 14px; line-height: 1; }
    .row-act:hover { background: var(--bg-hover); }
    .row-act.dl:hover { background: var(--danger-bg); }
</style>
