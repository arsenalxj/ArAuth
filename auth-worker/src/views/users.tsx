/** @jsxImportSource hono/jsx */
import type { FC } from 'hono/jsx';
import { Layout } from './layout';
import type { UserRow } from '../types';

type UsersPageProps = {
  rows: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  statusFilter: string;
  adminName: string;
  appsCount: number;
};

function userBadge(user: UserRow) {
  const now = new Date();
  if (user.status === 0) {
    return (
      <span class="badge off">
        <span class="dot" />
        已禁用
      </span>
    );
  }
  if (user.locked_until && new Date(user.locked_until) > now) {
    return (
      <span class="badge lock">
        <span class="dot" />
        锁定中
      </span>
    );
  }
  return (
    <span class="badge ok">
      <span class="dot" />
      正常
    </span>
  );
}

function formatLastSeen(value: string | null | undefined) {
  if (!value) {
    return '—';
  }
  return value.slice(0, 16).replace('T', ' ');
}

export const UsersPage: FC<UsersPageProps> = ({
  rows,
  total,
  page,
  pageSize,
  search,
  statusFilter,
  adminName,
  appsCount,
}) => {
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const buildUrl = (p: number, s = search, st = statusFilter) => {
    const params = new URLSearchParams();
    if (p > 1) params.set('page', String(p));
    if (s) params.set('search', s);
    if (st) params.set('status', st);
    const q = params.toString();
    return `/admin/users${q ? '?' + q : ''}`;
  };

  return (
    <Layout
      title="用户管理"
      activePage="users"
      adminName={adminName}
      appsCount={appsCount}
      usersCount={total}
    >
      <div class="page-head">
        <div>
          <h1 class="page-title">用户管理</h1>
          <p class="page-sub">
            共 {total} 个用户 · 所有应用共享同一账号池
          </p>
        </div>
      </div>
      <div class="page-body">
        <div class="card">
          {/* Search / filter toolbar */}
          <form method="get" action="/admin/users" style="margin:0">
            <div class="toolbar">
              <input
                type="search"
                name="search"
                placeholder="搜索用户名…"
                value={search}
                style="max-width:260px;margin:0"
              />
              <div style="display:flex;gap:.5rem">
                <select name="status" onchange="this.form.submit()">
                  <option value="" selected={statusFilter === ''}>
                    全部状态
                  </option>
                  <option value="1" selected={statusFilter === '1'}>
                    正常
                  </option>
                  <option value="0" selected={statusFilter === '0'}>
                    禁用
                  </option>
                </select>
                <button type="submit" class="outline" style="padding:.4rem .75rem;font-size:.875rem">
                  搜索
                </button>
              </div>
            </div>
          </form>

          <table>
            <thead>
              <tr>
                <th>UID</th>
                <th>用户名</th>
                <th>状态</th>
                <th>登录失败</th>
                <th>活跃会话</th>
                <th>最近活跃</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id}>
                  <td>
                    <code style="font-size:.75rem;color:var(--pico-muted-color)">
                      {user.id}
                    </code>
                  </td>
                  <td>
                    <strong>{user.username}</strong>
                  </td>
                  <td>{userBadge(user)}</td>
                  <td>
                    <code style={`font-size:.8rem${user.failed_count >= 3 ? ';color:#f97316' : ''}`}>
                      {user.failed_count}
                    </code>
                  </td>
                  <td>
                    <code style="font-size:.8rem">{user.active_sessions ?? 0}</code>
                  </td>
                  <td>
                    <small style="color:var(--pico-muted-color)">
                      {formatLastSeen(user.last_seen_at)}
                    </small>
                  </td>
                  <td>
                    <small style="color:var(--pico-muted-color)">
                      {user.created_at.slice(0, 10)}
                    </small>
                  </td>
                  <td>
                    <div class="acts">
                      <button
                        type="button"
                        class="outline"
                        onclick={`document.getElementById('dlg-reset-${user.id}').showModal()`}
                      >
                        重置密码
                      </button>
                      <form
                        method="post"
                        action={`/admin/users/${user.id}/toggle`}
                        style="margin:0"
                      >
                        <input type="hidden" name="redirect" value={buildUrl(page)} />
                        {user.status === 1 ? (
                          <button type="submit" class="outline contrast">
                            禁用
                          </button>
                        ) : (
                          <button type="submit">启用</button>
                        )}
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} style="text-align:center;color:var(--pico-muted-color);padding:2rem">
                    没有找到匹配的用户
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {total > pageSize && (
            <div class="pager">
              <small>
                显示第 {start}–{end} 条，共 {total} 条
              </small>
              <div class="acts">
                {page > 1 ? (
                  <a href={buildUrl(page - 1)} role="button" class="outline">
                    上一页
                  </a>
                ) : (
                  <button class="outline" disabled>
                    上一页
                  </button>
                )}
                {page < totalPages ? (
                  <a href={buildUrl(page + 1)} role="button" class="outline">
                    下一页
                  </a>
                ) : (
                  <button class="outline" disabled>
                    下一页
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reset-password dialogs (one per visible user) */}
      {rows.map((user) => (
        <dialog id={`dlg-reset-${user.id}`} key={user.id}>
          <article>
            <header>
              <button
                rel="prev"
                onclick={`document.getElementById('dlg-reset-${user.id}').close()`}
              />
              <h3>重置密码 · {user.username}</h3>
            </header>
            <p style="color:var(--pico-muted-color);font-size:.875rem;margin-top:0">
              密码重置后，该用户所有已登录会话将立即失效，设备需重新登录。
            </p>
            <form method="post" action={`/admin/users/${user.id}/reset-password`}>
              <input type="hidden" name="redirect" value={buildUrl(page)} />
              <label>
                新密码
                <input type="password" name="password" placeholder="至少 8 位字符" minLength={8} required />
              </label>
              <label>
                确认密码
                <input type="password" name="confirm" placeholder="再次输入新密码" required />
              </label>
              <footer>
                <button
                  type="button"
                  class="outline"
                  onclick={`document.getElementById('dlg-reset-${user.id}').close()`}
                >
                  取消
                </button>
                <button type="submit">确认重置</button>
              </footer>
            </form>
          </article>
        </dialog>
      ))}
    </Layout>
  );
};
