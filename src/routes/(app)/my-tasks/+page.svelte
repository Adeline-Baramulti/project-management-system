<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';

    export let data;
    $: user = data.user;

    let items = [];
    let summary = {};
    let loading = true;
    let filterStatus = 'all';
    let selectedItem = null;

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
        }
        loading = false;
    }

    async function updateStatus(item, newStatus) {
        await fetch(`/api/projects/${item.project_id}/wbs`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: item.item_type, item_id: item.id, status: newStatus })
        });
        await loadTasks();
    }

    // Guard with `browser` because $: blocks run once during SSR too — without it,
    // loadTasks() fires server-side and crashes on the relative-URL fetch.
    $: if (browser) { filterStatus; loadTasks(); }

    const statusClass = (s) => `badge badge-${s?.toLowerCase().replace(/\s/g, '-')}`;
    const priorityClass = (p) => `badge badge-${p?.toLowerCase()}`;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
    const isOverdue = (item) => item.planned_end && new Date(item.planned_end) < new Date() && item.status !== 'Completed';
    const typeLabel = (t) => ({ task: 'Task', sub_task: 'Sub-task', sub_sub_task: 'Sub-sub-task' })[t] || t;
</script>

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
                <div class="task-card" class:overdue={isOverdue(item)}>
                    <div class="task-main">
                        <div class="task-header">
                            <span class="task-type-badge">{typeLabel(item.item_type)}</span>
                            <span class="task-project">{item.project_code} · {item.project_name}</span>
                        </div>
                        <div class="task-name">{item.name}</div>
                        <div class="task-path">{item.phase_name}{item.parent_task_name ? ` → ${item.parent_task_name}` : ''}{item.parent_sub_task_name ? ` → ${item.parent_sub_task_name}` : ''}</div>
                        {#if item.notes}
                            <div class="task-notes">{item.notes}</div>
                        {/if}
                    </div>
                    <div class="task-meta">
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
                            <option>Not Started</option>
                            <option>In Progress</option>
                            <option>Completed</option>
                            <option>On Hold</option>
                        </select>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

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
</style>
