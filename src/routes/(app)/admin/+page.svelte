<script>
    import { onMount } from 'svelte';

    export let data;
    let users = [];
    let loading = true;
    let showCreate = false;
    let form = { employee_id: '', full_name: '', email: '', password: '', role: 'staff', department: '', position: '' };
    let error = '';

    onMount(async () => {
        await loadUsers();
    });

    async function loadUsers() {
        loading = true;
        const res = await fetch('/api/users?active=true');
        if (res.ok) users = await res.json();
        loading = false;
    }

    async function createUser() {
        error = '';
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form)
        });
        if (res.ok) {
            showCreate = false;
            form = { employee_id: '', full_name: '', email: '', password: '', role: 'staff', department: '', position: '' };
            await loadUsers();
        } else {
            const d = await res.json();
            error = d.error || 'Failed to create user';
        }
    }

    const roleLabel = (r) => ({ admin: 'Admin', project_manager: 'Project Manager', staff: 'Staff/Officer' })[r] || r;
    const roleClass = (r) => ({ admin: 'badge-critical', project_manager: 'badge-high', staff: 'badge-medium' })[r] || 'badge-low';
</script>

<div class="page">
    <div class="page-header">
        <div>
            <h1>Admin Panel</h1>
            <p class="text-muted">Manage users, roles, and system settings</p>
        </div>
        <button class="btn btn-primary" on:click={() => showCreate = true}>
            ＋ Add User
        </button>
    </div>

    <div class="card" style="margin-bottom:24px">
        <h3 style="font-size:14px; font-weight:700; margin-bottom:16px">Role Permissions</h3>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:16px">
            <div style="padding:16px; background:var(--danger-bg); border-radius:8px">
                <div style="font-weight:700; color:var(--danger-text); margin-bottom:8px">Admin</div>
                <ul style="font-size:12px; color:var(--text-secondary); list-style:none; padding:0; display:flex; flex-direction:column; gap:4px">
                    <li>✓ Full system access</li>
                    <li>✓ Create/delete projects</li>
                    <li>✓ Manage users & roles</li>
                    <li>✓ View all projects</li>
                </ul>
            </div>
            <div style="padding:16px; background:var(--orange-bg); border-radius:8px">
                <div style="font-weight:700; color:var(--orange); margin-bottom:8px">Project Manager</div>
                <ul style="font-size:12px; color:var(--text-secondary); list-style:none; padding:0; display:flex; flex-direction:column; gap:4px">
                    <li>✓ Create projects</li>
                    <li>✓ Manage WBS & assign tasks</li>
                    <li>✓ Set health & status</li>
                    <li>✓ View all projects</li>
                </ul>
            </div>
            <div style="padding:16px; background:var(--info-bg); border-radius:8px">
                <div style="font-weight:700; color:var(--info-text); margin-bottom:8px">Staff / Officer</div>
                <ul style="font-size:12px; color:var(--text-secondary); list-style:none; padding:0; display:flex; flex-direction:column; gap:4px">
                    <li>✓ View assigned projects only</li>
                    <li>✓ Update own task status</li>
                    <li>✓ My Tasks filtered view</li>
                    <li>✗ Cannot create projects</li>
                </ul>
            </div>
        </div>
    </div>

    {#if loading}
        <div style="text-align:center; padding:40px; color:var(--text-muted)">Loading...</div>
    {:else}
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Employee ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Department</th>
                        <th>Position</th>
                    </tr>
                </thead>
                <tbody>
                    {#each users as u}
                        <tr>
                            <td style="font-family:monospace; font-size:12px">{u.employee_id}</td>
                            <td style="font-weight:600">{u.full_name}</td>
                            <td style="color:var(--text-secondary)">{u.email}</td>
                            <td><span class="badge {roleClass(u.role)}">{roleLabel(u.role)}</span></td>
                            <td>{u.department || '—'}</td>
                            <td>{u.position || '—'}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

{#if showCreate}
    <div class="modal-overlay" on:click={() => showCreate = false}>
        <div class="modal" on:click|stopPropagation>
            <div class="modal-header">
                <h2 style="font-size:18px; font-weight:700">Add New User</h2>
                <button class="btn btn-ghost btn-icon" on:click={() => showCreate = false}>✕</button>
            </div>
            <div class="modal-body">
                {#if error}
                    <div style="background:var(--danger-bg); color:var(--danger-text); padding:10px 16px; border-radius:8px; font-size:13px; margin-bottom:16px">{error}</div>
                {/if}
                <form on:submit|preventDefault={createUser}>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="label">Employee ID *</label>
                            <input class="input" bind:value={form.employee_id} placeholder="EMP-007" required />
                        </div>
                        <div class="form-group">
                            <label class="label">Full Name *</label>
                            <input class="input" bind:value={form.full_name} placeholder="John Doe" required />
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="label">Email *</label>
                            <input type="email" class="input" bind:value={form.email} placeholder="john@company.com" required />
                        </div>
                        <div class="form-group">
                            <label class="label">Password *</label>
                            <input type="password" class="input" bind:value={form.password} placeholder="Min 8 characters" required />
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="label">Role</label>
                            <select class="input select" bind:value={form.role}>
                                <option value="staff">Staff / Officer</option>
                                <option value="project_manager">Project Manager</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="label">Department</label>
                            <input class="input" bind:value={form.department} placeholder="IT" />
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="label">Position</label>
                        <input class="input" bind:value={form.position} placeholder="Developer" />
                    </div>
                    <button type="submit" class="btn btn-primary btn-lg" style="width:100%; justify-content:center">Create User</button>
                </form>
            </div>
        </div>
    </div>
{/if}

<style>
    .page { padding: 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; }
    .text-muted { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    ul { margin: 0; }
</style>
