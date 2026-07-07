/**
 * Shared HTML shell for the admin editor pages (kviz, ko-sam-ja,
 * tajni-agenti, scenariji). Same approach as geo-editor-page.ts: the whole
 * page is a TS template literal, so the inline scripts must not contain
 * backticks or the dollar-brace sequence — page JS uses string concatenation.
 *
 * The shell provides: design tokens + base CSS, the admin nav, error/ok
 * toasts, the token gate (localStorage 'igra-admin-token') and a small JS
 * runtime `Admin` with `$`, `esc`, `api`, `showErr`, `showOk` and
 * `start(listPath, onData)`. Page scripts run after the runtime and call
 * `Admin.start(...)` last.
 */

export interface AdminPageOptions {
  /** Browser tab + h1 title, e.g. 'Kviz editor'. */
  title: string;
  subtitle: string;
  /** Which nav link to highlight. */
  active: 'geo' | 'kviz' | 'ko-sam-ja' | 'tajni-agenti' | 'scenariji';
  /** Page-specific CSS appended after the base styles. */
  extraCss?: string;
  /** HTML rendered inside #view-main (hidden until the token unlocks). */
  body: string;
  /** Page JS (no backticks / dollar-brace!), runs after the Admin runtime. */
  script: string;
}

export const ADMIN_NAV_LINKS: ReadonlyArray<[key: string, href: string, label: string]> = [
  ['geo', '/admin/geo', 'Geo'],
  ['kviz', '/admin/kviz', 'Kviz'],
  ['ko-sam-ja', '/admin/ko-sam-ja', 'Ko sam ja'],
  ['tajni-agenti', '/admin/tajni-agenti', 'Tajni agenti'],
  ['scenariji', '/admin/tajni-agenti-scenariji', 'Scenariji'],
];

export function renderAdminNav(active: string): string {
  const links = ADMIN_NAV_LINKS.map(
    ([key, href, label]) =>
      `<a href="${href}"${key === active ? ' class="active"' : ''}>${label}</a>`
  ).join('\n');
  return `<nav class="admin-nav">\n${links}\n</nav>`;
}

export const ADMIN_NAV_CSS = `
.admin-nav{display:flex;gap:0.4rem;flex-wrap:wrap;margin:0.6rem 0 1rem}
.admin-nav a{padding:0.35rem 0.85rem;border-radius:9px;font-size:0.85rem;font-weight:600;text-decoration:none;color:var(--muted);border:1px solid var(--line)}
.admin-nav a:hover{color:var(--ink);border-color:var(--line2)}
.admin-nav a.active{background:var(--grad);color:#F5EBE0;border-color:transparent}
`;

export function renderAdminPage(opts: AdminPageOptions): string {
  return `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title} · Igra Na Klik</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Marcellus&family=Marcellus+SC&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{
  /* zabari.net brand — cream canvas, navy voice, gold as light */
  --bg:#F5EBE0;--surface:#FAF6F0;--surface2:#EDE3D7;
  --line:rgba(29,53,87,.14);--line2:rgba(29,53,87,.26);
  --ink:#2B2B2B;--muted:#6E6A5E;--dim:#9B9488;
  --pink:#B85C4F;--violet:#5C6FA6;--cyan:#3E7F7B;--amber:#A07D2E;
  --green:#3E7D57;--red:#B04A42;--blue:#3D639B;
  --gold:#C29B47;
  --grad:linear-gradient(120deg,#1D3557,#162E4E);
}
html,body{min-height:100%}
body{
  font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-weight:500;
  background:
    radial-gradient(1100px 600px at 50% -10%, rgba(194,155,71,.16), transparent 60%),
    var(--bg);
  color:var(--ink);-webkit-text-size-adjust:100%;
}
.wrap{max-width:1100px;margin:0 auto;padding:1.2rem 1rem 4rem}
h1{font-family:'Marcellus',Georgia,serif;font-size:1.5rem;font-weight:400;color:#1D3557;margin-bottom:0.2rem}
h1 .grad{color:var(--gold)}
h2{font-family:'Marcellus',Georgia,serif;font-size:1.1rem;font-weight:400;color:#1D3557;margin:1.4rem 0 0.7rem}
.sub{color:var(--muted);font-size:0.95rem;margin-bottom:1.2rem}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:1rem}
button{font:inherit;cursor:pointer;border:none;min-height:42px}
.btn{padding:0.55rem 1.1rem;border-radius:12px;font-weight:700;font-size:0.95rem}
.btn-primary{background:var(--grad);color:#F5EBE0;box-shadow:0 8px 20px rgba(29,53,87,.22)}
.btn-primary:disabled{background:var(--surface2);color:var(--dim);box-shadow:none;cursor:not-allowed}
.btn-ghost{background:transparent;color:var(--ink);border:1.5px solid var(--line2)}
.btn-danger{background:rgba(176,74,66,.1);color:var(--red);border:1px solid rgba(176,74,66,.45)}
.btn-sm{min-height:34px;padding:0.3rem 0.7rem;font-size:0.85rem;border-radius:9px}
input[type=text],input[type=number],textarea,select{
  font:inherit;width:100%;background:#FFFCF7;color:var(--ink);
  border:1.5px solid var(--line2);border-radius:11px;padding:0.55rem 0.75rem;min-height:42px;
}
textarea{resize:vertical;line-height:1.45}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(194,155,71,.22)}
label{display:block;font-family:'Marcellus SC','Marcellus',Georgia,serif;font-size:0.72rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--amber);margin:0.8rem 0 0.35rem}
.err{background:rgba(176,74,66,.1);border:1px solid rgba(176,74,66,.4);color:var(--red);border-radius:11px;padding:0.55rem 0.8rem;font-size:0.9rem;font-weight:600;margin:0.8rem 0;display:none}
.ok-msg{background:rgba(62,125,87,.12);border:1px solid rgba(62,125,87,.4);color:var(--green);border-radius:11px;padding:0.55rem 0.8rem;font-size:0.9rem;font-weight:600;margin:0.8rem 0;display:none}
.row{display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap}
.spacer{flex:1}
.pack-row{display:flex;align-items:center;gap:0.8rem;padding:0.7rem 0.9rem;background:var(--surface);border:1px solid var(--line);border-radius:13px;margin-bottom:0.5rem}
.pack-row .name{font-weight:800}
.pack-row .meta{color:var(--muted);font-size:0.8rem}
.badge{font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:7px;background:rgba(160,125,46,.14);color:var(--amber)}
.badge-ok{background:rgba(62,125,87,.14);color:var(--green)}
.hint{color:var(--dim);font-size:0.75rem;margin-top:0.3rem}
.top-actions{display:flex;gap:0.5rem;align-items:center;margin-bottom:0.8rem}
a.back{color:var(--muted);text-decoration:none;font-weight:800;font-size:0.85rem}
a.back:hover{color:var(--ink)}
.item-row{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:0.7rem 0.9rem;margin-bottom:0.5rem}
.item-row .txt{font-weight:700;font-size:0.9rem}
.item-row .meta{color:var(--muted);font-size:0.78rem;margin-top:0.2rem}
.tag{display:inline-block;font-size:0.65rem;font-weight:800;padding:1px 7px;border-radius:6px;background:var(--surface2);color:var(--muted);margin-right:0.3rem;text-transform:uppercase;letter-spacing:0.04em}
.tag-nsfw{background:rgba(176,74,66,.14);color:var(--red)}
.tag-cyan{background:rgba(62,127,123,.14);color:var(--cyan)}
${ADMIN_NAV_CSS}
${opts.extraCss ?? ''}
</style>
</head>
<body>
<div class="wrap">
  <h1>${opts.title} <span class="grad">· Igra Na Klik</span></h1>
  ${renderAdminNav(opts.active)}
  <p class="sub">${opts.subtitle}</p>
  <div class="err" id="err"></div>
  <div class="ok-msg" id="ok"></div>

  <!-- TOKEN GATE -->
  <div id="view-token" class="card" style="max-width:420px;display:none">
    <label for="token-input">Admin token</label>
    <input type="text" id="token-input" autocomplete="off" placeholder="ADMIN_TOKEN iz .env">
    <div style="margin-top:0.8rem">
      <button class="btn btn-primary" id="token-btn">Uđi</button>
    </div>
    <p class="hint">Token se čuva samo u ovom browseru (localStorage).</p>
  </div>

  <div id="view-main" style="display:none">
${opts.body}
  </div>
</div>

<script>
var Admin = (function(){
  'use strict';
  var TOKEN_KEY = 'igra-admin-token';
  var token = localStorage.getItem(TOKEN_KEY) || '';
  var errTimer = null, okTimer = null;

  function $(id){ return document.getElementById(id); }
  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function showErr(msg){
    var el = $('err'); el.textContent = msg; el.style.display = 'block';
    clearTimeout(errTimer); errTimer = setTimeout(function(){ el.style.display='none'; }, 6000);
  }
  function showOk(msg){
    var el = $('ok'); el.textContent = msg; el.style.display = 'block';
    clearTimeout(okTimer); okTimer = setTimeout(function(){ el.style.display='none'; }, 3000);
  }
  function gate(){
    localStorage.removeItem(TOKEN_KEY);
    $('view-token').style.display = 'block';
    $('view-main').style.display = 'none';
  }
  function unlock(){
    $('view-token').style.display = 'none';
    $('view-main').style.display = 'block';
  }
  function api(method, path, body){
    return fetch(path, {
      method: method,
      headers: body
        ? { 'Content-Type': 'application/json', 'X-Admin-Token': token }
        : { 'X-Admin-Token': token },
      body: body ? JSON.stringify(body) : undefined
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){
        if (res.status === 401) { gate(); throw new Error(data.error || 'Pogrešan token.'); }
        if (!res.ok) throw new Error(data.error || ('Greška ' + res.status));
        return data;
      });
    });
  }
  function start(listPath, onData){
    $('token-btn').onclick = function(){
      token = $('token-input').value.trim();
      if (!token) return;
      api('GET', listPath).then(function(data){
        localStorage.setItem(TOKEN_KEY, token);
        unlock();
        onData(data);
      }).catch(function(e){ showErr(e.message); });
    };
    $('token-input').addEventListener('keydown', function(e){
      if (e.key === 'Enter') $('token-btn').click();
    });
    if (token){
      api('GET', listPath).then(function(data){
        unlock();
        onData(data);
      }).catch(function(){ gate(); });
    } else {
      gate();
    }
  }
  return { $: $, esc: esc, api: api, showErr: showErr, showOk: showOk, start: start };
})();
</script>
<script>
${opts.script}
</script>
</body>
</html>`;
}
