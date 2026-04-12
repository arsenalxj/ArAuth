/** @jsxImportSource hono/jsx */
import type { FC } from 'hono/jsx';
import { Layout } from './layout';
import type { UserRow, AppRow } from '../types';

type DashboardProps = {
  adminName: string;
  userStats: { total: number; locked: number; week: number };
  appStats: { total: number; enabled: number };
  recentUsers: UserRow[];
  apps: AppRow[];
  now: string;
};

function userBadge(user: UserRow) {
  const now = new Date();
  if (user.status === 0) return <span class="badge off"><span class="dot" />已禁用</span>;
  if (user.locked_until && new Date(user.locked_until) > now) return <span class="badge lock"><span class="dot" />锁定中</span>;
  return <span class="badge ok"><span class="dot" />正常</span>;
}

export const DashboardPage: FC<DashboardProps> = ({
  adminName,
  userStats,
  appStats,
  recentUsers,
  apps,
  now,
}) => (
  <Layout
    title="概览"
    activePage="dash"
    adminName={adminName}
    appsCount={appStats.total}
    usersCount={userStats.total}
  >
    <div class="page-head">
      <div>
        <h1 class="page-title">概览</h1>
        <p class="page-sub">系统运行状态一览 · {now} 更新</p>
      </div>
      <div>
        <a href="/admin/dashboard" role="button" class="outline" style="padding:.4rem .875rem;font-size:.8125rem">
          刷新
        </a>
      </div>
    </div>
    <div class="page-body">

      {/* Stats row */}
      <div class="stats-row">
        <div class="stat-card c-orange">
          <div class="stat-lbl">总用户数</div>
          <div class="stat-val">{userStats.total}</div>
          <div class="stat-hint">
            <span class="up">↑ {userStats.week}</span> 近 7 天新增
          </div>
        </div>
        <div class="stat-card c-cyan">
          <div class="stat-lbl">接入应用</div>
          <div class="stat-val">{appStats.total}</div>
          <div class="stat-hint">
            启用 <span style="color:var(--pico-color)">{appStats.enabled}</span> / 禁用{' '}
            {appStats.total - appStats.enabled}
          </div>
        </div>
        <div class="stat-card c-green">
          <div class="stat-lbl">近 7 天注册</div>
          <div class="stat-val">{userStats.week}</div>
          <div class="stat-hint">新用户</div>
        </div>
        <div class="stat-card c-violet">
          <div class="stat-lbl">被锁定账号</div>
          <div class="stat-val">{userStats.locked}</div>
          <div class="stat-hint">
            {userStats.locked > 0 ? <span class="err">需要关注</span> : <span class="up">一切正常</span>}
          </div>
        </div>
      </div>

      <div class="two-col">
        {/* Recent registrations */}
        <div class="card">
          <div class="card-head">
            <h3 class="card-title">最近注册</h3>
            <a href="/admin/users" role="button" class="outline" style="padding:.3rem .7rem;font-size:.8125rem">
              查看全部
            </a>
          </div>
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>状态</th>
                <th>注册时间</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.username}</strong></td>
                  <td>{userBadge(u)}</td>
                  <td><small style="color:var(--pico-muted-color)">{u.created_at.slice(0, 10)}</small></td>
                </tr>
              ))}
              {recentUsers.length === 0 && (
                <tr>
                  <td colSpan={3} style="text-align:center;color:var(--pico-muted-color);padding:1.5rem">
                    暂无用户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Apps quick status */}
        <div class="card">
          <div class="card-head">
            <h3 class="card-title">应用状态</h3>
            <a href="/admin/apps" role="button" style="padding:.3rem .7rem;font-size:.8125rem">
              管理应用
            </a>
          </div>
          {apps.length === 0 ? (
            <div style="padding:1.5rem;text-align:center;color:var(--pico-muted-color)">暂无应用</div>
          ) : (
            <div class="feed">
              {apps.map((app) => (
                <div class="feed-item" key={app.id}>
                  <div class="feed-ico">🔑</div>
                  <div class="feed-main">
                    <div>
                      <span class="feed-user">{app.name}</span>{' '}
                      {app.status === 1 ? (
                        <span class="badge ok" style="font-size:.7rem"><span class="dot" />启用</span>
                      ) : (
                        <span class="badge off" style="font-size:.7rem"><span class="dot" />禁用</span>
                      )}
                    </div>
                    <div class="feed-time">{app.app_key}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Apps overview table */}
      {apps.length > 0 && (
        <div class="card">
          <div class="card-head">
            <h3 class="card-title">应用概览</h3>
            <a href="/admin/apps" role="button" style="padding:.3rem .7rem;font-size:.8125rem">
              管理应用
            </a>
          </div>
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>App Key</th>
                <th>状态</th>
                <th>创建日期</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id}>
                  <td><strong>{app.name}</strong></td>
                  <td><span class="key">{app.app_key}</span></td>
                  <td>
                    {app.status === 1 ? (
                      <span class="badge ok"><span class="dot" />启用</span>
                    ) : (
                      <span class="badge off"><span class="dot" />禁用</span>
                    )}
                  </td>
                  <td><small style="color:var(--pico-muted-color)">{app.created_at.slice(0, 10)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </Layout>
);
