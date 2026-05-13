<script>
    import { goto } from '$app/navigation';

    let email = '';
    let password = '';
    let error = '';
    let loading = false;

    async function handleLogin() {
        error = '';
        loading = true;
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) {
                error = data.error || 'Login failed';
                return;
            }
            goto('/projects');
        } catch (e) {
            error = 'Connection error';
        } finally {
            loading = false;
        }
    }
</script>

<div class="login-page">
    <div class="login-card">
        <div class="login-header">
            <div class="login-logo">P</div>
            <h1>ProjectHub</h1>
            <p>IT Project Management System</p>
        </div>

        <form on:submit|preventDefault={handleLogin}>
            {#if error}
                <div class="login-error">{error}</div>
            {/if}

            <div class="form-group">
                <label class="label" for="email">Email</label>
                <input id="email" type="email" class="input" bind:value={email}
                       placeholder="your@email.com" required />
            </div>

            <div class="form-group">
                <label class="label" for="password">Password</label>
                <input id="password" type="password" class="input" bind:value={password}
                       placeholder="••••••••" required />
            </div>

            <button type="submit" class="btn btn-primary btn-lg w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
            </button>
        </form>

        <div class="login-hint">
            <p>Demo accounts:</p>
            <code>admin@company.com</code> (Admin)<br>
            <code>andi@company.com</code> (Project Manager)<br>
            <code>citra@company.com</code> (Staff)<br>
            <p style="margin-top:4px; font-size:11px">Password for all: <code>password123</code></p>
        </div>
    </div>
</div>

<style>
    .login-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    }
    .login-card {
        background: #fff;
        border-radius: 20px;
        padding: 40px;
        width: 400px;
        max-width: 90vw;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);
    }
    .login-header {
        text-align: center;
        margin-bottom: 32px;
    }
    .login-logo {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        font-weight: 800;
        color: #fff;
        margin: 0 auto 12px;
    }
    h1 { font-size: 24px; font-weight: 800; color: #0f172a; }
    p { font-size: 13px; color: #64748b; margin-top: 4px; }
    .login-error {
        background: #fef2f2;
        color: #dc2626;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 13px;
        margin-bottom: 16px;
        border: 1px solid #fecaca;
    }
    .login-hint {
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid #f1f5f9;
        font-size: 12px;
        color: #94a3b8;
    }
    .login-hint p { font-size: 12px; color: #94a3b8; font-weight: 600; }
    code {
        background: #f1f5f9;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 11px;
    }
    .w-full { width: 100%; justify-content: center; }
</style>
