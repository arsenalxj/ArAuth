/** @jsxImportSource hono/jsx */
import type { FC } from 'hono/jsx';
import { STYLES } from './layout';

type LoginProps = {
  error?: string;
};

export const LoginPage: FC<LoginProps> = ({ error }) => (
  <html lang="zh-CN" data-theme="dark">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>登录 · ArAuth 管理后台</title>
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
      <style
        dangerouslySetInnerHTML={{
          __html:
            STYLES +
            `
:root { --pico-font-family-sans-serif:'DM Sans',system-ui,sans-serif; }
body.is-login { display:flex; align-items:center; justify-content:center; min-height:100vh; }
.login-wrap { width:100%; max-width:400px; padding:1.5rem; }
.login-brand { text-align:center; margin-bottom:1.875rem; }
.login-mark {
  display:inline-flex; align-items:center; justify-content:center;
  width:52px; height:52px; background:var(--pico-primary); border-radius:14px;
  font-size:1.5rem; margin-bottom:.75rem;
}
.login-brand h2 { margin:0; font-weight:800; letter-spacing:-.035em; font-size:1.625rem; }
.login-brand p  { margin:.25rem 0 0; color:var(--pico-muted-color); font-size:.875rem; }
`,
        }}
      />
    </head>
    <body class="is-login">
      <div class="login-wrap">
        <div class="login-brand">
          <div class="login-mark">🔐</div>
          <h2>ArAuth</h2>
          <p>管理后台 · Admin Console</p>
        </div>
        <article>
          {error && (
            <p style="color:#ef4444;font-size:.875rem;margin-bottom:1rem;padding:.5rem .75rem;background:rgba(239,68,68,.1);border-radius:6px;border:1px solid rgba(239,68,68,.3)">
              {error}
            </p>
          )}
          <form method="post" action="/admin/login">
            <label>
              管理员账号
              <input
                type="text"
                name="username"
                placeholder="admin"
                autocomplete="username"
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                name="password"
                placeholder="••••••••"
                autocomplete="current-password"
                required
              />
            </label>
            <button type="submit" style="width:100%;margin-top:.25rem">
              登录
            </button>
          </form>
          <p style="text-align:center;font-size:.75rem;color:var(--pico-muted-color);margin:1rem 0 0">
            Powered by Cloudflare Workers · ArAuth v1.0
          </p>
        </article>
      </div>
    </body>
  </html>
);
