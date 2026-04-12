/** @jsxImportSource hono/jsx */
import type { FC } from 'hono/jsx';
import { Layout } from './layout';
import type { AppRow } from '../types';

type AppsPageProps = {
  apps: AppRow[];
  adminName: string;
  usersCount: number;
  newSecret?: { appKey: string; appSecret: string; appName: string } | null;
};

export const AppsPage: FC<AppsPageProps> = ({ apps, adminName, usersCount, newSecret }) => (
  <Layout
    title="应用管理"
    activePage="apps"
    adminName={adminName}
    appsCount={apps.length}
    usersCount={usersCount}
  >
    <div class="page-head">
      <div>
        <h1 class="page-title">应用管理</h1>
        <p class="page-sub">管理接入 ArAuth 的 Flutter 应用，生成 App Key / Secret</p>
      </div>
      <button onclick="document.getElementById('dlg-new-app').showModal()">+ 新建应用</button>
    </div>
    <div class="page-body">

      {/* One-time secret reveal */}
      {newSecret && (
        <div class="secret-box">
          <p style="margin:0 0 .5rem">
            <strong>⚠️ 请立即保存 App Secret</strong> — 此密钥只显示一次，关闭后无法找回
          </p>
          <div class="secret-row">
            <div>
              <div class="secret-field-label">App Key</div>
              <span class="secret-val">{newSecret.appKey}</span>
            </div>
            <div>
              <div class="secret-field-label">
                App Secret <span style="color:#f97316">（仅此一次）</span>
              </div>
              <span class="secret-val" id="new-secret-val">{newSecret.appSecret}</span>
            </div>
          </div>
          <div style="display:flex;gap:.5rem;margin-top:.875rem">
            <button
              style="padding:.3rem .875rem;font-size:.8125rem"
              onclick={`copyText('${newSecret.appSecret}', this)`}
            >
              复制 Secret
            </button>
            <a href="/admin/apps" role="button" class="outline" style="padding:.3rem .875rem;font-size:.8125rem">
              我已保存，关闭
            </a>
          </div>
        </div>
      )}

      <div class="card">
        <div class="card-head">
          <h3 class="card-title">
            全部应用{' '}
            <small style="font-weight:400;color:var(--pico-muted-color)">· {apps.length} 个</small>
          </h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>应用名称</th>
              <th>App Key</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id}>
                <td>
                  <strong>{app.name}</strong>
                </td>
                <td>
                  <span class="key">{app.app_key}</span>
                  <button class="copy-btn" onclick={`copyText('${app.app_key}', this)`} title="复制">
                    ⎘
                  </button>
                </td>
                <td>
                  {app.status === 1 ? (
                    <span class="badge ok">
                      <span class="dot" />
                      启用
                    </span>
                  ) : (
                    <span class="badge off">
                      <span class="dot" />
                      禁用
                    </span>
                  )}
                </td>
                <td>
                  <small style="color:var(--pico-muted-color)">{app.created_at}</small>
                </td>
                <td>
                  <div class="acts">
                    <form method="POST" action={`/admin/apps/${app.id}/toggle`} style="margin:0">
                      <button type="submit" class="outline">
                        {app.status === 1 ? '禁用' : '启用'}
                      </button>
                    </form>
                    <form
                      method="POST"
                      action={`/admin/apps/${app.id}/delete`}
                      style="margin:0"
                      onsubmit="return confirm('确定删除该应用？此操作不可恢复。')"
                    >
                      <button type="submit" class="outline contrast">
                        删除
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={5} style="text-align:center;color:var(--pico-muted-color);padding:2rem">
                  暂无应用，点击右上角新建
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* New App Dialog */}
    <dialog id="dlg-new-app">
      <article>
        <header>
          <button rel="prev" onclick="document.getElementById('dlg-new-app').close()" />
          <h3>新建应用</h3>
        </header>
        <p style="color:var(--pico-muted-color);font-size:.875rem;margin-top:0">
          创建成功后将一次性显示 App Secret，请妥善保管，丢失后无法找回。
        </p>
        <form method="POST" action="/admin/apps">
          <label>
            应用名称
            <input type="text" name="name" placeholder="例如：MyFlutterApp" required />
            <small>建议英文 + 下划线，便于识别</small>
          </label>
          <footer>
            <button
              type="button"
              class="outline"
              onclick="document.getElementById('dlg-new-app').close()"
            >
              取消
            </button>
            <button type="submit">创建</button>
          </footer>
        </form>
      </article>
    </dialog>
  </Layout>
);
