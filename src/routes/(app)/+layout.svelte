<script>
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';

    export let data;
    $: user = data.user;

    let collapsed = false;

    async function logout() {
        await fetch('/api/auth', { method: 'DELETE' });
        goto('/login');
    }

    $: currentPath = $page.url.pathname;

    const roleLabel = (role) => {
        return { admin: 'Admin', project_manager: 'Project Manager', staff: 'Staff/Officer' }[role] || role;
    };
</script>

<div class="app-layout" class:collapsed>
    <!-- Sidebar -->
    <aside class="sidebar">
        <div class="sidebar-brand" on:click={() => collapsed = !collapsed}>
            <div class="brand-icon">P</div>
            {#if !collapsed}
                <span class="brand-text">ProjectHub</span>
            {/if}
        </div>

        <nav class="sidebar-nav">
            <!-- My Tasks (visible to all) -->
            <a href="/my-tasks" class="nav-item" class:active={currentPath === '/my-tasks'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                {#if !collapsed}<span>My Tasks</span>{/if}
            </a>

            <!-- All Projects -->
            <a href="/projects" class="nav-item" class:active={currentPath === '/projects'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                {#if !collapsed}<span>All Projects</span>{/if}
            </a>

            <!-- Admin (admin only) -->
            {#if user?.role === 'admin'}
                <a href="/admin" class="nav-item" class:active={currentPath.startsWith('/admin')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09"/></svg>
                    {#if !collapsed}<span>Admin</span>{/if}
                </a>
            {/if}

        </nav>

        <!-- User section -->
        <div class="sidebar-user">
            {#if !collapsed}
                <div class="user-info">
                    <div class="user-avatar">{user?.full_name?.[0] || '?'}</div>
                    <div class="user-details">
                        <div class="user-name truncate">{user?.full_name}</div>
                        <div class="user-role">{roleLabel(user?.role)}</div>
                    </div>
                </div>
                <button class="btn-ghost btn-icon logout-btn" on:click={logout} title="Sign out">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
            {:else}
                <button class="btn-ghost btn-icon" on:click={logout} title="Sign out" style="margin:0 auto">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
            {/if}
        </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
        <slot />
    </main>
</div>

<style>
    .app-layout {
        display: flex;
        height: 100vh;
        overflow: hidden;
    }

    .sidebar {
        width: var(--sidebar-width);
        background: var(--bg-sidebar);
        color: var(--text-sidebar);
        display: flex;
        flex-direction: column;
        transition: width 0.3s ease;
        flex-shrink: 0;
        overflow: hidden;
    }
    .collapsed .sidebar { width: var(--sidebar-collapsed); }

    .sidebar-brand {
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-bottom: 1px solid #1e293b;
        cursor: pointer;
    }
    .collapsed .sidebar-brand { padding: 16px 14px; justify-content: center; }

    .brand-icon {
        width: 32px; height: 32px; border-radius: 10px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; font-weight: 800; color: #fff; flex-shrink: 0;
    }
    .brand-text { font-size: 16px; font-weight: 700; white-space: nowrap; }

    .sidebar-nav {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
    }

    .nav-item {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 12px; border-radius: 8px;
        color: #94a3b8; text-decoration: none;
        font-size: 13px; font-weight: 500;
        transition: all 0.15s; margin-bottom: 2px;
        white-space: nowrap;
    }
    .nav-item:hover { background: #1e293b; color: #e2e8f0; }
    .nav-item.active { background: #1e293b; color: #fff; }
    .collapsed .nav-item { padding: 10px; justify-content: center; }
    .collapsed .nav-item span { display: none; }

    .sidebar-user {
        padding: 12px;
        border-top: 1px solid #1e293b;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .user-info { display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; }
    .user-avatar {
        width: 30px; height: 30px; border-radius: 8px;
        background: #334155; display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; color: #e2e8f0; flex-shrink: 0;
    }
    .user-name { font-size: 12px; font-weight: 600; color: #e2e8f0; }
    .user-role { font-size: 10px; color: #64748b; }
    .logout-btn { color: #64748b; border: none; background: none; cursor: pointer; }
    .logout-btn:hover { color: #ef4444; }

    .main-content {
        flex: 1;
        overflow: auto;
        display: flex;
        flex-direction: column;
    }
</style>
