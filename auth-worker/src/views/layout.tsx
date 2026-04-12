/** @jsxImportSource hono/jsx */
import type { FC } from 'hono/jsx';

export const STYLES = `
/* ── Pico Variable Overrides ─────────────────────── */
:root {
  --pico-font-family-sans-serif: 'DM Sans', system-ui, sans-serif;
  --pico-font-family-monospace: 'Fira Code', monospace;
  --pico-primary: #f97316;
  --pico-primary-background: #f97316;
  --pico-primary-border: #f97316;
  --pico-primary-hover: #ea6900;
  --pico-primary-hover-background: #ea6900;
  --pico-primary-focus: rgba(249, 115, 22, 0.25);
  --pico-primary-inverse: #fff;
  --sidebar-width: 224px;
}
html, body { height: 100%; margin: 0; padding: 0; }
body { display: flex; flex-direction: column; }
body.is-admin { flex-direction: row; align-items: stretch; min-height: 100vh; }

/* ── Sidebar ─────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-width); flex-shrink: 0; display: flex;
  flex-direction: column; border-right: 1px solid var(--pico-muted-border-color);
  background: var(--pico-background-color); position: sticky; top: 0;
  height: 100vh; overflow-y: auto;
}
.sidebar-header { padding: 1.375rem 1.125rem 1rem; border-bottom: 1px solid var(--pico-muted-border-color); }
.logo-wrap { display: flex; align-items: center; gap: .625rem; text-decoration: none; color: inherit; }
.logo-icon {
  width: 34px; height: 34px; background: var(--pico-primary); border-radius: 9px;
  display: flex; align-items: center; justify-content: center; font-size: 1.125rem; flex-shrink: 0;
}
.logo-name { font-size: 1.0625rem; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; }
.logo-sub { font-size: .6875rem; color: var(--pico-muted-color); display: block; }
.sidebar-nav { flex: 1; padding: .875rem .75rem; }
.nav-label {
  font-size: .6875rem; text-transform: uppercase; letter-spacing: .08em; font-weight: 600;
  color: var(--pico-muted-color); padding: 0 .5rem; margin: .75rem 0 .3rem; display: block;
}
.nav-btn {
  display: flex; align-items: center; gap: .625rem; width: 100%;
  padding: .5rem .625rem; border: none; background: transparent;
  color: var(--pico-muted-color); font-size: .875rem; font-weight: 500;
  border-radius: 8px; cursor: pointer; text-align: left;
  transition: background .12s, color .12s; margin-bottom: 2px; text-decoration: none;
}
.nav-btn:hover { background: var(--pico-card-background-color); color: var(--pico-color); }
.nav-btn.active { background: rgba(249,115,22,.1); color: #f97316; }
.nav-ico { width: 1.125rem; height: 1.125rem; flex-shrink: 0; opacity: .75; }
.nav-btn.active .nav-ico { opacity: 1; }
.nav-count { margin-left: auto; font-size: .6875rem; font-weight: 700; padding: .1rem .45rem; border-radius: 99px; }
.nav-count.orange { background: rgba(249,115,22,.15); color: #f97316; }
.nav-count.cyan   { background: rgba(6,182,212,.15);  color: #06b6d4; }
.sidebar-footer { padding: .875rem .75rem; border-top: 1px solid var(--pico-muted-border-color); }
.admin-chip { display: flex; align-items: center; gap: .5rem; padding: .5rem .625rem; border-radius: 8px; background: var(--pico-card-background-color); }
.admin-avatar {
  width: 28px; height: 28px; border-radius: 50%; background: var(--pico-primary); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: .75rem; font-weight: 700; flex-shrink: 0;
}
.admin-name { font-size: .8125rem; font-weight: 600; line-height: 1.3; }
.admin-role { font-size: .6875rem; color: var(--pico-muted-color); }

/* ── Main Pane ───────────────────────────────────── */
.main-pane { flex: 1; overflow-y: auto; min-width: 0; }
.page-head {
  padding: 1.625rem 2rem 1.125rem; border-bottom: 1px solid var(--pico-muted-border-color);
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
}
.page-title { margin: 0; font-size: 1.375rem; font-weight: 700; letter-spacing: -.025em; }
.page-sub   { margin: .2rem 0 0; font-size: .875rem; color: var(--pico-muted-color); }
.page-body  { padding: 1.75rem 2rem; }

/* ── Stat Cards ──────────────────────────────────── */
.stats-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 1rem; margin-bottom: 1.5rem; }
.stat-card {
  background: var(--pico-card-background-color); border: 1px solid var(--pico-card-border-color);
  border-radius: var(--pico-border-radius); padding: 1.125rem 1.375rem 1.25rem; position: relative; overflow: hidden;
}
.stat-card::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
.stat-card.c-orange::after { background: #f97316; }
.stat-card.c-cyan::after   { background: #06b6d4; }
.stat-card.c-green::after  { background: #10b981; }
.stat-card.c-violet::after { background: #8b5cf6; }
.stat-lbl { font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--pico-muted-color); margin-bottom: .5rem; }
.stat-val { font-size: 2.125rem; font-weight: 700; letter-spacing: -.05em; line-height: 1; font-family: var(--pico-font-family-monospace); margin-bottom: .375rem; }
.stat-hint { font-size: .75rem; color: var(--pico-muted-color); }
.up   { color: #10b981; }
.warn { color: #f97316; }
.err  { color: #ef4444; }

/* ── Section Card ────────────────────────────────── */
.card { background: var(--pico-card-background-color); border: 1px solid var(--pico-card-border-color); border-radius: var(--pico-border-radius); overflow: hidden; margin-bottom: 1.5rem; }
.card-head { padding: .875rem 1.375rem; border-bottom: 1px solid var(--pico-muted-border-color); display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.card-title { font-size: .9375rem; font-weight: 600; margin: 0; }

/* ── Tables ──────────────────────────────────────── */
.card table { margin: 0; }
th { font-size: .7rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 600; color: var(--pico-muted-color); }
td { font-size: .875rem; vertical-align: middle; }

/* ── Badges ──────────────────────────────────────── */
.badge { display: inline-flex; align-items: center; gap: .3rem; padding: .2rem .6rem; border-radius: 99px; font-size: .75rem; font-weight: 600; }
.dot { width: 6px; height: 6px; border-radius: 50%; }
.badge.ok   { background: rgba(16,185,129,.12); color: #10b981; }
.badge.ok .dot { background: #10b981; }
.badge.off  { background: rgba(239,68,68,.12);  color: #ef4444; }
.badge.off .dot { background: #ef4444; }
.badge.lock { background: rgba(249,115,22,.12); color: #f97316; }
.badge.lock .dot { background: #f97316; }

/* ── Key Pills ───────────────────────────────────── */
.key {
  font-family: var(--pico-font-family-monospace); font-size: .775rem;
  background: rgba(255,255,255,.04); border: 1px solid var(--pico-muted-border-color);
  border-radius: 5px; padding: .2rem .5rem; max-width: 190px;
  display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;
}
.copy-btn {
  background: none; border: none; cursor: pointer; padding: .15rem .3rem; border-radius: 4px;
  color: var(--pico-muted-color); font-size: .75rem; transition: all .12s; vertical-align: middle;
}
.copy-btn:hover { color: var(--pico-color); background: rgba(255,255,255,.06); }

/* ── Action Group ────────────────────────────────── */
.acts { display: flex; gap: .375rem; flex-wrap: nowrap; }
.acts button { padding: .25rem .7rem; font-size: .8125rem; white-space: nowrap; }

/* ── Toolbar ─────────────────────────────────────── */
.toolbar { padding: .875rem 1.375rem; border-bottom: 1px solid var(--pico-muted-border-color); display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.toolbar input[type="search"] { margin: 0; font-size: .875rem; max-width: 260px; }
.toolbar select { margin: 0; font-size: .875rem; width: auto; padding-top: .4rem; padding-bottom: .4rem; }

/* ── Activity Feed ───────────────────────────────── */
.feed { padding: 0 1.375rem; }
.feed-item { display: flex; align-items: flex-start; gap: .75rem; padding: .8rem 0; border-bottom: 1px solid var(--pico-muted-border-color); font-size: .875rem; }
.feed-item:last-child { border-bottom: none; }
.feed-ico {
  width: 30px; height: 30px; border-radius: 50%; background: var(--pico-card-background-color);
  border: 1px solid var(--pico-muted-border-color); display: flex; align-items: center; justify-content: center; font-size: .8125rem; flex-shrink: 0;
}
.feed-main { flex: 1; }
.feed-user { font-weight: 600; }
.feed-time { font-size: .7rem; color: var(--pico-muted-color); margin-top: .1rem; }

/* ── Progress mini ───────────────────────────────── */
.bar-wrap { display: flex; align-items: center; gap: .5rem; font-size: .8125rem; font-family: var(--pico-font-family-monospace); }
.bar-wrap progress { flex: 1; height: 5px; margin: 0; }

/* ── Secret Alert ────────────────────────────────── */
.secret-box { background: rgba(249,115,22,.07); border: 1px solid rgba(249,115,22,.3); border-radius: var(--pico-border-radius); padding: 1rem 1.25rem; margin-bottom: 1.5rem; font-size: .875rem; }
.secret-box strong { color: #f97316; }
.secret-row { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-top: .75rem; }
.secret-field-label { font-size: .7rem; color: var(--pico-muted-color); margin-bottom: .25rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
.secret-val { font-family: var(--pico-font-family-monospace); font-size: .775rem; background: rgba(255,255,255,.05); border: 1px solid var(--pico-muted-border-color); border-radius: 6px; padding: .4rem .625rem; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Pagination ──────────────────────────────────── */
.pager { padding: .875rem 1.375rem; border-top: 1px solid var(--pico-muted-border-color); display: flex; align-items: center; justify-content: space-between; }
.pager small { color: var(--pico-muted-color); }
.pager .acts button { padding: .3rem .7rem; }

/* ── Two-col grid ────────────────────────────────── */
.two-col { display: grid; grid-template-columns: 1fr 360px; gap: 1.5rem; }

dialog article { max-width: 460px; }
dialog article header { align-items: center; }
dialog article header h3 { margin: 0; }
`;

type LayoutProps = {
  title: string;
  activePage: 'dash' | 'apps' | 'users';
  adminName: string;
  appsCount: number;
  usersCount: number;
};

export const Layout: FC<LayoutProps & { children?: unknown }> = ({
  title,
  activePage,
  adminName,
  appsCount,
  usersCount,
  children,
}) => {
  const initial = adminName.charAt(0).toUpperCase();
  return (
    <html lang="zh-CN" data-theme="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} · ArAuth</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
        />
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body class="is-admin">
        {/* Sidebar */}
        <aside class="sidebar">
          <div class="sidebar-header">
            <a class="logo-wrap" href="/admin/dashboard">
              <div class="logo-icon">🔐</div>
              <div>
                <span class="logo-name">ArAuth</span>
                <span class="logo-sub">管理控制台</span>
              </div>
            </a>
          </div>
          <nav class="sidebar-nav">
            <span class="nav-label">主菜单</span>
            <a class={`nav-btn${activePage === 'dash' ? ' active' : ''}`} href="/admin/dashboard">
              <svg class="nav-ico" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
              </svg>
              概览
            </a>
            <span class="nav-label">管理</span>
            <a class={`nav-btn${activePage === 'apps' ? ' active' : ''}`} href="/admin/apps">
              <svg class="nav-ico" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fill-rule="evenodd"
                  d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 2a1 1 0 000 2h6a1 1 0 100-2H7zm6 7a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1zm-3 3a1 1 0 100 2h.01a1 1 0 100-2H10zm-4 1a1 1 0 011-1h.01a1 1 0 110 2H7a1 1 0 01-1-1zm1-4a1 1 0 100 2h.01a1 1 0 100-2H7zm2 1a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm4-4a1 1 0 100 2h.01a1 1 0 100-2H13zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zM7 8a1 1 0 000 2h.01a1 1 0 000-2H7z"
                  clip-rule="evenodd"
                />
              </svg>
              应用管理
              <span class="nav-count orange">{appsCount}</span>
            </a>
            <a class={`nav-btn${activePage === 'users' ? ' active' : ''}`} href="/admin/users">
              <svg class="nav-ico" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
              用户管理
              <span class="nav-count cyan">{usersCount}</span>
            </a>
            <span class="nav-label" style="margin-top:1rem">系统</span>
            <form method="POST" action="/admin/logout" style="margin:0">
              <button type="submit" class="nav-btn">
                <svg class="nav-ico" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                    clip-rule="evenodd"
                  />
                </svg>
                退出登录
              </button>
            </form>
          </nav>
          <div class="sidebar-footer">
            <div class="admin-chip">
              <div class="admin-avatar">{initial}</div>
              <div>
                <div class="admin-name">{adminName}</div>
                <div class="admin-role">超级管理员</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div class="main-pane">{children as any}</div>

        {/* Copy script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
function copyText(text, btn) {
  if (navigator.clipboard) navigator.clipboard.writeText(text);
  const orig = btn.textContent;
  btn.textContent = '已复制';
  setTimeout(() => btn.textContent = orig, 1500);
}
`,
          }}
        />
      </body>
    </html>
  );
};
