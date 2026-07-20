/**
 * Unified admin single-page app, served at GET /admin. Replaces the
 * separate server-rendered editor pages (kviz, ko-sam-ja, tajni-agenti,
 * gluvo-doba, spijun, timinzi) with one page: a navy sidebar of games,
 * a client-side view switch, a pack-picker dropdown, a searchable/filterable
 * table for kviz + ko-sam-ja, a slide-in editor sheet, and
 * tailored views for the other content types.
 *
 * The backend API (content-admin.ts + timing-admin.ts) is unchanged; this page
 * talks to the same /api/admin/* endpoints.
 *
 * NOTE: the whole page is a single TS template literal, so the inline CSS/JS
 * MUST NOT contain a backtick or the dollar-brace sequence — string
 * concatenation only (same gotcha as every legacy editor page). The only
 * dollar-brace uses are real TS interpolations of pre-serialized constants
 * (ADMIN_VIEW_CSS, the gluvo role metadata JSON, wolf-count bounds).
 */

import {
  GLUVO_DOBA_PACK_ROLE_IDS,
  GLUVO_DOBA_ROLES,
  GLUVO_DOBA_TEAM_NAMES,
  GLUVO_DOBA_MIN_WOLVES,
  GLUVO_DOBA_MAX_WOLVES,
  KVIZ_CATEGORIES,
  type GluvoDobaRoleId,
} from '@igra/shared';

const GLUVO_EDITOR_ROLE_EMOJI: Record<GluvoDobaRoleId, string> = {
  vukodlak: '🐺', vampir: '🧛', todorac: '🐎', drekavac: '😱', bauk: '👹',
  zmaj: '🐉', vidovnjak: '🔮', zduhac: '🌪️', sudjaja: '🧵', knez: '👑',
  raskovnik: '🌿', bajacica: '🕯️', vila: '🧚', domacin: '🌾', lesnik: '🌲', morana: '❄️',
};

/** Role metadata injected once into the page as a JSON literal (Faza 2 gluvo view). */
const GLUVO_ROLE_META_JSON = JSON.stringify(
  GLUVO_DOBA_PACK_ROLE_IDS.map((id) => ({
    id,
    name: GLUVO_DOBA_ROLES[id].name,
    team: GLUVO_DOBA_ROLES[id].team,
    teamName: GLUVO_DOBA_TEAM_NAMES[GLUVO_DOBA_ROLES[id].team],
    emoji: GLUVO_EDITOR_ROLE_EMOJI[id],
    desc: GLUVO_DOBA_ROLES[id].description,
  }))
);

/** Kviz category taxonomy injected once into the page as a JSON literal. */
const KVIZ_CATEGORIES_JSON = JSON.stringify(KVIZ_CATEGORIES);

export function renderAdminApp(): string {
  return `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin · Igra Na Klik</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#F5EBE0;--surface:#FAF6F0;--surface2:#EDE3D7;--surface3:#FFFCF7;
  --line:rgba(29,53,87,.14);--line2:rgba(29,53,87,.26);
  --ink:#2B2B2B;--navy:#1D3557;--muted:#6E6A5E;--dim:#9B9488;
  --pink:#B85C4F;--violet:#5C6FA6;--cyan:#3E7F7B;--amber:#A07D2E;
  --green:#3E7D57;--red:#B04A42;--blue:#3D639B;--gold:#C29B47;
  --grad:linear-gradient(120deg,#1D3557,#162E4E);
}
html,body{min-height:100%}
body{font-family:'Manrope','Segoe UI',system-ui,sans-serif;font-weight:500;color:var(--ink);-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:rgba(29,53,87,.22);border-radius:8px}
a{color:var(--navy);text-decoration:none}
button{font:inherit;cursor:pointer;border:none}
input,textarea,select{font:inherit}
@keyframes sheetIn{from{transform:translateX(30px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes menuIn{from{transform:translateY(-6px);opacity:0}to{transform:translateY(0);opacity:1}}

/* ---- shell ---- */
.app-shell{display:grid;grid-template-columns:264px 1fr;min-height:100vh;
  background:radial-gradient(1200px 640px at 78% -12%,rgba(194,155,71,.14),transparent 60%),var(--bg)}
.app-side{display:flex;flex-direction:column;gap:.5rem;background:linear-gradient(160deg,#1D3557,#14283F);
  color:#F5EBE0;padding:1.2rem 1rem;position:sticky;top:0;height:100vh;overflow-y:auto;box-shadow:2px 0 24px rgba(20,40,63,.28)}
.app-brandwrap{display:flex;align-items:center;gap:.65rem;padding:.1rem .3rem .9rem}
.app-brandwrap img{flex:none;filter:drop-shadow(0 3px 8px rgba(0,0,0,.3))}
.brand-name{font-family:'Baloo 2';font-weight:700;font-size:1.12rem;letter-spacing:.01em}
.brand-sub{font-size:.66rem;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);font-weight:700;margin-top:2px}
.side-label{font-size:.62rem;letter-spacing:.2em;text-transform:uppercase;color:rgba(245,235,224,.5);font-weight:700;padding:.3rem .5rem .1rem}
.app-nav{display:flex;flex-direction:column;gap:.15rem}
.app-nav a{display:flex;align-items:center;gap:.6rem;color:rgba(245,235,224,.82);background:transparent;border-radius:11px;
  padding:.55rem .6rem;font-weight:700;font-size:.9rem;position:relative;transition:background .15s;cursor:pointer}
.app-nav a:hover{background:rgba(245,235,224,.08)}
.app-nav a.active{color:#FFFDF9;background:rgba(194,155,71,.20)}
.app-nav a .nbar{width:4px;height:20px;border-radius:3px;background:transparent;flex:none}
.app-nav a.active .nbar{background:var(--gold)}
.app-nav a .nicon{font-size:1.05rem;width:1.4rem;text-align:center;flex:none}
.app-nav a .nlabel{flex:1;white-space:nowrap}
.app-nav a .npill{font-size:.72rem;font-weight:800;padding:1px 8px;border-radius:20px;background:rgba(245,235,224,.13);color:rgba(245,235,224,.7)}
.app-nav a.active .npill{background:var(--gold);color:#22303f}
.side-spacer{flex:1}
.side-foot{border-top:1px solid rgba(245,235,224,.14);padding-top:.8rem;margin-top:.4rem}
.side-foot-inner{display:flex;align-items:center;gap:.55rem;padding:.4rem .5rem;border-radius:11px;background:rgba(62,125,87,.22)}
.side-dot{width:9px;height:9px;border-radius:50%;background:#8FD3A8;box-shadow:0 0 0 3px rgba(143,211,168,.25);flex:none}
.side-foot .t1{font-size:.78rem;font-weight:800}
.side-foot .t2{font-size:.66rem;color:rgba(245,235,224,.6)}
.side-exit{font-size:.72rem;font-weight:700;color:rgba(245,235,224,.75);cursor:pointer;background:none}

.app-main{padding:1.6rem 2rem 5rem;min-width:0;overflow-x:hidden}
.eyebrow{font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;color:var(--amber);font-weight:800;margin-bottom:.3rem}
@media (max-width:860px){
  /* Single column → header + main become grid ROWS. Pin the header row to its
     content (auto) and let main take the rest; otherwise align-content's
     default "stretch" distributes the min-height:100vh leftover space to BOTH
     rows, inflating the header whenever a view's content is short (e.g. Špijun). */
  .app-shell{grid-template-columns:1fr;grid-template-rows:auto 1fr}
  .app-side{position:sticky;top:0;z-index:20;flex-direction:row;align-items:center;overflow-x:auto;height:auto;min-height:0;padding:.6rem .8rem;gap:.5rem}
  .app-side .side-label,.side-foot,.side-spacer{display:none}
  .app-nav{flex-direction:row;flex-wrap:nowrap;gap:.35rem}
  .app-nav a .nlabel{display:none}
  .app-brandwrap{flex:none;padding:.1rem .3rem}
  .app-main{padding:1.1rem 1rem 5rem}
  .sheet{width:100vw}
  .picker-btn{min-width:0;width:100%}
}

/* ---- toasts ---- */
.toast{position:fixed;right:1.2rem;bottom:1.2rem;z-index:120;max-width:min(420px,90vw);
  border-radius:12px;padding:.65rem .95rem;font-size:.9rem;font-weight:700;display:none;box-shadow:0 10px 30px rgba(20,40,63,.25)}
.toast.err{background:#2a1215;color:#ff9b90;border:1px solid #5c2b2e}
.toast.ok{background:rgba(62,125,87,.95);color:#eafaf0;border:1px solid #2f6046}

/* ---- token gate ---- */
.gate-wrap{min-height:100vh;display:grid;place-items:center;padding:1.5rem;
  background:radial-gradient(1000px 560px at 50% -10%,rgba(194,155,71,.18),transparent 60%),var(--bg)}
.gate-card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:1.6rem;width:min(420px,100%);
  box-shadow:0 20px 50px rgba(20,40,63,.14)}
.gate-card h1{font-size:1.3rem;font-weight:800;color:var(--navy);margin-bottom:.2rem}
.gate-card .sub{color:var(--muted);font-size:.9rem;margin-bottom:1rem}
.gate-card .hint{color:var(--dim);font-size:.78rem;margin-top:.7rem}

/* ---- shared controls ---- */
.field{width:100%;background:var(--surface3);color:var(--ink);border:1.5px solid var(--line2);border-radius:11px;padding:.55rem .75rem;min-height:42px}
.field:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(194,155,71,.2)}
.btn{padding:.55rem 1.1rem;border-radius:12px;font-weight:700;font-size:.92rem;min-height:42px}
.btn-primary{background:var(--grad);color:#F5EBE0;box-shadow:0 8px 20px rgba(29,53,87,.22)}
.btn-primary:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
.btn-ghost{background:transparent;color:var(--navy);border:1.5px solid var(--line2)}
.btn-danger{background:rgba(176,74,66,.08);color:var(--red);border:1.5px solid rgba(176,74,66,.35)}
.btn-sm{min-height:34px;padding:.4rem .85rem;font-size:.85rem;border-radius:11px}
.lbl{display:block;font-weight:800;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--amber);margin:1rem 0 .35rem}
.hint{color:var(--dim);font-size:.78rem;margin-top:.35rem}
.empty{padding:2.4rem 1rem;text-align:center;color:var(--dim);font-size:.9rem}

/* ---- pack picker ---- */
.picker-bar{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:1.2rem}
.picker{position:relative}
.picker-btn{display:flex;align-items:center;gap:.5rem;background:var(--surface);border:1.5px solid rgba(29,53,87,.2);border-radius:12px;
  padding:.5rem .85rem;min-width:0;max-width:100%;text-align:left;box-shadow:0 2px 10px rgba(29,53,87,.05)}
.picker-btn .pk-name{font-weight:800;font-size:1rem;color:var(--navy);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.picker-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:31;min-width:340px;background:var(--surface3);
  border:1px solid rgba(29,53,87,.16);border-radius:14px;box-shadow:0 20px 48px rgba(20,40,63,.22);padding:.4rem;animation:menuIn .14s ease}
.picker-scrim{position:fixed;inset:0;z-index:30}
.pk-opt{width:100%;display:flex;align-items:center;gap:.6rem;background:transparent;border-radius:10px;padding:.55rem .6rem;text-align:left}
.pk-opt:hover{background:rgba(194,155,71,.10)}
.pk-opt.on{background:rgba(194,155,71,.14)}
.pk-opt .o-name{display:block;font-weight:700;color:var(--navy)}
.pk-opt .o-meta{display:block;font-size:.75rem;color:var(--muted)}
.pk-opt .o-dot{width:8px;height:8px;border-radius:50%;flex:none}
.pk-sep{border-top:1px solid rgba(29,53,87,.1);margin:.35rem 0}
.pk-cat{font-size:.7rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);padding:.5rem .6rem .2rem}
.pk-new{width:100%;display:flex;align-items:center;gap:.5rem;background:transparent;border-radius:10px;padding:.55rem .6rem;color:var(--navy);font-weight:800}
.pk-new:hover{background:rgba(194,155,71,.10)}
.badge{display:inline-flex;align-items:center;gap:.3rem;font-size:.72rem;font-weight:800;padding:4px 11px;border-radius:20px}
.badge-ok{background:rgba(62,125,87,.14);color:var(--green)}
.badge-draft{background:rgba(160,125,46,.16);color:var(--amber)}

/* per-phase view CSS is appended below in ADMIN_VIEW_CSS */
${ADMIN_VIEW_CSS}
</style>
</head>
<body>

<!-- TOKEN GATE -->
<div id="gate" class="gate-wrap" style="display:none">
  <div class="gate-card">
    <h1>Admin</h1>
    <p class="sub">Igra Na Klik — uređivač sadržaja</p>
    <label class="lbl" for="token-input">Admin token</label>
    <input type="text" id="token-input" class="field" autocomplete="off" placeholder="ADMIN_TOKEN iz .env">
    <div style="margin-top:.9rem"><button class="btn btn-primary" id="token-btn">Uđi</button></div>
    <p class="hint">Token se čuva samo u ovom browseru (localStorage).</p>
  </div>
</div>

<!-- APP -->
<div id="app" class="app-shell" style="display:none">
  <aside class="app-side">
    <div class="app-brandwrap">
      <img src="/favicon.svg" alt="" width="42" height="42">
      <div style="line-height:1.05"><div class="brand-name">Igra Na Klik</div><div class="brand-sub">Admin</div></div>
    </div>
    <div class="side-label">Igre</div>
    <nav class="app-nav" id="app-nav"></nav>
    <div class="side-spacer"></div>
    <div class="side-foot">
      <div class="side-foot-inner">
        <span class="side-dot"></span>
        <div style="flex:1;line-height:1.15"><div class="t1">Otključano</div><div class="t2">Admin token aktivan</div></div>
        <button class="side-exit" id="exit-btn">Izađi</button>
      </div>
    </div>
  </aside>

  <main class="app-main">
    <div class="eyebrow" id="eyebrow"></div>
    <div id="picker-bar" class="picker-bar"></div>
    <div id="view-host"></div>
  </main>
</div>

<!-- SHEET HOST (filled by JS) -->
<div id="sheet-host"></div>

<div class="toast err" id="err"></div>
<div class="toast ok" id="ok"></div>

<script>
/* ============ Admin runtime (from admin-shell.ts, unchanged behavior) ============ */
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
  function getToken(){ return token; }
  function setToken(t){ token = t; localStorage.setItem(TOKEN_KEY, t); }
  function clearToken(){ token = ''; localStorage.removeItem(TOKEN_KEY); }
  function api(method, path, body){
    return fetch(path, {
      method: method,
      headers: body
        ? { 'Content-Type': 'application/json', 'X-Admin-Token': token }
        : { 'X-Admin-Token': token },
      body: body ? JSON.stringify(body) : undefined
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){
        if (res.status === 401) { throw new Error(data.error || 'Pogrešan token.'); }
        if (!res.ok) throw new Error(data.error || ('Greška ' + res.status));
        return data;
      });
    });
  }
  return { $:$, esc:esc, api:api, showErr:showErr, showOk:showOk,
    getToken:getToken, setToken:setToken, clearToken:clearToken };
})();

/* Kviz category taxonomy (shared with the in-game picker). */
var KVIZ_CATS = ${KVIZ_CATEGORIES_JSON};
function kvizCatById(id){
  for (var i=0;i<KVIZ_CATS.length;i++) if (KVIZ_CATS[i].id===id) return KVIZ_CATS[i];
  return KVIZ_CATS[KVIZ_CATS.length-1]; /* 'ostalo' fallback */
}

/* ============ App core ============ */
(function(){
  'use strict';
  var $ = Admin.$, esc = Admin.esc, api = Admin.api;
  var showErr = Admin.showErr, showOk = Admin.showOk;

  // Game registry. route = /api/admin/<route>, kind picks the view module.
  var GAMES = [
    { id:'kviz',         label:'Kviz',         icon:'❓', route:'quiz-packs',         listKey:'packs', kind:'table',  itemNoun:'pitanja' },
    { id:'ko-sam-ja',    label:'Ko sam ja',    icon:'🧠', route:'ko-sam-ja-packs',    listKey:'packs', kind:'table',  itemNoun:'pitanja' },
    { id:'tajni-agenti', label:'Tajni agenti', icon:'🕵️', route:'tajni-agenti-packs', listKey:'packs', kind:'tajni',  itemNoun:'reči' },
    { id:'gluvo-doba',   label:'Gluvo doba',   icon:'🌙', route:'gluvo-doba-packs',   listKey:'packs', kind:'gluvo',  itemNoun:'uloga' },
    { id:'spijun',       label:'Špijun',       icon:'🔍', route:'spijun-packs',       listKey:'packs', kind:'spijun', itemNoun:'lokacija' },
    { id:'prigovori',    label:'Prigovori',    icon:'🚩', route:null,                 listKey:null,    kind:'feedback', itemNoun:'' },
    { id:'timinzi',      label:'Timinzi',      icon:'⏱️', route:null,                 listKey:null,    kind:'timinzi', itemNoun:'' },
    { id:'podaci',       label:'Podaci',       icon:'💾', route:null,                 listKey:null,    kind:'data',    itemNoun:'' }
  ];
  function gameById(id){ for (var i=0;i<GAMES.length;i++) if (GAMES[i].id===id) return GAMES[i]; return GAMES[0]; }

  // Modules are registered by later phases via App.register(kind, module).
  // A module: { renderMain(host, ctx), packMeta(pack) }.  ctx exposes shared
  // helpers (see App below). Kind 'timinzi' has no pack picker.
  var MODULES = {};

  var state = {
    game: 'kviz',
    packsByGame: {},   // gameId -> array of pack summaries
    packIdByGame: {},  // gameId -> selected pack id
    pickerOpen: false
  };

  function curGame(){ return gameById(state.game); }
  function curPacks(){ return state.packsByGame[state.game] || []; }
  function curPackId(){ return state.packIdByGame[state.game] || null; }
  function curPack(){
    var id = curPackId(); var list = curPacks();
    for (var i=0;i<list.length;i++) if (list[i].id===id) return list[i];
    return null;
  }
  function packDisplayName(p){ return (p && (p.name || p.id)) || '—'; }
  function packMetaText(p, g){
    if (!p) return '';
    var n = (typeof p.count === 'number') ? p.count : 0;
    return n + ' ' + g.itemNoun;
  }

  // ---- sidebar ----
  function renderNav(){
    var nav = $('app-nav');
    nav.innerHTML = '';
    GAMES.forEach(function(g){
      var a = document.createElement('a');
      a.className = state.game === g.id ? 'active' : '';
      a.title = g.label;
      var count = '';
      if (g.route){
        var list = state.packsByGame[g.id];
        var n = list ? list.length : 0;
        count = '<span class="npill">' + n + '</span>';
      }
      a.innerHTML = '<span class="nbar"></span><span class="nicon">' + g.icon + '</span>'
        + '<span class="nlabel">' + esc(g.label) + '</span>' + count;
      a.onclick = function(e){ e.preventDefault(); setGame(g.id); };
      nav.appendChild(a);
    });
  }

  // ---- pack picker bar ----
  function renderPicker(){
    var bar = $('picker-bar');
    var g = curGame();
    if (!g.route){ bar.innerHTML = ''; return; }  // timinzi has no packs
    var packs = curPacks();
    var cur = curPack();
    var html = '<div class="picker"><button class="picker-btn" id="pk-toggle">'
      + '<span class="pk-name">' + esc(cur ? packDisplayName(cur) : 'Nema packa') + '</span>'
      + '<span style="font-size:.85rem;color:var(--dim)">▾</span></button>';
    if (state.pickerOpen){
      html += '<div class="picker-scrim" id="pk-scrim"></div><div class="picker-menu">';
      if (packs.length === 0){
        html += '<div class="empty" style="padding:1rem">Nema packova.</div>';
      }
      function packOpt(p){
        return '<button class="pk-opt' + (p.id===curPackId()?' on':'') + '" data-pk="' + esc(p.id) + '">'
          + '<span style="flex:1;min-width:0"><span class="o-name">' + esc(packDisplayName(p)) + '</span>'
          + '<span class="o-meta">' + esc(packMetaText(p, g)) + '</span></span>'
          + '<span class="o-dot" style="background:' + (p.visibleInGame?'#3E7D57':'#A07D2E') + '"></span></button>';
      }
      if (g.id === 'kviz'){
        // Group by category, in KVIZ_CATS order; skip empty sections.
        KVIZ_CATS.forEach(function(cat){
          var inCat = packs.filter(function(p){ return kvizCatById(p.category).id === cat.id; });
          if (!inCat.length) return;
          html += '<div class="pk-cat">' + esc(cat.icon + ' ' + cat.label) + '</div>';
          inCat.forEach(function(p){ html += packOpt(p); });
        });
      } else {
        packs.forEach(function(p){ html += packOpt(p); });
      }
      html += '<div class="pk-sep"></div><button class="pk-new" id="pk-new">＋ Novi pack</button></div>';
    }
    html += '</div>';
    if (cur){
      var pmod = MODULES[g.kind];
      var showSet = pmod && pmod.hasSettings && pmod.hasSettings(g);
      if (showSet) html += '<button class="btn btn-ghost btn-sm" id="pk-settings">⚙ Podaci</button>';
      html += '<button class="btn btn-danger btn-sm" id="pk-delete">🗑 Obriši pack</button>';
    }
    bar.innerHTML = html;
    wirePicker();
  }

  function wirePicker(){
    var tgl = $('pk-toggle');
    if (tgl) tgl.onclick = function(){ state.pickerOpen = !state.pickerOpen; renderPicker(); };
    var scrim = $('pk-scrim');
    if (scrim) scrim.onclick = function(){ state.pickerOpen = false; renderPicker(); };
    var opts = document.querySelectorAll('.pk-opt');
    for (var i=0;i<opts.length;i++){
      opts[i].onclick = function(){
        var id = this.getAttribute('data-pk');
        state.packIdByGame[state.game] = id;
        state.pickerOpen = false;
        renderAll();
      };
    }
    var nw = $('pk-new'); if (nw) nw.onclick = function(){ state.pickerOpen = false; createPackFlow(); };
    var st = $('pk-settings'); if (st) st.onclick = function(){ openSettings(); };
    var del = $('pk-delete'); if (del) del.onclick = function(){ deletePackFlow(); };
  }

  function createPackFlow(){
    var g = curGame();
    var name = window.prompt('Naziv novog packa:');
    if (name == null) return;
    name = name.trim();
    if (!name){ showErr('Unesi naziv packa.'); return; }
    api('POST', '/api/admin/' + g.route, { name: name }).then(function(data){
      var list = curPacks().slice();
      list.push(data.item);
      list.sort(function(a,b){ return a.id < b.id ? -1 : 1; });
      state.packsByGame[state.game] = list;
      state.packIdByGame[state.game] = data.item.id;
      renderAll();
      showOk('Pack napravljen.');
    }).catch(function(e){ showErr(e.message); });
  }

  function deletePackFlow(){
    var g = curGame(); var p = curPack();
    if (!p) return;
    if (!window.confirm('Obrisati pack "' + packDisplayName(p) + '"?')) return;
    api('DELETE', '/api/admin/' + g.route + '/' + p.id).then(function(){
      var list = curPacks().filter(function(x){ return x.id !== p.id; });
      state.packsByGame[state.game] = list;
      state.packIdByGame[state.game] = list.length ? list[0].id : null;
      renderAll();
      showOk('Pack obrisan.');
    }).catch(function(e){ showErr(e.message); });
  }

  // Settings panel is provided by the table module (name/desc[/maps]); default
  // is a simple name editor. Modules may override ctx-level via openSettings.
  function openSettings(){
    var mod = MODULES[curGame().kind];
    if (mod && mod.openSettings){ mod.openSettings(ctx()); return; }
    showErr('Podešavanja nisu dostupna za ovu igru.');
  }

  // ---- main render ----
  function renderMain(){
    var host = $('view-host');
    var g = curGame();
    var mod = MODULES[g.kind];
    if (!mod){ host.innerHTML = '<div class="empty">TODO: ' + esc(g.label) + '</div>'; return; }
    mod.renderMain(host, ctx());
  }

  function renderAll(){
    $('eyebrow').textContent = curGame().label;
    renderNav();
    renderPicker();
    renderMain();
  }

  function setGame(id){
    state.game = id;
    state.pickerOpen = false;
    var g = curGame();
    // Timinzi has its own load; packs games load on demand if not cached.
    if (g.route && !state.packsByGame[id]){
      loadPacks(id).then(renderAll).catch(function(e){ showErr(e.message); });
    }
    renderAll();
  }

  function loadPacks(gameId){
    var g = gameById(gameId);
    return api('GET', '/api/admin/' + g.route).then(function(data){
      var list = (g.listKey ? data[g.listKey] : data) || [];
      state.packsByGame[gameId] = list;
      if (!state.packIdByGame[gameId] && list.length) state.packIdByGame[gameId] = list[0].id;
      return list;
    });
  }

  // ---- shared context passed to modules ----
  function ctx(){
    return {
      $:$, esc:esc, api:api, showErr:showErr, showOk:showOk,
      game: curGame(), pack: curPack(), packs: curPacks(),
      // Replace the current pack summary in state after a PUT and re-render.
      updatePack: function(item){
        var list = curPacks().slice();
        for (var i=0;i<list.length;i++) if (list[i].id===item.id){ list[i]=item; break; }
        state.packsByGame[state.game] = list;
        renderAll();
      },
      renderAll: renderAll,
      // Whole-file PUT helper (modules build the body).
      putPack: function(body, okMsg){
        var g = curGame(); var p = curPack();
        if (!p) return Promise.reject(new Error('Nema packa.'));
        return api('PUT', '/api/admin/' + g.route + '/' + p.id, body).then(function(data){
          var list = curPacks().slice();
          for (var i=0;i<list.length;i++) if (list[i].id===data.item.id){ list[i]=data.item; break; }
          state.packsByGame[state.game] = list;
          renderAll();
          if (okMsg) showOk(okMsg);
          return data.item;
        });
      },
      // Slide-in sheet host helpers (Faza 1).
      sheetHost: $('sheet-host')
    };
  }

  // Public registration surface for view modules.
  window.AdminApp = {
    register: function(kind, mod){ MODULES[kind] = mod; },
    ctx: ctx, renderAll: renderAll,
    // Switch to a game tab and (optionally) select a pack — used by the
    // Prigovori view to jump to a reported question's pack.
    goToPack: function(gameId, packId){
      state.game = gameId;
      state.pickerOpen = false;
      var g = gameById(gameId);
      function finish(){ if (packId) state.packIdByGame[gameId] = packId; renderAll(); }
      if (g.route && !state.packsByGame[gameId]){
        loadPacks(gameId).then(finish).catch(finish);
      } else { finish(); }
    },
    // Force-refresh a game's pack list from the server (used after importing a
    // new pack in the Podaci tab so it appears without a full reload).
    reloadPacks: function(gameId){
      return loadPacks(gameId).then(function(){ if(state.game===gameId) renderAll(); }).catch(function(){});
    }
  };

  // ---- boot / token gate ----
  function showGate(){ $('gate').style.display='grid'; $('app').style.display='none'; }
  function showApp(){ $('gate').style.display='none'; $('app').style.display='grid'; }

  function boot(){
    // Load the default game's packs first, then lazily fill counts for others.
    loadPacks('kviz').then(function(){
      showApp();
      renderAll();
      // Background: fetch other games' pack lists so sidebar counts show.
      GAMES.forEach(function(g){
        if (g.route && g.id !== 'kviz' && !state.packsByGame[g.id]){
          loadPacks(g.id).then(function(){ renderNav(); if (state.game===g.id) renderAll(); })
            .catch(function(){});
        }
      });
    }).catch(function(){ Admin.clearToken(); showGate(); });
  }

  $('token-btn').onclick = function(){
    var t = $('token-input').value.trim();
    if (!t) return;
    Admin.setToken(t);
    boot();
  };
  $('token-input').addEventListener('keydown', function(e){ if (e.key==='Enter') $('token-btn').click(); });
  $('exit-btn').onclick = function(){ Admin.clearToken(); showGate(); };

  if (Admin.getToken()) boot(); else showGate();
})();
</script>

<script>
/* ============ Table + sheet module (kviz + ko-sam-ja) ============ */
(function(){
  'use strict';
  var $ = Admin.$, esc = Admin.esc, api = Admin.api;
  var showErr = Admin.showErr, showOk = Admin.showOk;

  var KVIZ_TYPES = {
    obicno:{icon:'❓',label:'Obično',color:'#5C6FA6',bg:'rgba(92,111,166,.13)'},
    audio: {icon:'🎵',label:'Audio', color:'#3E7F7B',bg:'rgba(62,127,123,.13)'},
    video: {icon:'🎬',label:'Video', color:'#B85C4F',bg:'rgba(184,92,79,.13)'},
    geo:   {icon:'🗺️',label:'Geo',   color:'#3E7D57',bg:'rgba(62,125,87,.13)'},
    broj:  {icon:'🔢',label:'Broj',  color:'#A07D2E',bg:'rgba(160,125,46,.14)'},
    emoji: {icon:'😀',label:'Emoji', color:'#8A5CA6',bg:'rgba(138,92,166,.13)'},
    uljez: {icon:'🕵️',label:'Uljez', color:'#6E4B7E',bg:'rgba(110,75,126,.13)'},
    dopuna:{icon:'✍️',label:'Citat', color:'#3E6F9F',bg:'rgba(62,111,159,.13)'},
    piksel:{icon:'🧩',label:'Piksel',color:'#8F6A3C',bg:'rgba(143,106,60,.14)'},
    anagram:{icon:'🔀',label:'Anagram',color:'#4E7A46',bg:'rgba(78,122,70,.13)'},
    redosled:{icon:'↕️',label:'Redosled',color:'#9A5252',bg:'rgba(154,82,82,.13)'}
  };
  var KO_TYPES = {
    fixed:{icon:'📌',label:'Fiksno',   color:'#5C6FA6',bg:'rgba(92,111,166,.13)'},
    free: {icon:'✍️',label:'Slobodno', color:'#3E7F7B',bg:'rgba(62,127,123,.13)'},
    peer: {icon:'👥',label:'Igrač',    color:'#B85C4F',bg:'rgba(184,92,79,.13)'},
    pickN:{icon:'☑️',label:'Izaberi N',color:'#A07D2E',bg:'rgba(160,125,46,.14)'}
  };
  var TIME_DEFAULTS = { obicno:15, audio:15, video:15, geo:30, broj:25, emoji:20, uljez:15, dopuna:20, piksel:25, anagram:25, redosled:35 };
  function typesFor(g){ return g.id==='kviz'?KVIZ_TYPES:KO_TYPES; }
  function discKey(g){ return g.id==='kviz'?'type':'shape'; }
  function typeOf(g,q){ return q[discKey(g)] || (g.id==='kviz'?'obicno':'fixed'); }

  var PH_SUBJECT='{'+'subject}', PH_PEER='{'+'peer}', PH_PEER1='{'+'peer1}', PH_PEER2='{'+'peer2}';

  // Author tags (kviz only) — internal difficulty/NSFW metadata, never shown
  // to players. Order matches KVIZ_QUESTION_TAGS in shared.
  var KVIZ_TAG_DEFS=[
    {id:'easy',label:'Lako',color:'#3E7D57'},
    {id:'medium',label:'Srednje',color:'#A07D2E'},
    {id:'hard',label:'Teško',color:'#B85C4F'},
    {id:'nsfw',label:'NSFW',color:'#8A5CA6'}
  ];
  function tagLabel(id){ for(var i=0;i<KVIZ_TAG_DEFS.length;i++) if(KVIZ_TAG_DEFS[i].id===id) return KVIZ_TAG_DEFS[i]; return null; }

  // Player feedback (reports + ratings), fetched once, keyed pack:<id>:<index>.
  var feedbackCache=null, feedbackLoading=false;
  function fbKey(ctx,idx){ return 'pack:'+ctx.pack.id+':'+idx; }
  function fbFor(ctx,idx){ return (feedbackCache && ctx.pack && feedbackCache[fbKey(ctx,idx)]) || null; }
  function fbAvg(fb){ return (fb && fb.ratingCount>0) ? (fb.ratingSum/fb.ratingCount) : null; }
  function ensureFeedback(host,ctx){
    if (feedbackCache!==null || feedbackLoading) return;
    feedbackLoading=true;
    api('GET','/api/admin/quiz-feedback').then(function(d){ feedbackCache=d.feedback||{}; feedbackLoading=false; renderMain(host,ctx); })
      .catch(function(){ feedbackCache={}; feedbackLoading=false; });
  }
  function clearFeedback(ctx,idx){
    var k=fbKey(ctx,idx);
    api('POST','/api/admin/quiz-feedback/clear',{key:k}).then(function(){ if(feedbackCache)delete feedbackCache[k]; window.AdminApp.renderAll(); showOk('Feedback obrisan.'); })
      .catch(function(e){ showErr(e.message); });
  }

  // table state persists across re-renders; reset when switching game.
  var tv = { game:null, search:'', filter:'all', sort:'none' };

  function packMaps(ctx){ var p=ctx.pack; return (p && p.maps && typeof p.maps==='object')?p.maps:{}; }
  function fileUrl(ctx,name){ return '/kviz-files/'+ctx.pack.id+'/'+name; }
  function imgSrcOf(ctx,q){ if(q.imageUrl)return q.imageUrl; if(q.imageFile)return fileUrl(ctx,q.imageFile); return null; }

  function mediaTagFor(g,q,ctx){
    if (g.id!=='kviz') return '';
    var t=typeOf(g,q);
    if (t==='audio') return 'audio';
    if (t==='video') return 'video';
    if (imgSrcOf(ctx,q)) return 'slika';
    return '';
  }

  function answerLine(g,q){
    if (g.id==='kviz'){
      var t=typeOf(g,q);
      if (t==='geo'){
        var mapBit = q.mapId ? ' · mapa: '+esc(q.mapId) : ' · Srbija';
        return '📍 '+esc(q.caption||'(bez captiona)')+' · '+Number(q.lat).toFixed(3)+', '+Number(q.lng).toFixed(3)+mapBit;
      }
      if (t==='broj'){
        return '<span class="ok">✔ '+esc(String(q.answer))+'</span>'+(q.unit?' '+esc(q.unit):'')
          +' · opseg '+esc(String(q.min))+'–'+esc(String(q.max))+(q.valueType==='duration'?' · mm:ss':'');
      }
      if (t==='emoji'){
        var acc=(Array.isArray(q.accept)&&q.accept.length)?' · prihvata: '+q.accept.map(esc).join(', '):'';
        return esc(q.emojis||'')+' → <span class="ok">✔ '+esc(q.answer||'')+'</span>'+acc;
      }
      if (t==='dopuna'){
        var dacc=(Array.isArray(q.accept)&&q.accept.length)?' · prihvata: '+q.accept.map(esc).join(', '):'';
        return '„'+esc(q.quote||'')+' …" → <span class="ok">✔ '+esc(q.answer||'')+'</span>'+dacc;
      }
      if (t==='piksel'||t==='anagram'){
        var tacc=(Array.isArray(q.accept)&&q.accept.length)?' · prihvata: '+q.accept.map(esc).join(', '):'';
        return '<span class="ok">✔ '+esc(q.answer||'')+'</span>'+tacc;
      }
      if (t==='redosled'){
        var its=Array.isArray(q.items)?q.items:[];
        return its.map(function(x,xi){ return (xi+1)+'. '+esc(x); }).join(' · ');
      }
      var opts=Array.isArray(q.options)?q.options:[]; var out='';
      for (var j=0;j<opts.length;j++){ if(j>0)out+=' · '; out += (j===q.correctIndex)?('<span class="ok">'+(t==='uljez'?'🕵️':'✓')+' '+esc(opts[j])+'</span>'):esc(opts[j]); }
      if (t==='video') out+=' · ▶ '+esc(q.videoId||'');
      if (t==='audio') out+=' · 🎵 '+esc(q.audioFile||q.audioUrl||'');
      return out;
    }
    // ko-sam-ja
    var parts=[];
    if (Array.isArray(q.options)&&q.options.length) parts.push(q.options.map(esc).join(' · '));
    if (q.shape==='free') parts.push('slobodan unos'+(q.maxLength?' · max '+esc(q.maxLength):''));
    if (q.shape==='peer') parts.push('ime prisutnog igrača');
    if (q.shape==='pickN'){
      if (q.optionTemplate) parts.push('šablon: '+esc(q.optionTemplate));
      if (q.maxPeers) parts.push('max '+esc(q.maxPeers)+' igrača');
      if (Array.isArray(q.extraOptions)&&q.extraOptions.length) parts.push('+ '+q.extraOptions.map(esc).join(' · '));
    }
    return parts.join(' — ') || '—';
  }

  // ---------- table view ----------
  function renderMain(host, ctx){
    var g=ctx.game, p=ctx.pack;
    if (tv.game!==g.id){ tv.game=g.id; tv.search=''; tv.filter='all'; tv.sort='none'; }
    if (!p){ host.innerHTML='<div class="empty">Nema izabranog packa — napravi novi pack (dugme gore).</div>'; return; }
    var isKviz=(g.id==='kviz');
    if (isKviz) ensureFeedback(host,ctx);
    var TM=typesFor(g);
    var list=p.questions||[];
    var counts={all:list.length};
    for (var k in TM) counts[k]=0;
    var reportedCount=0;
    list.forEach(function(q,idx){ var t=typeOf(g,q); if(counts[t]!=null)counts[t]++; if(isKviz){ var fb=fbFor(ctx,idx); if(fb&&fb.reports>0)reportedCount++; } });

    var filtersHtml='<button class="chip-f'+(tv.filter==='all'?' on':'')+'" data-f="all">Sve <span class="c-n">'+counts.all+'</span></button>';
    for (var kk in TM){ filtersHtml+='<button class="chip-f'+(tv.filter===kk?' on':'')+'" data-f="'+kk+'">'+TM[kk].icon+' '+esc(TM[kk].label)+' <span class="c-n">'+(counts[kk]||0)+'</span></button>'; }
    if (isKviz){ filtersHtml+='<button class="chip-f'+(tv.filter==='reported'?' on':'')+'" data-f="reported" style="'+(reportedCount?'':'opacity:.55;')+'">🚩 Prijavljena <span class="c-n">'+reportedCount+'</span></button>'; }

    // Build display order (original indices), then sort by feedback if asked.
    var order=[]; for(var oi=0;oi<list.length;oi++) order.push(oi);
    if (isKviz && tv.sort!=='none'){
      order.sort(function(a,b){
        var fa=fbFor(ctx,a), fbb=fbFor(ctx,b);
        if (tv.sort==='reports') return (fbb?fbb.reports:0)-(fa?fa.reports:0);
        var av=fbAvg(fa), bv=fbAvg(fbb);
        if (tv.sort==='rating-asc'){ return (av==null?99:av)-(bv==null?99:bv); }
        return (bv==null?-1:bv)-(av==null?-1:av); // rating-desc
      });
    }

    var s=tv.search.trim().toLowerCase();
    var rowsHtml=''; var shown=0;
    order.forEach(function(idx){
      var q=list[idx];
      var t=typeOf(g,q);
      if (tv.filter==='reported'){ var fbr=fbFor(ctx,idx); if(!fbr||!fbr.reports) return; }
      else if (tv.filter!=='all' && t!==tv.filter) return;
      if (s && (q.text||'').toLowerCase().indexOf(s)<0 && (q.caption||'').toLowerCase().indexOf(s)<0
        && String(q.answer||'').toLowerCase().indexOf(s)<0 && (q.emojis||'').toLowerCase().indexOf(s)<0
        && (q.quote||'').toLowerCase().indexOf(s)<0
        && (Array.isArray(q.items)?q.items.join(' '):'').toLowerCase().indexOf(s)<0) return;
      shown++;
      var m=TM[t]||{icon:'•',label:t,color:'#6E6A5E',bg:'#eee'};
      var mt=mediaTagFor(g,q,ctx);
      var mtHtml = mt ? '<span class="t-mtag" style="color:'+m.color+';background:'+m.bg+'">'+mt+'</span>' : '';
      var catHtml = (g.id!=='kviz' && q.category) ? '<span class="t-mtag'+(q.category==='nsfw'?' tag-nsfw':'')+'" style="background:var(--surface2);color:var(--muted)">'+esc(q.category)+'</span>' : '';
      // Author tags (kviz) — internal, shown to admin only.
      var tagsHtml='';
      if (isKviz && Array.isArray(q.tags)){
        q.tags.forEach(function(tg){ var td=tagLabel(tg); if(td) tagsHtml+='<span class="t-mtag" style="color:'+td.color+';background:'+td.color+'22">'+esc(td.label)+'</span>'; });
      }
      // Feedback badges (kviz).
      var fbHtml='';
      if (isKviz){
        var fb=fbFor(ctx,idx);
        if (fb){
          if (fb.reports>0) fbHtml+='<span class="t-mtag" style="color:#B85C4F;background:rgba(184,92,79,.14)" title="Prijava kao netačno">🚩 '+fb.reports+'</span>';
          var avg=fbAvg(fb);
          if (avg!=null) fbHtml+='<span class="t-mtag" style="color:#8a6f2c;background:rgba(194,155,71,.16)" title="'+fb.ratingCount+' ocena">★ '+avg.toFixed(1)+' <span style="opacity:.7">('+fb.ratingCount+')</span></span>';
        }
      }
      var DEF_TEXTS = { geo:'Gde je ovo slikano?', emoji:'Šta se krije iza emojija?', uljez:'Pronađi uljeza!', dopuna:'Završi citat!', piksel:'Šta je na slici?', anagram:'Reši anagram!' };
      var text = q.text || DEF_TEXTS[t] || '(bez teksta)';
      var clearBtn = (isKviz && fbHtml) ? '<button class="iconbtn fbclear" title="Obriši feedback" data-idx="'+idx+'">✖🚩</button>' : '';
      rowsHtml += '<div class="tbl-row" data-idx="'+idx+'">'
        + '<div class="t-type"><span class="ti">'+m.icon+'</span><span class="tl" style="color:'+m.color+'">'+esc(m.label)+'</span></div>'
        + '<div class="t-main"><div class="t-line1"><span class="t-num">'+(idx+1)+'.</span>'
        + '<span class="t-text">'+esc(text)+'</span>'+mtHtml+catHtml+tagsHtml+fbHtml+'</div>'
        + '<div class="t-ans">'+answerLine(g,q)+'</div></div>'
        + '<div class="t-acts">'
        + (q.timeLimit && g.id!=='kviz' ? '<span class="t-time">⏱ '+esc(q.timeLimit)+'s</span>' : '')
        + clearBtn
        + '<button class="iconbtn dup" title="Dupliraj" data-idx="'+idx+'">⧉</button>'
        + '<button class="iconbtn edit" title="Izmeni" data-idx="'+idx+'">✎</button>'
        + '<button class="iconbtn del" title="Obriši" data-idx="'+idx+'">🗑</button></div></div>';
    });
    if (shown===0) rowsHtml='<div class="empty">'+(list.length?'Nema pitanja za ovaj filter.':'Prazan pack — dodaj prvo pitanje.')+'</div>';

    // Sort control lives on its own row so it never squeezes the type filters.
    var sortHtml='';
    if (isKviz){
      var so=[['none','— Redosled u packu —'],['reports','Najviše prijava'],['rating-asc','Najlošije ocenjena'],['rating-desc','Najbolje ocenjena']];
      sortHtml='<div class="tbl-sortbar"><span class="tbl-sortlbl">Sortiraj:</span><select class="tbl-sort" id="tbl-sort">';
      for(var si=0;si<so.length;si++) sortHtml+='<option value="'+so[si][0]+'"'+(tv.sort===so[si][0]?' selected':'')+'>'+so[si][1]+'</option>';
      sortHtml+='</select></div>';
    }

    host.innerHTML =
      '<div class="tbl-tools">'
      + '<div class="tbl-search"><span>🔎</span><input class="field" id="tbl-q" placeholder="Pretraži pitanja…" value="'+esc(tv.search)+'"></div>'
      + '<button class="btn btn-primary" id="tbl-new" style="margin-left:auto">＋ Novo pitanje</button></div>'
      + '<div class="tbl-filterbar"><div class="tbl-filters">'+filtersHtml+'</div></div>'
      + sortHtml
      + '<div class="tbl'+(g.id==='kviz'?' tbl-icont':'')+'"><div class="tbl-head"><span>Tip</span><span>Pitanje</span><span style="text-align:right">Radnje</span></div>'
      + rowsHtml + '</div>'
      + '<button class="add-row" id="tbl-add">＋ Dodaj pitanje</button>';

    // wiring
    var q=$('tbl-q');
    q.oninput=function(){ tv.search=this.value; var pos=this.selectionStart; renderMain(host,ctx); var nq=$('tbl-q'); if(nq){nq.focus(); try{nq.setSelectionRange(pos,pos);}catch(e){}} };
    var sortSel=$('tbl-sort'); if(sortSel) sortSel.onchange=function(){ tv.sort=this.value; renderMain(host,ctx); };
    var fbtns=host.querySelectorAll('.chip-f');
    for (var i=0;i<fbtns.length;i++) fbtns[i].onclick=function(){ tv.filter=this.getAttribute('data-f'); renderMain(host,ctx); };
    $('tbl-new').onclick=function(){ openSheet(ctx,null); };
    $('tbl-add').onclick=function(){ openSheet(ctx,null); };
    var edits=host.querySelectorAll('.iconbtn.edit');
    for (var e=0;e<edits.length;e++) edits[e].onclick=function(){ openSheet(ctx, parseInt(this.getAttribute('data-idx'),10)); };
    var dups=host.querySelectorAll('.iconbtn.dup');
    for (var d=0;d<dups.length;d++) dups[d].onclick=function(){ dupQuestion(ctx, parseInt(this.getAttribute('data-idx'),10)); };
    var dels=host.querySelectorAll('.iconbtn.del');
    for (var x=0;x<dels.length;x++) dels[x].onclick=function(){ delQuestion(ctx, parseInt(this.getAttribute('data-idx'),10)); };
    var fcs=host.querySelectorAll('.iconbtn.fbclear');
    for (var fci=0;fci<fcs.length;fci++) fcs[fci].onclick=function(){ if(window.confirm('Obrisati prijave i ocene za ovo pitanje?')) clearFeedback(ctx, parseInt(this.getAttribute('data-idx'),10)); };
  }

  function saveQuestions(ctx, questions, okMsg){
    var g=ctx.game, p=ctx.pack, body;
    if (g.id==='kviz'){
      body={ name: p.name || p.id, questions: questions };
      if (p.description) body.description=p.description;
      if (p.category) body.category=p.category;
      var maps=packMaps(ctx); if (Object.keys(maps).length) body.maps=maps;
    } else { body={ questions: questions }; }
    return ctx.putPack(body, okMsg);
  }
  function dupQuestion(ctx, idx){
    var arr=(ctx.pack.questions||[]).slice(); if(!arr[idx])return;
    arr.splice(idx+1,0,JSON.parse(JSON.stringify(arr[idx])));
    saveQuestions(ctx, arr, 'Pitanje duplirano.').catch(function(e){ showErr(e.message); });
  }
  function delQuestion(ctx, idx){
    if(!window.confirm('Obrisati ovo pitanje?'))return;
    var arr=(ctx.pack.questions||[]).slice(); arr.splice(idx,1);
    saveQuestions(ctx, arr, 'Pitanje obrisano.').catch(function(e){ showErr(e.message); });
  }

  // ---------- sheet chrome ----------
  function makeSheet(){
    var host=$('sheet-host'); host.innerHTML='';
    var scrim=document.createElement('div'); scrim.className='sheet-scrim';
    var sheet=document.createElement('div'); sheet.className='sheet';
    host.appendChild(scrim); host.appendChild(sheet);
    function close(){ host.innerHTML=''; document.removeEventListener('keydown',onKey); }
    function onKey(ev){ if(ev.key==='Escape') close(); }
    document.addEventListener('keydown',onKey);
    scrim.onclick=close;
    return { sheet:sheet, close:close };
  }

  // ---------- question sheet ----------
  function openSheet(ctx, editIndex){
    if (ctx.game.id==='kviz') openKvizSheet(ctx, editIndex);
    else openKoSheet(ctx, editIndex);
  }

  // ===== KVIZ SHEET =====
  function openKvizSheet(ctx, editIndex){
    var TM=KVIZ_TYPES;
    var existing = (editIndex!=null) ? (ctx.pack.questions||[])[editIndex] : null;
    var s=makeSheet(); var sheet=s.sheet, close=s.close;
    var qType = existing ? typeOf(ctx.game, existing) : 'obicno';
    var pend = { imageFile:null, imageUrl:null, audioFile:null, audioUrl:null };
    var geo = { pin:null, lat:null, lng:null, mapId:'', zoom:1, panX:0, panY:0 };
    var qTags = (existing && Array.isArray(existing.tags)) ? existing.tags.slice() : [];

    var tabs='';
    for (var k in TM) tabs+='<button class="sheet-tab" data-type="'+k+'">'+TM[k].icon+' '+esc(TM[k].label)+'</button>';
    var maps=packMaps(ctx);
    var mapOpts='<option value="">— Srbija (podrazumevano) —</option>';
    for (var mid in maps) mapOpts+='<option value="'+esc(mid)+'">'+esc(mid)+'</option>';

    sheet.innerHTML =
      '<div class="sheet-head"><div style="display:flex;align-items:center;gap:.6rem">'
      + '<div style="flex:1"><div class="sheet-eyebrow" id="sh-eyebrow"></div><div class="sheet-title" id="sh-title"></div></div>'
      + '<button class="sheet-x" id="sh-x">✕</button></div>'
      + '<div class="sheet-tabs" id="sh-tabs">'+tabs+'</div></div>'
      + '<div class="sheet-body">'
      + '<div id="grp-text"><label class="lbl" id="q-text-label">Tekst pitanja</label>'
      + '<textarea class="field" id="q-text" rows="2" placeholder="npr. Koja planeta je najbliža Suncu?"></textarea></div>'
      + '<div id="grp-choice"><label class="lbl" id="q-choice-label">Odgovori · označi tačan</label>'
      + choiceRow(0)+choiceRow(1)+choiceRow(2)+choiceRow(3)+'</div>'
      + '<div id="grp-dopuna"><label class="lbl">Vidljivi deo citata (bez skrivene reči)</label>'
      + '<textarea class="field" id="q-quote" rows="2" maxlength="300" placeholder="npr. Bolje vrabac u ruci nego golub na"></textarea>'
      + '<p class="hint">Igračima se prikazuje citat + praznina na kraju; kucaju reč koja nedostaje.</p></div>'
      + '<div id="grp-textans"><label class="lbl">Rešenje</label>'
      + '<input class="field" id="q-ta-answer" maxlength="60" placeholder="npr. grani">'
      + '<label class="lbl">Prihvaćeni odgovori (opciono, zarezom, do 8)</label>'
      + '<input class="field" id="q-ta-accept" placeholder="npr. na grani, grana">'
      + '<p class="hint">Poređenje ignoriše velika/mala slova, kvačice i interpunkciju, i toleriše sitne tipfelere.</p></div>'
      + '<div id="grp-redosled"><label class="lbl">Pojmovi u TAČNOM redosledu (jedan po redu, 3–10)</label>'
      + '<textarea class="field" id="q-items" rows="6" placeholder="Prvi svetski rat&#10;Drugi svetski rat&#10;Pad Berlinskog zida"></textarea>'
      + '<p class="hint">U igri se pojmovi mešaju; igrači ih ređaju na telefonu. Bodovi po tačnosti parova.</p></div>'
      + '<div id="grp-audio"><label class="lbl">Audio · mp3/ogg/m4a (max ~10 MB)</label>'
      + '<input type="file" id="q-audio-file" accept="audio/*" style="display:none">'
      + '<div class="dropzone"><div style="font-size:1.6rem">🎵</div>'
      + '<audio id="q-audio-preview" controls style="display:none;width:100%;margin:.5rem 0"></audio>'
      + '<div class="hint" id="q-audio-name" style="margin:.2rem 0"></div>'
      + '<button type="button" class="btn btn-ghost btn-sm" id="q-audio-pick">Izaberi audio</button>'
      + '<button type="button" class="btn btn-danger btn-sm" id="q-audio-remove" style="display:none">Ukloni</button></div></div>'
      + '<div id="grp-video"><label class="lbl">YouTube link ili video ID</label>'
      + '<input class="field" id="q-video-id" placeholder="npr. https://youtu.be/dQw4w9WgXcQ ili dQw4w9WgXcQ">'
      + '<img id="q-video-thumb" class="q-thumb" style="display:none" alt="">'
      + '<div class="num-grid" style="margin-top:.5rem"><label><span class="sub">Start (s, opciono)</span>'
      + '<input class="field" type="number" id="q-video-start" min="0" step="1" placeholder="0"></label>'
      + '<label><span class="sub">Kraj (s, opciono)</span><input class="field" type="number" id="q-video-end" min="1" step="1"></label></div></div>'
      + '<div id="grp-broj"><label class="lbl">Brojevi</label><div class="num-grid">'
      + '<label><span class="sub">Tačan odgovor</span><input class="field" type="number" id="q-broj-answer" step="any"></label>'
      + '<label><span class="sub">Min (klizač)</span><input class="field" type="number" id="q-broj-min" step="any"></label>'
      + '<label><span class="sub">Max (klizač)</span><input class="field" type="number" id="q-broj-max" step="any"></label>'
      + '<label><span class="sub">Korak (opciono)</span><input class="field" type="number" id="q-broj-step" step="any" placeholder="1"></label></div>'
      + '<div class="num-grid" style="margin-top:.5rem">'
      + '<label><span class="sub">Jedinica (din, kg…)</span><input class="field" id="q-broj-unit" maxlength="20"></label>'
      + '<label><span class="sub">Tip prikaza</span><select class="field" id="q-broj-valuetype"><option value="">Broj</option><option value="duration">Trajanje (mm:ss)</option></select></label>'
      + '<label><span class="sub">Emoji (opciono)</span><input class="field" id="q-broj-emoji" maxlength="8"></label></div></div>'
      + '<div id="grp-emoji"><label class="lbl">Emoji zagonetka</label>'
      + '<input class="field" id="q-emoji-emojis" maxlength="40" placeholder="npr. 🦁👑" style="font-size:1.3rem">'
      + '<label class="lbl">Rešenje</label>'
      + '<input class="field" id="q-emoji-answer" maxlength="60" placeholder="npr. Kralj lavova">'
      + '<label class="lbl">Prihvaćeni odgovori (opciono, zarezom, do 8)</label>'
      + '<input class="field" id="q-emoji-accept" placeholder="npr. The Lion King, Lion King">'
      + '<p class="hint">Poređenje ignoriše velika/mala slova, kvačice i interpunkciju. Slova rešenja se u igri postepeno otkrivaju kao hint.</p></div>'
      + '<div id="grp-geo"><label class="lbl">Caption / naziv lokacije</label>'
      + '<input class="field" id="q-caption" maxlength="200" placeholder="npr. Đavolja varoš">'
      + '<label class="lbl">Mapa</label><select class="field" id="geo-map-select">'+mapOpts+'</select>'
      + '<div id="map-wrap"><div id="map-content"><img id="base-map-img" src="/admin/serbia-map.png" alt="Mapa" draggable="false"><div id="map-pin">📍</div></div>'
      + '<div class="map-btns"><button type="button" id="zoom-in">＋</button><button type="button" id="zoom-out">−</button><button type="button" id="zoom-reset">↻</button></div></div>'
      + '<p class="hint">Klik postavlja pin · točkić zumira · prevlačenje pomera. <span id="pin-readout">Pin nije postavljen.</span></p></div>'
      + '<div id="grp-image"><label class="lbl" id="q-img-label">Slika (opciono)</label>'
      + '<input type="file" id="q-img-file" accept="image/*" style="display:none">'
      + '<div class="dropzone"><img id="q-img-preview" style="display:none" alt="">'
      + '<div class="hint" id="q-img-empty" style="margin:0">Nema slike.</div>'
      + '<div style="margin-top:.5rem"><button type="button" class="btn btn-ghost btn-sm" id="q-img-pick">Dodaj sliku</button>'
      + '<button type="button" class="btn btn-danger btn-sm" id="q-img-remove" style="display:none">Ukloni</button></div></div></div>'
      + '<label class="lbl">Vreme u sekundama (opciono, 5–60)</label>'
      + '<input class="field" type="number" id="q-time" min="5" max="60" step="1" placeholder="15" style="width:72px;text-align:center">'
      + '<label class="lbl" style="margin-top:.8rem">Oznake <span style="font-weight:600;color:var(--muted)">(interno — igrači ih ne vide)</span></label>'
      + '<div id="q-tags" style="display:flex;flex-wrap:wrap;gap:.4rem"></div></div>'
      + sheetFoot(editIndex==null);

    // --- setType ---
    function setType(t){
      qType=t;
      var tb=$('sh-tabs').querySelectorAll('.sheet-tab');
      for (var i=0;i<tb.length;i++){ var on=tb[i].getAttribute('data-type')===t; tb[i].style.background=on?TM[t].color:'var(--surface3)'; tb[i].style.color=on?'#fff':'var(--muted)'; tb[i].style.borderColor=on?TM[t].color:'rgba(29,53,87,.16)'; }
      var isChoice=(t==='obicno'||t==='audio'||t==='video'||t==='uljez');
      $('grp-choice').style.display=isChoice?'block':'none';
      $('q-choice-label').textContent=t==='uljez'?'4 pojma · označi ULJEZA (3 spadaju zajedno, 1 ne)':'Odgovori · označi tačan';
      $('grp-audio').style.display=t==='audio'?'block':'none';
      $('grp-video').style.display=t==='video'?'block':'none';
      $('grp-broj').style.display=t==='broj'?'block':'none';
      $('grp-geo').style.display=t==='geo'?'block':'none';
      $('grp-emoji').style.display=t==='emoji'?'block':'none';
      $('grp-dopuna').style.display=t==='dopuna'?'block':'none';
      $('grp-textans').style.display=(t==='dopuna'||t==='piksel'||t==='anagram')?'block':'none';
      $('grp-redosled').style.display=t==='redosled'?'block':'none';
      $('grp-image').style.display=(t==='video'||t==='emoji'||t==='dopuna'||t==='anagram'||t==='redosled')?'none':'block';
      $('q-img-label').textContent=t==='piksel'?'Slika (obavezno — to je pitanje)':(t==='geo'?'Slika (opciono — ostavi prazno za tekstualno pitanje)':'Slika (opciono)');
      var TEXT_LABELS={ geo:'Tekst (opciono uz sliku; obavezno bez slike — npr. „Gde je glavni grad Srbije?")', emoji:'Tekst (opciono — „Šta se krije iza emojija?")', uljez:'Tekst (opciono — „Pronađi uljeza!")', dopuna:'Tekst (opciono — „Završi citat!")', piksel:'Tekst (opciono — „Šta je na slici?")', anagram:'Tekst / kategorija (opciono — „Reši anagram!")' };
      $('q-text-label').textContent=TEXT_LABELS[t]||'Tekst pitanja';
      $('q-time').placeholder=String(TIME_DEFAULTS[t]||15);
      $('sh-title').textContent=TM[t].icon+' '+TM[t].label+' pitanje';
      if (t==='geo') syncMapImage();
    }
    // --- image/audio preview ---
    function setImage(file,url){
      pend.imageFile=file||null; pend.imageUrl=url||null;
      var src=pend.imageUrl||(pend.imageFile?fileUrl(ctx,pend.imageFile):null);
      var prev=$('q-img-preview');
      if(src){ prev.src=src; prev.style.display='block'; $('q-img-empty').style.display='none'; $('q-img-remove').style.display=''; $('q-img-pick').textContent='Promeni sliku'; }
      else { prev.removeAttribute('src'); prev.style.display='none'; $('q-img-empty').style.display=''; $('q-img-remove').style.display='none'; $('q-img-pick').textContent='Dodaj sliku'; }
    }
    function setAudio(file,url){
      pend.audioFile=file||null; pend.audioUrl=url||null;
      var src=pend.audioUrl||(pend.audioFile?fileUrl(ctx,pend.audioFile):null);
      var prev=$('q-audio-preview');
      if(src){ prev.src=src; prev.style.display='block'; $('q-audio-name').textContent=pend.audioFile||''; $('q-audio-remove').style.display=''; $('q-audio-pick').textContent='Promeni audio'; }
      else { prev.removeAttribute('src'); prev.style.display='none'; $('q-audio-name').textContent=''; $('q-audio-remove').style.display='none'; $('q-audio-pick').textContent='Izaberi audio'; }
    }
    function downscale(file,maxDim,quality){
      return new Promise(function(resolve){
        var url=URL.createObjectURL(file); var img=new Image();
        img.onload=function(){ try{ var scale=Math.min(1,maxDim/Math.max(img.width,img.height)); var w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)); var c=document.createElement('canvas'); c.width=w;c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg',quality)); }catch(e){ URL.revokeObjectURL(url); resolve(null); } };
        img.onerror=function(){ URL.revokeObjectURL(url); resolve(null); }; img.src=url;
      });
    }
    function uploadFile(kind,dataBase64){ return api('POST','/api/admin/quiz-packs/'+ctx.pack.id+'/file',{kind:kind,dataBase64:dataBase64}); }
    function handleImgFile(file){
      if(!file||file.type.indexOf('image/')!==0){ showErr('Izaberi sliku.'); return; }
      $('q-img-pick').disabled=true;
      downscale(file,1280,0.75).then(function(b){ if(!b){ showErr('Ne mogu da pročitam sliku.'); return; } return uploadFile('image',b).then(function(d){ setImage(d.file,null); showOk('Slika dodata.'); }); })
        .catch(function(e){ showErr(e.message); }).then(function(){ $('q-img-pick').disabled=false; });
    }
    function handleAudioFile(file){
      if(!file||file.type.indexOf('audio/')!==0){ showErr('Izaberi audio fajl.'); return; }
      var reader=new FileReader();
      reader.onerror=function(){ showErr('Ne mogu da pročitam fajl.'); };
      reader.onload=function(){ var b=String(reader.result||''); if(b.length>14000000){ showErr('Audio je prevelik (max ~10 MB).'); return; } $('q-audio-pick').disabled=true; uploadFile('audio',b).then(function(d){ setAudio(d.file,null); showOk('Audio dodat.'); }).catch(function(e){ showErr(e.message); }).then(function(){ $('q-audio-pick').disabled=false; }); };
      reader.readAsDataURL(file);
    }
    // Accept a full YouTube URL (watch?v=, youtu.be/, /embed/, /shorts/, /v/)
    // or a bare 11-char ID; return the ID or '' if none found.
    function ytId(v){
      v=(v||'').trim();
      if(/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      // Char classes [.]/[/] instead of \.\/ — this JS lives inside a TS
      // template literal that would strip the backslashes.
      var m=v.match(/(?:youtu[.]be[/]|[?&]v=|[/]embed[/]|[/]shorts[/]|[/]v[/])([A-Za-z0-9_-]{11})/);
      return m?m[1]:'';
    }
    function updateVideoThumb(){
      var id=ytId($('q-video-id').value); var img=$('q-video-thumb');
      if(id){ img.src='https://img.youtube.com/vi/'+id+'/hqdefault.jpg'; img.style.display='block'; } else img.style.display='none';
    }
    // --- geo map ---
    function currentBBox(){ var m=packMaps(ctx); return geo.mapId&&m[geo.mapId]?m[geo.mapId].bbox:null; }
    function syncMapImage(){ var m=packMaps(ctx); var img=$('base-map-img'); var src=geo.mapId&&m[geo.mapId]?fileUrl(ctx,m[geo.mapId].imageFile):'/admin/serbia-map.png'; if(img.getAttribute('src')!==src)img.setAttribute('src',src); }
    function updatePinUi(){ var el=$('map-pin'); if(geo.pin){ el.style.display='block'; el.style.left=(geo.pin.x*100)+'%'; el.style.top=(geo.pin.y*100)+'%'; $('pin-readout').textContent=(geo.lat!=null)?'Pin: '+geo.lat.toFixed(5)+', '+geo.lng.toFixed(5):'Pin: postavljen'; } else { el.style.display='none'; $('pin-readout').textContent='Pin nije postavljen.'; } }
    function convertPin(){ if(!geo.pin)return; var body={pin:geo.pin}; var b=currentBBox(); if(b)body.bbox=b; api('POST','/api/admin/pin-convert',body).then(function(d){ if(d.latLng){ geo.lat=d.latLng.lat; geo.lng=d.latLng.lng; updatePinUi(); } }).catch(function(e){ showErr(e.message); }); }
    function pinFromLatLng(lat,lng){ var body={lat:lat,lng:lng}; var b=currentBBox(); if(b)body.bbox=b; api('POST','/api/admin/pin-convert',body).then(function(d){ if(d.pin){ geo.pin=d.pin; geo.lat=lat; geo.lng=lng; updatePinUi(); } }).catch(function(e){ showErr(e.message); }); }
    function applyView(){ $('map-content').style.transform='translate('+geo.panX+'px,'+geo.panY+'px) scale('+geo.zoom+')'; }
    function clampPan(){ var wrap=$('map-wrap'); var w=wrap.clientWidth,h=wrap.clientHeight; var minX=w*(1-geo.zoom),minY=h*(1-geo.zoom); geo.panX=Math.min(0,Math.max(minX,geo.panX)); geo.panY=Math.min(0,Math.max(minY,geo.panY)); }
    function setZoom(next,ax,ay){ var c=Math.max(1,Math.min(6,next)); var wrap=$('map-wrap'); if(ax===undefined){ax=wrap.clientWidth/2;ay=wrap.clientHeight/2;} var cx=(ax-geo.panX)/geo.zoom, cy=(ay-geo.panY)/geo.zoom; geo.zoom=c; geo.panX=ax-cx*geo.zoom; geo.panY=ay-cy*geo.zoom; clampPan(); applyView(); }
    function initMap(){
      var wrap=$('map-wrap'); var dragging=false,moved=false,sx=0,sy=0,spx=0,spy=0;
      wrap.addEventListener('pointerdown',function(e){ wrap.setPointerCapture(e.pointerId); dragging=true;moved=false;sx=e.clientX;sy=e.clientY;spx=geo.panX;spy=geo.panY; });
      wrap.addEventListener('pointermove',function(e){ if(!dragging)return; var dx=e.clientX-sx,dy=e.clientY-sy; if(Math.abs(dx)+Math.abs(dy)>6)moved=true; if(geo.zoom>1&&moved){ geo.panX=spx+dx; geo.panY=spy+dy; clampPan(); applyView(); } });
      wrap.addEventListener('pointerup',function(e){ if(dragging&&!moved){ var rect=$('map-content').getBoundingClientRect(); var x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height; if(x>=0&&x<=1&&y>=0&&y<=1){ geo.pin={x:x,y:y}; geo.lat=null;geo.lng=null; updatePinUi(); convertPin(); } } dragging=false; });
      wrap.addEventListener('pointercancel',function(){ dragging=false; });
      wrap.addEventListener('wheel',function(e){ e.preventDefault(); var rect=wrap.getBoundingClientRect(); setZoom(geo.zoom*Math.exp(-e.deltaY*0.0015),e.clientX-rect.left,e.clientY-rect.top); },{passive:false});
      $('zoom-in').onclick=function(){ setZoom(geo.zoom*1.5); }; $('zoom-out').onclick=function(){ setZoom(geo.zoom/1.5); }; $('zoom-reset').onclick=function(){ geo.zoom=1;geo.panX=0;geo.panY=0;applyView(); };
      $('base-map-img').addEventListener('load',function(){ var img=$('base-map-img'); if(img.naturalWidth>0&&img.naturalHeight>0)$('map-wrap').style.aspectRatio=img.naturalWidth+' / '+img.naturalHeight; });
      $('geo-map-select').onchange=function(){ geo.mapId=this.value; geo.pin=null;geo.lat=null;geo.lng=null; geo.zoom=1;geo.panX=0;geo.panY=0; applyView(); updatePinUi(); syncMapImage(); };
    }
    // --- build ---
    function buildChoiceCore(q){
      var text=$('q-text').value.trim(); if(!text){ showErr('Unesi tekst pitanja.'); return null; }
      var sel=sheet.querySelector('input[name=correct]:checked'); var slot=sel?parseInt(sel.value,10):0;
      var options=[],ci=-1;
      for (var i=0;i<4;i++){ var v=$('q-opt'+i).value.trim(); if(!v)continue; if(i===slot)ci=options.length; options.push(v); }
      if(options.length<2){ showErr('Unesi bar 2 odgovora.'); return null; }
      if(ci===-1){ showErr('Tačan odgovor mora biti popunjena opcija.'); return null; }
      q.text=text; q.options=options; q.correctIndex=ci; return q;
    }
    function attachTime(q){ var t=$('q-time').value.trim(); if(t){ var n=parseInt(t,10); if(isNaN(n)||n<5||n>60){ showErr('Vreme mora biti između 5 i 60 sekundi.'); return false; } q.timeLimit=n; } return true; }
    function collectTextAnswer(q){
      var ans=$('q-ta-answer').value.trim(); if(!ans){ showErr('Unesi rešenje.'); return false; }
      q.answer=ans;
      var accRaw=$('q-ta-accept').value.trim();
      if(accRaw){ var acc=accRaw.split(',').map(function(a){return a.trim();}).filter(function(a){return a.length>0;}); if(acc.length>8){ showErr('Najviše 8 prihvaćenih odgovora.'); return false; } if(acc.length)q.accept=acc; }
      return true;
    }
    function attachImage(q){ if(pend.imageFile)q.imageFile=pend.imageFile; else if(pend.imageUrl)q.imageUrl=pend.imageUrl; }
    function buildQuestion(){
      var q={ type:qType };
      if(qType==='obicno'){ if(!buildChoiceCore(q))return null; attachImage(q); }
      else if(qType==='audio'){ if(!buildChoiceCore(q))return null; if(!pend.audioFile&&!pend.audioUrl){ showErr('Dodaj audio fajl.'); return null; } if(pend.audioFile)q.audioFile=pend.audioFile; else q.audioUrl=pend.audioUrl; attachImage(q); }
      else if(qType==='video'){ if(!buildChoiceCore(q))return null; var vid=ytId($('q-video-id').value); if(!vid){ showErr('Unesi ispravan YouTube link ili ID (11 znakova).'); return null; } q.videoId=vid; var vs=$('q-video-start').value.trim(),ve=$('q-video-end').value.trim(); if(vs)q.startSeconds=parseInt(vs,10); if(ve)q.endSeconds=parseInt(ve,10); if(q.startSeconds!=null&&q.endSeconds!=null&&q.endSeconds<=q.startSeconds){ showErr('Kraj mora biti posle starta.'); return null; } }
      else if(qType==='broj'){ var text=$('q-text').value.trim(); if(!text){ showErr('Unesi tekst pitanja.'); return null; } q.text=text; var answer=parseFloat($('q-broj-answer').value),mn=parseFloat($('q-broj-min').value),mx=parseFloat($('q-broj-max').value); if(isNaN(answer)||isNaN(mn)||isNaN(mx)){ showErr('Popuni odgovor, min i max.'); return null; } if(mn>=mx){ showErr('Min mora biti manji od max.'); return null; } if(answer<mn||answer>mx){ showErr('Odgovor mora biti između min i max.'); return null; } q.answer=answer;q.min=mn;q.max=mx; var st=$('q-broj-step').value.trim(); if(st){ var stn=parseFloat(st); if(isNaN(stn)||stn<=0){ showErr('Korak mora biti pozitivan broj.'); return null; } q.step=stn; } var unit=$('q-broj-unit').value.trim(); if(unit)q.unit=unit; if($('q-broj-valuetype').value)q.valueType=$('q-broj-valuetype').value; var em=$('q-broj-emoji').value.trim(); if(em)q.emoji=em; attachImage(q); }
      else if(qType==='geo'){ var gt=$('q-text').value.trim(); if(gt)q.text=gt; if(!pend.imageFile&&!pend.imageUrl&&!gt){ showErr('Geo pitanje mora imati sliku ili tekst pitanja.'); return null; } attachImage(q); var cap=$('q-caption').value.trim(); if(cap)q.caption=cap; if(geo.lat==null||geo.lng==null){ showErr('Postavi pin na mapu.'); return null; } q.lat=geo.lat;q.lng=geo.lng; if(geo.mapId)q.mapId=geo.mapId; }
      else if(qType==='emoji'){ var et=$('q-text').value.trim(); if(et)q.text=et; var ems=$('q-emoji-emojis').value.trim(); if(!ems){ showErr('Unesi emoji zagonetku.'); return null; } q.emojis=ems; var ans=$('q-emoji-answer').value.trim(); if(!ans){ showErr('Unesi rešenje.'); return null; } q.answer=ans; var accRaw=$('q-emoji-accept').value.trim(); if(accRaw){ var acc=accRaw.split(',').map(function(a){return a.trim();}).filter(function(a){return a.length>0;}); if(acc.length>8){ showErr('Najviše 8 prihvaćenih odgovora.'); return null; } if(acc.length)q.accept=acc; } }
      else if(qType==='uljez'){
        var utext=$('q-text').value.trim(); if(utext)q.text=utext;
        var usel=sheet.querySelector('input[name=correct]:checked'); var uslot=usel?parseInt(usel.value,10):0;
        var uopts=[],uci=-1;
        for(var ui=0;ui<4;ui++){ var uv=$('q-opt'+ui).value.trim(); if(!uv)continue; if(ui===uslot)uci=uopts.length; uopts.push(uv); }
        if(uopts.length!==4){ showErr('Uljez pitanje mora imati tačno 4 pojma.'); return null; }
        if(uci===-1){ showErr('Označi koji pojam je uljez (popunjena opcija).'); return null; }
        q.options=uopts; q.correctIndex=uci; attachImage(q);
      }
      else if(qType==='dopuna'){ var dt=$('q-text').value.trim(); if(dt)q.text=dt; var quote=$('q-quote').value.trim(); if(!quote){ showErr('Unesi vidljivi deo citata.'); return null; } q.quote=quote; if(!collectTextAnswer(q))return null; }
      else if(qType==='piksel'){ var pxt=$('q-text').value.trim(); if(pxt)q.text=pxt; if(!pend.imageFile&&!pend.imageUrl){ showErr('Piksel pitanje mora imati sliku.'); return null; } attachImage(q); if(!collectTextAnswer(q))return null; }
      else if(qType==='anagram'){ var agt=$('q-text').value.trim(); if(agt)q.text=agt; if(!collectTextAnswer(q))return null; }
      else if(qType==='redosled'){
        var rt=$('q-text').value.trim(); if(!rt){ showErr('Unesi tekst pitanja.'); return null; } q.text=rt;
        var lines=$('q-items').value.split(String.fromCharCode(10)).map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
        if(lines.length<3||lines.length>10){ showErr('Redosled mora imati između 3 i 10 pojmova.'); return null; }
        q.items=lines;
      }
      if(!attachTime(q))return null; if(qTags.length)q.tags=qTags.slice(); return q;
    }
    function renderTags(){
      var thost=$('q-tags'); if(!thost)return; thost.innerHTML='';
      KVIZ_TAG_DEFS.forEach(function(td){
        var on=qTags.indexOf(td.id)>=0;
        var b=document.createElement('button'); b.type='button'; b.textContent=td.label;
        b.style.cssText='padding:.35rem .8rem;border-radius:999px;font-size:.8rem;font-weight:700;cursor:pointer;'
          +'border:1.5px solid '+(on?td.color:'rgba(29,53,87,.16)')+';'
          +'background:'+(on?td.color+'22':'var(--surface3)')+';color:'+(on?td.color:'var(--muted)')+';';
        b.onclick=function(){ var i=qTags.indexOf(td.id); if(i>=0)qTags.splice(i,1); else qTags.push(td.id); renderTags(); };
        thost.appendChild(b);
      });
    }
    function resetForNew(){
      $('q-text').value=''; for(var i=0;i<4;i++)$('q-opt'+i).value=''; sheet.querySelector('input[name=correct][value="0"]').checked=true;
      qTags=[]; renderTags();
      $('q-time').value=''; $('q-video-id').value=''; $('q-video-start').value=''; $('q-video-end').value=''; updateVideoThumb();
      $('q-broj-answer').value='';$('q-broj-min').value='';$('q-broj-max').value='';$('q-broj-step').value='';$('q-broj-unit').value='';$('q-broj-valuetype').value='';$('q-broj-emoji').value='';
      $('q-caption').value=''; geo.pin=null;geo.lat=null;geo.lng=null;geo.mapId=''; $('geo-map-select').value=''; updatePinUi(); syncMapImage();
      $('q-emoji-emojis').value='';$('q-emoji-answer').value='';$('q-emoji-accept').value='';
      $('q-quote').value='';$('q-ta-answer').value='';$('q-ta-accept').value='';$('q-items').value='';
      setImage(null,null); setAudio(null,null);
      $('sh-eyebrow').textContent='Novo pitanje';
    }
    function doSave(again){
      var q=buildQuestion(); if(!q)return;
      var next=(ctx.pack.questions||[]).slice();
      if(editIndex==null)next.push(q); else next[editIndex]=q;
      saveQuestions(ctx,next,editIndex==null?'Pitanje dodato.':'Pitanje izmenjeno.').then(function(){
        if(again && editIndex==null){ ctx=window.AdminApp.ctx(); setType(qType); resetForNew(); } else close();
      }).catch(function(e){ showErr(e.message); });
    }

    // wire
    $('sh-x').onclick=close;
    var tb=$('sh-tabs').querySelectorAll('.sheet-tab');
    for (var i=0;i<tb.length;i++) tb[i].onclick=function(){ setType(this.getAttribute('data-type')); };
    $('q-img-pick').onclick=function(){ $('q-img-file').click(); };
    $('q-img-file').onchange=function(e){ var f=e.target.files&&e.target.files[0]; e.target.value=''; if(f)handleImgFile(f); };
    $('q-img-remove').onclick=function(){ setImage(null,null); };
    $('q-audio-pick').onclick=function(){ $('q-audio-file').click(); };
    $('q-audio-file').onchange=function(e){ var f=e.target.files&&e.target.files[0]; e.target.value=''; if(f)handleAudioFile(f); };
    $('q-audio-remove').onclick=function(){ setAudio(null,null); };
    $('q-video-id').addEventListener('input',updateVideoThumb);
    $('q-video-id').addEventListener('change',function(){ var id=ytId(this.value); if(id&&id!==this.value)this.value=id; updateVideoThumb(); });
    $('sh-save').onclick=function(){ doSave(false); };
    var sa=$('sh-save-again'); if(sa)sa.onclick=function(){ doSave(true); };
    $('sh-cancel').onclick=close;
    initMap();
    renderTags();

    // init / prefill
    if(existing){
      $('sh-eyebrow').textContent='Izmena pitanja';
      setType(qType);
      $('q-text').value=existing.text||'';
      $('q-time').value=existing.timeLimit?String(existing.timeLimit):'';
      setImage(existing.imageFile||null, existing.imageUrl||null);
      if(qType==='obicno'||qType==='audio'||qType==='video'||qType==='uljez'){ var op=Array.isArray(existing.options)?existing.options:[]; for(var j=0;j<4;j++)$('q-opt'+j).value=op[j]||''; var cidx=typeof existing.correctIndex==='number'?existing.correctIndex:0; var rd=sheet.querySelector('input[name=correct][value="'+cidx+'"]'); if(rd)rd.checked=true; }
      if(qType==='audio')setAudio(existing.audioFile||null, existing.audioUrl||null);
      if(qType==='video'){ $('q-video-id').value=existing.videoId||''; $('q-video-start').value=existing.startSeconds!=null?String(existing.startSeconds):''; $('q-video-end').value=existing.endSeconds!=null?String(existing.endSeconds):''; updateVideoThumb(); }
      if(qType==='broj'){ $('q-broj-answer').value=String(existing.answer);$('q-broj-min').value=String(existing.min);$('q-broj-max').value=String(existing.max);$('q-broj-step').value=existing.step!=null?String(existing.step):'';$('q-broj-unit').value=existing.unit||'';$('q-broj-valuetype').value=existing.valueType||'';$('q-broj-emoji').value=existing.emoji||''; }
      if(qType==='geo'){ $('q-caption').value=existing.caption||''; geo.mapId=existing.mapId||''; $('geo-map-select').value=geo.mapId; syncMapImage(); if(typeof existing.lat==='number'&&typeof existing.lng==='number')pinFromLatLng(existing.lat,existing.lng); }
      if(qType==='emoji'){ $('q-emoji-emojis').value=existing.emojis||''; $('q-emoji-answer').value=existing.answer||''; $('q-emoji-accept').value=Array.isArray(existing.accept)?existing.accept.join(', '):''; }
      if(qType==='dopuna'||qType==='piksel'||qType==='anagram'){ $('q-ta-answer').value=existing.answer||''; $('q-ta-accept').value=Array.isArray(existing.accept)?existing.accept.join(', '):''; }
      if(qType==='dopuna'){ $('q-quote').value=existing.quote||''; }
      if(qType==='redosled'){ $('q-items').value=Array.isArray(existing.items)?existing.items.join(String.fromCharCode(10)):''; }
    } else {
      $('sh-eyebrow').textContent='Novo pitanje';
      setType('obicno');
    }
  }

  function choiceRow(i){
    return '<div class="opt-row"><input type="radio" name="correct" value="'+i+'"'+(i===0?' checked':'')+'>'
      + '<input class="field" id="q-opt'+i+'" placeholder="Odgovor '+(i+1)+(i>1?' (opciono)':'')+'"></div>';
  }
  function sheetFoot(isNew){
    return '<div class="sheet-foot"><button class="btn btn-ghost" id="sh-cancel">Otkaži</button><span style="flex:1"></span>'
      + (isNew?'<button class="btn btn-ghost" id="sh-save-again" style="border-color:var(--gold);color:#8a6f2c;background:rgba(194,155,71,.14)">Sačuvaj i dodaj još</button>':'')
      + '<button class="btn btn-primary" id="sh-save">Sačuvaj</button></div>';
  }

  // ===== KO-SAM-JA SHEET =====
  var KO_TEXT_HINTS={
    fixed:'Mora sadržati '+PH_SUBJECT+' tačno jednom. Bez '+PH_PEER1+'/'+PH_PEER2+'.',
    peer:'Mora sadržati '+PH_SUBJECT+' tačno jednom. Bez opcija: mora i '+PH_PEER1+' i '+PH_PEER2+' tačno jednom.',
    free:'Mora sadržati '+PH_SUBJECT+' tačno jednom. Subjekat kuca slobodan odgovor.',
    pickN:'Mora sadržati '+PH_SUBJECT+' tačno jednom. Dugmad se prave po igračima — bez '+PH_PEER+' u tekstu.'
  };
  var KO_OPT_HINTS={
    fixed:'2–4 različite opcije; smeju sadržati '+PH_SUBJECT+'.',
    peer:'OPCIONO: prazno = dva automatska dugmeta sa imenima. Ako popuniš (2–4), smeju '+PH_PEER1+'/'+PH_PEER2+'/'+PH_SUBJECT+'.',
    free:'OPCIONO: ponuđeni netačni odgovori (do 3). Smeju '+PH_SUBJECT+', '+PH_PEER1+' i '+PH_PEER2+'.'
  };
  var KO_OPT_LABELS={ fixed:'Opcije', peer:'Opcije', free:'Ponuđeni odgovori (opciono)' };
  var KO_EXTRA_HINT='Smeju sadržati '+PH_SUBJECT+', '+PH_PEER1+' i '+PH_PEER2+' (prva dva izabrana igrača). Bez '+PH_PEER+'.';

  function openKoSheet(ctx, editIndex){
    var TM=KO_TYPES;
    var existing=(editIndex!=null)?(ctx.pack.questions||[])[editIndex]:null;
    var s=makeSheet(); var sheet=s.sheet, close=s.close;
    var shape=existing?typeOf(ctx.game,existing):'fixed';

    var tabs='';
    for (var k in TM) tabs+='<button class="sheet-tab" data-type="'+k+'">'+TM[k].icon+' '+esc(TM[k].label)+'</button>';

    sheet.innerHTML=
      '<div class="sheet-head"><div style="display:flex;align-items:center;gap:.6rem">'
      + '<div style="flex:1"><div class="sheet-eyebrow" id="sh-eyebrow"></div><div class="sheet-title" id="sh-title"></div></div>'
      + '<button class="sheet-x" id="sh-x">✕</button></div>'
      + '<div class="sheet-tabs" id="sh-tabs">'+tabs+'</div></div>'
      + '<div class="sheet-body">'
      + '<label class="lbl">Kategorija</label><select class="field" id="q-cat" style="max-width:200px"><option value="family">family</option><option value="nsfw">nsfw</option></select>'
      + '<label class="lbl">Tekst pitanja</label><textarea class="field" id="q-text" rows="2" placeholder="npr. Omiljena boja igrača '+esc(PH_SUBJECT)+'?"></textarea>'
      + '<p class="hint" id="text-hint"></p>'
      + '<div id="blk-options"><label class="lbl" id="options-label">Opcije</label>'
      + '<div class="opt-row" style="margin-bottom:.45rem"><input class="field" id="q-opt0" placeholder="Opcija 1"></div>'
      + '<div class="opt-row" style="margin-bottom:.45rem"><input class="field" id="q-opt1" placeholder="Opcija 2"></div>'
      + '<div class="opt-row" style="margin-bottom:.45rem"><input class="field" id="q-opt2" placeholder="Opcija 3 (opciono)"></div>'
      + '<div class="opt-row" id="opt3-wrap" style="margin-bottom:.45rem"><input class="field" id="q-opt3" placeholder="Opcija 4 (opciono)"></div>'
      + '<p class="hint" id="options-hint"></p></div>'
      + '<div id="blk-free" style="display:none"><label class="lbl">Max dužina odgovora (10–120; podr. 60)</label>'
      + '<input class="field" type="number" id="q-maxlen" min="10" max="120" step="1" placeholder="60" style="max-width:140px"></div>'
      + '<div id="blk-pickn" style="display:none"><label class="lbl">Šablon dugmeta (opciono)</label>'
      + '<input class="field" id="q-tpl" placeholder="npr. sa '+esc(PH_PEER)+'">'
      + '<p class="hint">Mora sadržati '+esc(PH_PEER)+' tačno jednom; sme i '+esc(PH_SUBJECT)+'. Prazno = samo ime igrača.</p>'
      + '<label class="lbl">Max broj igrača-dugmadi (2–8; podr. 4)</label>'
      + '<input class="field" type="number" id="q-maxpeers" min="2" max="8" step="1" placeholder="4" style="max-width:140px">'
      + '<label class="lbl">Dodatne opcije (opciono, do 4)</label>'
      + '<div class="opt-row" style="margin-bottom:.45rem"><input class="field" id="q-extra0" placeholder="npr. niko"></div>'
      + '<div class="opt-row" style="margin-bottom:.45rem"><input class="field" id="q-extra1"></div>'
      + '<div class="opt-row" style="margin-bottom:.45rem"><input class="field" id="q-extra2"></div>'
      + '<div class="opt-row" style="margin-bottom:.45rem"><input class="field" id="q-extra3"></div>'
      + '<p class="hint" id="extra-hint"></p></div>'
      + '</div>'
      + sheetFoot(editIndex==null);

    function applyShape(){
      var sh=$('q-cat')?shape:shape; // shape var is source of truth
      var tb=$('sh-tabs').querySelectorAll('.sheet-tab');
      for(var i=0;i<tb.length;i++){ var on=tb[i].getAttribute('data-type')===shape; tb[i].style.background=on?TM[shape].color:'var(--surface3)'; tb[i].style.color=on?'#fff':'var(--muted)'; tb[i].style.borderColor=on?TM[shape].color:'rgba(29,53,87,.16)'; }
      var showOpts=(shape==='fixed'||shape==='peer'||shape==='free');
      $('blk-options').style.display=showOpts?'block':'none';
      $('blk-free').style.display=shape==='free'?'block':'none';
      $('blk-pickn').style.display=shape==='pickN'?'block':'none';
      $('text-hint').textContent=KO_TEXT_HINTS[shape]||'';
      if(showOpts){ $('options-hint').textContent=KO_OPT_HINTS[shape]||''; $('options-label').textContent=KO_OPT_LABELS[shape]||'Opcije'; }
      if(shape==='free'){ $('opt3-wrap').style.display='none'; $('q-opt3').value=''; } else $('opt3-wrap').style.display='';
      $('extra-hint').textContent=KO_EXTRA_HINT;
      $('sh-title').textContent=TM[shape].icon+' '+TM[shape].label;
    }
    function collect(prefix){ var out=[]; for(var i=0;i<4;i++){ var v=$(prefix+i).value.trim(); if(v)out.push(v); } return out; }
    function buildQuestion(){
      var text=$('q-text').value.trim(); if(!text){ showErr('Unesi tekst pitanja.'); return null; }
      var q={ shape:shape, category:$('q-cat').value, text:text };
      if(shape==='fixed'){ q.options=collect('q-opt'); }
      else if(shape==='peer'){ var o=collect('q-opt'); if(o.length>0)q.options=o; }
      else if(shape==='free'){ var ml=$('q-maxlen').value.trim(); if(ml){ var n=parseInt(ml,10); if(isNaN(n)){ showErr('Max dužina mora biti broj.'); return null; } q.maxLength=n; } var fo=collect('q-opt'); if(fo.length>0)q.options=fo; }
      else if(shape==='pickN'){ var tpl=$('q-tpl').value.trim(); if(tpl)q.optionTemplate=tpl; var mp=$('q-maxpeers').value.trim(); if(mp){ var m=parseInt(mp,10); if(isNaN(m)){ showErr('Max broj igrača mora biti broj.'); return null; } q.maxPeers=m; } var ex=collect('q-extra'); if(ex.length>0)q.extraOptions=ex; }
      return q;
    }
    function resetForNew(){ $('q-text').value=''; for(var i=0;i<4;i++){ $('q-opt'+i).value=''; $('q-extra'+i).value=''; } $('q-maxlen').value='';$('q-tpl').value='';$('q-maxpeers').value=''; $('sh-eyebrow').textContent='Novo pitanje'; applyShape(); }
    function doSave(again){
      var q=buildQuestion(); if(!q)return;
      var next=(ctx.pack.questions||[]).slice();
      if(editIndex==null)next.push(q); else next[editIndex]=q;
      saveQuestions(ctx,next,editIndex==null?'Pitanje dodato.':'Pitanje izmenjeno.').then(function(){
        if(again && editIndex==null){ ctx=window.AdminApp.ctx(); resetForNew(); } else close();
      }).catch(function(e){ showErr(e.message); });
    }

    $('sh-x').onclick=close; $('sh-cancel').onclick=close;
    var tb=$('sh-tabs').querySelectorAll('.sheet-tab');
    for(var i=0;i<tb.length;i++) tb[i].onclick=function(){ shape=this.getAttribute('data-type'); applyShape(); };
    $('sh-save').onclick=function(){ doSave(false); };
    var sa=$('sh-save-again'); if(sa)sa.onclick=function(){ doSave(true); };

    if(existing){
      $('sh-eyebrow').textContent='Izmena pitanja';
      $('q-cat').value=existing.category||'family';
      $('q-text').value=existing.text||'';
      var op=Array.isArray(existing.options)?existing.options:[]; for(var j=0;j<4;j++)$('q-opt'+j).value=op[j]||'';
      var ex=Array.isArray(existing.extraOptions)?existing.extraOptions:[]; for(var e=0;e<4;e++)$('q-extra'+e).value=ex[e]||'';
      $('q-maxlen').value=existing.maxLength?String(existing.maxLength):''; $('q-tpl').value=existing.optionTemplate||''; $('q-maxpeers').value=existing.maxPeers?String(existing.maxPeers):'';
    } else $('sh-eyebrow').textContent='Novo pitanje';
    applyShape();
  }

  // ===== KVIZ settings (name/desc/maps) =====
  function openKvizSettings(ctx){
    var s=makeSheet(); var sheet=s.sheet, close=s.close;
    var maps=packMaps(ctx);
    var pendMap=null;
    var mapsHtml='';
    var mids=Object.keys(maps);
    if(mids.length===0) mapsHtml='<p class="hint" style="margin:0">Nema custom mapa — geo pitanja igraju na mapi Srbije.</p>';
    mids.forEach(function(id){ var m=maps[id]; mapsHtml+='<div class="map-row"><img src="'+esc(fileUrl(ctx,m.imageFile))+'" alt="">'
      +'<div style="flex:1;min-width:0"><strong>'+esc(id)+'</strong><div class="hint" style="margin:0">bbox '+m.bbox.minLat+'…'+m.bbox.maxLat+' / '+m.bbox.minLng+'…'+m.bbox.maxLng+'</div></div>'
      +'<button class="btn btn-danger btn-sm" data-delmap="'+esc(id)+'">Obriši</button></div>'; });

    var curCat=kvizCatById(ctx.pack.category).id;
    var catOpts='';
    KVIZ_CATS.forEach(function(c){ catOpts+='<option value="'+esc(c.id)+'"'+(c.id===curCat?' selected':'')+'>'+esc(c.icon+' '+c.label)+'</option>'; });

    sheet.innerHTML=
      '<div class="sheet-head"><div style="display:flex;align-items:center;gap:.6rem"><div style="flex:1">'
      + '<div class="sheet-eyebrow">Podaci o packu</div><div class="sheet-title">'+esc(ctx.pack.name||ctx.pack.id)+'</div></div>'
      + '<button class="sheet-x" id="sh-x">✕</button></div></div>'
      + '<div class="sheet-body">'
      + '<label class="lbl">Naziv</label><input class="field" id="pk-name" maxlength="80" value="'+esc(ctx.pack.name||'')+'">'
      + '<label class="lbl">Opis (opciono)</label><input class="field" id="pk-desc" maxlength="200" value="'+esc(ctx.pack.description||'')+'">'
      + '<label class="lbl">Kategorija</label><select class="field" id="pk-category">'+catOpts+'</select>'
      + '<p class="hint" style="margin-top:0">Određuje pod kojom sekcijom se pack pojavljuje u igri.</p>'
      + '<div style="margin-top:.9rem"><button class="btn btn-ghost btn-sm" id="pk-save-meta">Sačuvaj podatke</button></div>'
      + '<label class="lbl" style="margin-top:1.4rem">Mape packa (za geo pitanja)</label>'
      + '<p class="hint" style="margin-top:0">Custom mapa = north-up Web Mercator izvoz + bbox brojevi sa ivica slike.</p>'
      + '<div id="maps-list" style="margin-top:.6rem">'+mapsHtml+'</div>'
      + '<button class="btn btn-ghost btn-sm" id="toggle-map-form" style="margin-top:.5rem">＋ Dodaj mapu</button>'
      + '<div id="map-form" style="display:none;margin-top:.6rem">'
      + '<label class="lbl">Id mape (mala slova, cifre, crtice)</label><input class="field" id="map-id" maxlength="40" placeholder="npr. zabari">'
      + '<label class="lbl">Slika mape</label><input type="file" id="map-file" accept="image/*" style="display:none">'
      + '<div style="display:flex;gap:.6rem;align-items:center"><button type="button" class="btn btn-ghost btn-sm" id="map-file-btn">Izaberi sliku</button><span class="hint" id="map-file-label" style="margin:0">Nije izabrana</span></div>'
      + '<label class="lbl">BBox (ivice slike, u stepenima)</label><div class="num-grid">'
      + '<input class="field" type="number" id="bbox-minlat" step="any" placeholder="minLat">'
      + '<input class="field" type="number" id="bbox-maxlat" step="any" placeholder="maxLat">'
      + '<input class="field" type="number" id="bbox-minlng" step="any" placeholder="minLng">'
      + '<input class="field" type="number" id="bbox-maxlng" step="any" placeholder="maxLng"></div>'
      + '<div style="margin-top:.7rem"><button class="btn btn-primary btn-sm" id="save-map">Sačuvaj mapu</button></div></div>'
      + '</div>'
      + '<div class="sheet-foot"><span style="flex:1"></span><button class="btn btn-primary" id="sh-done">Gotovo</button></div>';

    function downscale(file,maxDim,quality){ return new Promise(function(resolve){ var url=URL.createObjectURL(file); var img=new Image(); img.onload=function(){ try{ var scale=Math.min(1,maxDim/Math.max(img.width,img.height)); var w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)); var c=document.createElement('canvas'); c.width=w;c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg',quality)); }catch(e){ URL.revokeObjectURL(url); resolve(null); } }; img.onerror=function(){ URL.revokeObjectURL(url); resolve(null); }; img.src=url; }); }

    $('sh-x').onclick=close; $('sh-done').onclick=close;
    function selCat(){ var el=$('pk-category'); return el?el.value:(ctx.pack.category||''); }
    $('pk-save-meta').onclick=function(){
      var body={ name:$('pk-name').value.trim()||ctx.pack.id, questions:ctx.pack.questions||[] };
      var d=$('pk-desc').value.trim(); if(d)body.description=d; var c=selCat(); if(c)body.category=c; var mm=packMaps(ctx); if(Object.keys(mm).length)body.maps=mm;
      ctx.putPack(body,'Sačuvano.').then(close).catch(function(e){ showErr(e.message); });
    };
    $('toggle-map-form').onclick=function(){ var f=$('map-form'); f.style.display=f.style.display==='none'?'block':'none'; };
    $('map-file-btn').onclick=function(){ $('map-file').click(); };
    $('map-file').onchange=function(){ var file=this.files&&this.files[0]; this.value=''; if(!file||file.type.indexOf('image/')!==0){ showErr('Izaberi sliku.'); return; } downscale(file,2200,0.85).then(function(b){ if(!b){ showErr('Ne mogu da pročitam sliku.'); return; } if(b.length>7500000){ showErr('Slika mape je prevelika i posle kompresije.'); return; } pendMap=b; var kb=Math.round(b.length*0.75/1024); $('map-file-label').textContent='✓ '+file.name+' (~'+kb+' KB)'; }); };
    $('save-map').onclick=function(){
      var mapId=$('map-id').value.trim(); if(!/^[a-z0-9-]{1,40}$/.test(mapId)){ showErr('Id mape: mala slova, cifre i crtice.'); return; }
      var bbox={ minLat:parseFloat($('bbox-minlat').value), maxLat:parseFloat($('bbox-maxlat').value), minLng:parseFloat($('bbox-minlng').value), maxLng:parseFloat($('bbox-maxlng').value) };
      if(isNaN(bbox.minLat)||isNaN(bbox.maxLat)||isNaN(bbox.minLng)||isNaN(bbox.maxLng)){ showErr('Popuni sva 4 bbox broja.'); return; }
      var existing=packMaps(ctx)[mapId];
      if(!pendMap&&!existing){ showErr('Izaberi sliku mape.'); return; }
      $('save-map').disabled=true;
      var up=pendMap?api('POST','/api/admin/quiz-packs/'+ctx.pack.id+'/file',{kind:'image',dataBase64:pendMap}).then(function(d){ return d.file; }):Promise.resolve(existing.imageFile);
      up.then(function(imageFile){ var m={}; var all=packMaps(ctx); for(var k in all)m[k]=all[k]; m[mapId]={imageFile:imageFile,bbox:bbox};
        var body={ name:ctx.pack.name||ctx.pack.id, questions:ctx.pack.questions||[], maps:m }; if(ctx.pack.description)body.description=ctx.pack.description; var c=selCat(); if(c)body.category=c;
        return ctx.putPack(body,'Mapa sačuvana.').then(close);
      }).catch(function(e){ showErr(e.message); }).then(function(){ var b=$('save-map'); if(b)b.disabled=false; });
    };
    var dm=sheet.querySelectorAll('[data-delmap]');
    for(var i=0;i<dm.length;i++) dm[i].onclick=function(){
      var id=this.getAttribute('data-delmap');
      var used=(ctx.pack.questions||[]).some(function(q){ return q.type==='geo'&&q.mapId===id; });
      if(used){ showErr('Mapa "'+id+'" se koristi u geo pitanjima — prvo ih prebaci ili obriši.'); return; }
      if(!window.confirm('Obrisati mapu "'+id+'"?'))return;
      var m={}; var all=packMaps(ctx); for(var k in all)if(k!==id)m[k]=all[k];
      var body={ name:ctx.pack.name||ctx.pack.id, questions:ctx.pack.questions||[], maps:m }; if(ctx.pack.description)body.description=ctx.pack.description; if(ctx.pack.category)body.category=ctx.pack.category;
      ctx.putPack(body,'Mapa obrisana.').then(close).catch(function(e){ showErr(e.message); });
    };
  }

  window.AdminApp.register('table', {
    renderMain: renderMain,
    hasSettings: function(g){ return g.id==='kviz'; },
    openSettings: function(ctx){ openKvizSettings(ctx); }
  });
})();
</script>

<script>
/* ============ Simple views: tajni-agenti, gluvo-doba, spijun, timinzi ============ */
(function(){
  'use strict';
  var $ = Admin.$, esc = Admin.esc, api = Admin.api;
  var showErr = Admin.showErr, showOk = Admin.showOk;

  // ---------- tajni-agenti (words) ----------
  var tajniInput = {};  // pack.id -> pending input value (survive re-render)
  function renderTajni(host, ctx){
    var p=ctx.pack;
    if(!p){ host.innerHTML='<div class="empty">Napravi pack da dodaš reči.</div>'; return; }
    var words=p.words||[]; var min=p.minWords||25;
    var statusOk = words.length>=min;
    var chips='';
    words.forEach(function(w,i){ chips+='<span class="chip">'+esc(w)+'<button class="x" data-i="'+i+'">✕</button></span>'; });
    host.innerHTML=
      '<p class="hint" style="margin-bottom:1rem">Jedna reč je tajni pojam za rundu. Duplikati se uklanjaju · min '+min+' reči da bi pack bio vidljiv.</p>'
      + '<label class="lbl">Naziv packa (opciono)</label><input class="field" id="tj-name" maxlength="80" value="'+esc(p.name||'')+'" style="max-width:340px;margin-bottom:1rem">'
      + '<div class="panel"><div style="display:flex;gap:.5rem;margin-bottom:.9rem">'
      + '<input class="field" id="tj-input" placeholder="Dodaj reč pa Enter…" value="'+esc(tajniInput[p.id]||'')+'">'
      + '<button class="btn btn-primary" id="tj-add" style="white-space:nowrap">Dodaj</button></div>'
      + '<div class="chips">'+(chips||'<span class="hint">Još nema reči.</span>')+'</div></div>'
      + '<p class="hint" style="margin-top:.6rem;font-weight:800;color:'+(statusOk?'var(--green)':'var(--amber)')+'">'
      + (statusOk?('✓ '+words.length+' reči — vidljiv u igri.'):(words.length+' / '+min+' reči — još '+(min-words.length)+' za vidljivost.'))+'</p>';

    var inp=$('tj-input');
    inp.oninput=function(){ tajniInput[p.id]=this.value; };
    inp.onkeydown=function(e){ if(e.key==='Enter') addWord(); };
    $('tj-add').onclick=addWord;
    $('tj-name').onchange=function(){ saveTajni(ctx, words, this.value.trim()); };
    var xs=host.querySelectorAll('.chip .x');
    for(var i=0;i<xs.length;i++) xs[i].onclick=function(){ var idx=parseInt(this.getAttribute('data-i'),10); var next=words.slice(); next.splice(idx,1); saveTajni(ctx,next,($('tj-name').value||'').trim()); };

    function addWord(){
      var v=(tajniInput[p.id]||'').trim(); if(!v)return;
      if(words.some(function(w){ return w.toLowerCase()===v.toLowerCase(); })){ tajniInput[p.id]=''; $('tj-input').value=''; return; }
      tajniInput[p.id]='';
      saveTajni(ctx, words.concat([v]), ($('tj-name').value||'').trim());
    }
  }
  function saveTajni(ctx, words, name){
    var body={ words: words }; if(name)body.name=name;
    ctx.putPack(body).catch(function(e){ showErr(e.message); });
  }

  // ---------- gluvo-doba (wolves + roles) ----------
  var GLUVO_ROLES = ${GLUVO_ROLE_META_JSON};
  var GLUVO_MINW = ${GLUVO_DOBA_MIN_WOLVES}, GLUVO_MAXW = ${GLUVO_DOBA_MAX_WOLVES};
  var TEAM_ORDER=['vukodlaci','selo','neutralci'];
  var TEAM_CLASS={ vukodlaci:'team-dark', selo:'team-selo', neutralci:'team-neutralci' };
  var TEAM_COLOR={ vukodlaci:'var(--red)', selo:'var(--blue)', neutralci:'var(--amber)' };
  function renderGluvo(host, ctx){
    var p=ctx.pack;
    if(!p){ host.innerHTML='<div class="empty">Napravi pack (mod). Bez packa igra koristi ugrađeni balans.</div>'; return; }
    var wolves=p.wolves!=null?p.wolves:2;
    var on={}; (p.roles||[]).forEach(function(r){ on[r]=true; });
    var onCount=(p.roles||[]).length;

    var rolesHtml='';
    TEAM_ORDER.forEach(function(team){
      var inTeam=GLUVO_ROLES.filter(function(r){ return r.team===team; });
      if(!inTeam.length)return;
      rolesHtml+='<div class="team-head '+TEAM_CLASS[team]+'" style="color:'+TEAM_COLOR[team]+'">'+esc(inTeam[0].teamName)+'</div><div class="role-grid">';
      inTeam.forEach(function(r){
        var isOn=!!on[r.id];
        rolesHtml+='<button class="role-btn'+(isOn?' on':'')+'" data-role="'+esc(r.id)+'">'
          + '<span class="re">'+r.emoji+'</span>'
          + '<span style="flex:1"><span class="rn">'+esc(r.name)+'</span><span class="rd">'+esc(r.desc)+'</span></span>'
          + '<span class="role-toggle'+(isOn?' on':'')+'"><span></span></span></button>';
      });
      rolesHtml+='</div>';
    });

    host.innerHTML=
      '<label class="lbl">Naziv packa (prikazuje se u igri)</label><input class="field" id="gl-name" maxlength="80" value="'+esc(p.name||'')+'" style="max-width:340px;margin-bottom:1rem">'
      + '<div class="stepper"><div style="flex:1"><div style="font-weight:800;color:var(--navy)">Broj vukodlaka</div><div class="hint" style="margin:0">Ostali: izabrani specijalci + Domaćini</div></div>'
      + '<button id="gl-down">−</button><span class="val" id="gl-wolves">'+wolves+'</span><button id="gl-up">＋</button></div>'
      + '<div class="lbl" style="margin-top:0">Uloge u packu · <span id="gl-count">'+onCount+'</span> uključeno</div>'
      + rolesHtml
      + '<p class="hint" id="gl-summary" style="margin-top:.8rem;font-weight:800;color:var(--green)"></p>'
      + '<div style="margin-top:1rem"><button class="btn btn-primary" id="gl-save">Sačuvaj pack</button></div>';

    var cur={ wolves:wolves, roles:(p.roles||[]).slice(), name:p.name||'' };
    function summary(){ var n=cur.roles.length; $('gl-summary').textContent=cur.wolves+' '+(cur.wolves===1?'vukodlak':'vukodlaka')+' + '+n+' '+(n===1?'specijalac':'specijalaca')+' + Domaćini'; $('gl-count').textContent=String(n); }
    summary();
    $('gl-name').oninput=function(){ cur.name=this.value.trim(); };
    $('gl-up').onclick=function(){ cur.wolves=Math.min(GLUVO_MAXW,cur.wolves+1); $('gl-wolves').textContent=cur.wolves; summary(); };
    $('gl-down').onclick=function(){ cur.wolves=Math.max(GLUVO_MINW,cur.wolves-1); $('gl-wolves').textContent=cur.wolves; summary(); };
    var btns=host.querySelectorAll('.role-btn');
    for(var i=0;i<btns.length;i++) btns[i].onclick=function(){
      var id=this.getAttribute('data-role'); var idx=cur.roles.indexOf(id);
      if(idx>=0)cur.roles.splice(idx,1); else cur.roles.push(id);
      var nowOn=idx<0; this.className='role-btn'+(nowOn?' on':''); this.querySelector('.role-toggle').className='role-toggle'+(nowOn?' on':''); summary();
    };
    $('gl-save').onclick=function(){
      var body={ name:cur.name, wolves:cur.wolves, roles:cur.roles };
      $('gl-save').disabled=true;
      ctx.putPack(body,'Pack sačuvan.').catch(function(e){ showErr(e.message); }).then(function(){ var b=$('gl-save'); if(b)b.disabled=false; });
    };
  }

  // ---------- spijun (locations + roles) ----------
  // The server requires >=2 roles per location even for drafts, so a
  // just-added empty location can't be persisted yet. We therefore edit a
  // LOCAL working copy and PUT the whole set with an explicit "Sačuvaj".
  var spWork=null;  // { packId, name, locations:[{location,roles}], newLoc, dirty }
  function spClone(locs){ return (locs||[]).map(function(o){ return {location:o.location,roles:(o.roles||[]).slice()}; }); }
  function renderSpijun(host, ctx){
    var p=ctx.pack;
    if(!p){ spWork=null; host.innerHTML='<div class="empty">Napravi pack da dodaš lokacije.</div>'; return; }
    if(!spWork || spWork.packId!==p.id){ spWork={ packId:p.id, name:p.name||'', locations:spClone(p.locations), newLoc:'', dirty:false }; }
    var locs=spWork.locations;

    var blocks='';
    locs.forEach(function(l,li){
      var roleChips='';
      (l.roles||[]).forEach(function(r,ri){ roleChips+='<span class="chip">'+esc(r)+'<button class="x" data-l="'+li+'" data-r="'+ri+'">✕</button></span>'; });
      var lowRoles=(l.roles||[]).length<2;
      blocks+='<div class="panel" style="margin-bottom:.7rem"><div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.7rem">'
        + '<span style="font-size:1.3rem">📍</span><span style="flex:1;font-weight:800;font-size:1.05rem;color:var(--navy)">'+esc(l.location)+'</span>'
        + '<span class="hint" style="margin:0;color:'+(lowRoles?'var(--red)':'var(--muted)')+'">'+(l.roles?l.roles.length:0)+' uloga'+(lowRoles?' (min 2)':'')+'</span>'
        + '<button class="iconbtn del" data-delloc="'+li+'">🗑</button></div>'
        + '<div class="chips" style="align-items:center">'+roleChips
        + '<input class="field" data-addrole="'+li+'" placeholder="+ uloga pa Enter" style="width:150px;padding:.28rem .7rem;min-height:0"></div></div>';
    });

    var statusHtml;
    if(spWork.dirty) statusHtml='<span style="color:var(--amber)">● Nesačuvane izmene — klikni „Sačuvaj lokacije".</span>';
    else if(p.visibleInGame) statusHtml='<span style="color:var(--green)">✓ Sačuvano i vidljivo u igri.</span>';
    else statusHtml='<span style="color:var(--amber)">Sačuvano, ali se ne vidi u igri: '+esc(p.error||'min 3 lokacije, svaka sa 2+ uloge')+'</span>';

    host.innerHTML=
      '<label class="lbl">Naziv packa (opciono)</label><input class="field" id="sp-name" maxlength="80" value="'+esc(spWork.name)+'" style="max-width:340px;margin-bottom:1rem">'
      + '<div style="display:flex;gap:.5rem;margin-bottom:1rem">'
      + '<input class="field" id="sp-loc" placeholder="Nova lokacija pa Enter… (npr. Aerodrom)" value="'+esc(spWork.newLoc)+'">'
      + '<button class="btn btn-ghost" id="sp-add" style="white-space:nowrap">＋ Lokacija</button></div>'
      + (blocks||'<div class="empty">Još nema lokacija — dodaj lokaciju pa joj dodaj bar 2 uloge.</div>')
      + '<div style="display:flex;gap:.7rem;align-items:center;margin-top:1rem"><button class="btn btn-primary" id="sp-save"'+(spWork.dirty?'':' disabled')+'>Sačuvaj lokacije</button>'
      + '<span class="hint" style="margin:0;font-weight:800">'+statusHtml+'</span></div>';

    function rerender(){ renderSpijun(host, ctx); }
    function markDirty(){ spWork.dirty=true; }

    var li=$('sp-loc');
    li.oninput=function(){ spWork.newLoc=this.value; };
    li.onkeydown=function(e){ if(e.key==='Enter') addLoc(); };
    $('sp-add').onclick=addLoc;
    $('sp-name').oninput=function(){ spWork.name=this.value; markDirty(); var b=$('sp-save'); if(b)b.disabled=false; };
    function addLoc(){ var v=(spWork.newLoc||'').trim(); if(!v)return; if(locs.some(function(o){ return o.location.toLowerCase()===v.toLowerCase(); })){ spWork.newLoc=''; rerender(); return; } locs.push({location:v,roles:[]}); spWork.newLoc=''; markDirty(); rerender(); var el=$('sp-loc'); if(el)el.focus(); }

    $('sp-save').onclick=function(){
      var body={ locations: spWork.locations }; var nm=(spWork.name||'').trim(); if(nm)body.name=nm;
      $('sp-save').disabled=true;
      api('PUT','/api/admin/spijun-packs/'+p.id, body).then(function(d){ spWork.dirty=false; ctx.updatePack(d.item); showOk('Sačuvano.'); })
        .catch(function(e){ showErr(e.message); var b=$('sp-save'); if(b)b.disabled=false; });
    };

    var delLocs=host.querySelectorAll('[data-delloc]');
    for(var i=0;i<delLocs.length;i++) delLocs[i].onclick=function(){ var idx=parseInt(this.getAttribute('data-delloc'),10); if(!window.confirm('Obrisati lokaciju „'+locs[idx].location+'"?'))return; locs.splice(idx,1); markDirty(); rerender(); };
    var xs=host.querySelectorAll('.chip .x');
    for(var x=0;x<xs.length;x++) xs[x].onclick=function(){ var l=parseInt(this.getAttribute('data-l'),10), r=parseInt(this.getAttribute('data-r'),10); locs[l].roles.splice(r,1); markDirty(); rerender(); };
    var addRoles=host.querySelectorAll('[data-addrole]');
    for(var a=0;a<addRoles.length;a++) addRoles[a].onkeydown=function(e){ if(e.key!=='Enter')return; var v=this.value.trim(); if(!v)return; var l=parseInt(this.getAttribute('data-addrole'),10); if((locs[l].roles||[]).some(function(rr){ return rr.toLowerCase()===v.toLowerCase(); }))return; locs[l].roles.push(v); markDirty(); rerender(); var el=host.querySelector('[data-addrole="'+l+'"]'); if(el)el.focus(); };
  }

  // ---------- timinzi (wait durations) ----------
  var timState=null;  // { defs, overrides }
  function renderTiminzi(host, ctx){
    if(!timState){
      host.innerHTML='<div class="empty">Učitavanje…</div>';
      api('GET','/api/admin/timing-config').then(function(d){ timState={ defs:d.defs||[], overrides:d.overrides||{} }; renderTiminzi(host,ctx); }).catch(function(e){ showErr(e.message); });
      return;
    }
    var defs=timState.defs, ov=timState.overrides;
    var cards='';
    defs.forEach(function(g){
      var fields='';
      g.fields.forEach(function(f){
        var cur=(ov[g.gameId]&&typeof ov[g.gameId][f.key]==='number')?ov[g.gameId][f.key]:f.def;
        var changed=cur!==f.def;
        fields+='<div class="tim-field"><span class="l">'+esc(f.label)+'</span><span class="b">'+f.min+'–'+f.max+' s</span>'
          + '<input class="field'+(changed?' changed':'')+'" type="number" data-g="'+esc(g.gameId)+'" data-k="'+esc(f.key)+'" data-def="'+f.def+'" min="'+f.min+'" max="'+f.max+'" step="1" value="'+cur+'" placeholder="'+f.def+'"></div>';
      });
      cards+='<div class="tim-card"><div style="font-weight:800;color:var(--navy);margin-bottom:.2rem">'+esc(g.gameName)+'</div>'+fields+'</div>';
    });
    host.innerHTML=
      '<p class="hint" style="margin-bottom:1rem">Podrazumevani tajminzi po igri (sekunde). Aktivni tajmeri se ne diraju ovde.</p>'
      + cards
      + '<div style="display:flex;gap:.6rem;align-items:center;margin-top:.5rem"><button class="btn btn-primary" id="tim-save">Sačuvaj sve</button>'
      + '<button class="btn btn-ghost" id="tim-reset">Vrati na podrazumevano</button><span class="hint" id="tim-dirty" style="margin:0"></span></div>';

    function markDirty(){ var n=0; var ins=host.querySelectorAll('.tim-field input'); for(var i=0;i<ins.length;i++){ var el=ins[i]; var def=parseInt(el.getAttribute('data-def'),10); var v=parseInt(el.value,10); if(!isNaN(v)&&v!==def){ el.classList.add('changed'); n++; } else el.classList.remove('changed'); } $('tim-dirty').textContent=n===0?'Sve na podrazumevanom.':(n+' izmenjeno.'); }
    var ins=host.querySelectorAll('.tim-field input');
    for(var i=0;i<ins.length;i++) ins[i].oninput=markDirty;
    markDirty();
    function collect(){
      var out={}; var els=host.querySelectorAll('.tim-field input'); var ok=true;
      for(var i=0;i<els.length;i++){ var el=els[i]; var g=el.getAttribute('data-g'),k=el.getAttribute('data-k'); var v=parseInt(el.value,10); var mn=parseInt(el.getAttribute('min'),10),mx=parseInt(el.getAttribute('max'),10); if(isNaN(v)){ showErr('Unesi broj za sva polja.'); ok=false; break; } if(v<mn||v>mx){ showErr('Vrednost '+v+' van opsega '+mn+'–'+mx+'.'); ok=false; break; } (out[g]=out[g]||{})[k]=v; }
      return ok?out:null;
    }
    $('tim-save').onclick=function(){ var b=collect(); if(!b)return; $('tim-save').disabled=true; api('PUT','/api/admin/timing-config',b).then(function(d){ timState.overrides=d.overrides||{}; renderTiminzi(host,ctx); showOk('Sačuvano.'); }).catch(function(e){ showErr(e.message); }).then(function(){ var x=$('tim-save'); if(x)x.disabled=false; }); };
    $('tim-reset').onclick=function(){ if(!window.confirm('Vratiti sva vremena na podrazumevano?'))return; api('PUT','/api/admin/timing-config',{}).then(function(d){ timState.overrides=d.overrides||{}; renderTiminzi(host,ctx); showOk('Vraćeno.'); }).catch(function(e){ showErr(e.message); }); };
  }

  // ---- Podaci (backup + factory reset) ----
  var dataStatus=null;  // { deployMode }
  function renderData(host, ctx){
    if(!dataStatus){
      host.innerHTML='<div class="empty">Učitavanje…</div>';
      api('GET','/api/admin/data-status').then(function(d){ dataStatus=d; renderData(host,ctx); }).catch(function(e){ showErr(e.message); });
      return;
    }
    var deploy=!!dataStatus.deployMode;
    host.innerHTML=
      '<p class="hint" style="margin-bottom:1rem">Backup i vraćanje svega: svi packovi, pitanja, slike, audio snimci i timinzi.</p>'
      + '<div class="tim-card" style="margin-bottom:1rem"><div style="font-weight:800;color:var(--navy);margin-bottom:.4rem">📥 Uvezi .zip kviz pack</div>'
      + '<p class="hint" style="margin:.2rem 0 .9rem">Ubaci pack napravljen u <a href="/kviz-generator" target="_blank" style="color:var(--gold);font-weight:700">generatoru kvizova</a> (.zip sa pitanjima i slikama/audiom). Pravi se NOVI pack — postojeći se ne menja. Podržan je i običan .json manifest.</p>'
      + '<input type="file" id="data-import-file" accept=".zip,.json,application/zip,application/json" style="display:none">'
      + '<button class="btn btn-primary" id="data-import">Izaberi .zip / .json</button>'
      + '<span class="hint" id="data-import-name" style="margin-left:.6rem"></span></div>'
      + '<div class="tim-card" style="margin-bottom:1rem"><div style="font-weight:800;color:var(--navy);margin-bottom:.4rem">💾 Backup</div>'
      + '<p class="hint" style="margin:.2rem 0 .9rem">Preuzmi .zip sa celokupnim trenutnim sadržajem (svi packovi + slike + audio + timinzi). Čuvaj ga van servera.</p>'
      + '<button class="btn btn-primary" id="data-backup">Preuzmi backup (.zip)</button></div>'
      + '<div class="tim-card"><div style="font-weight:800;color:var(--navy);margin-bottom:.4rem">↩ Vrati na fabričko</div>'
      + '<p class="hint" style="margin:.2rem 0 .9rem">Vraća sav sadržaj na podrazumevano stanje iz aplikacije. <b>Sve izmene, dodati packovi i uploadovane slike/audio se trajno brišu.</b> Preuzmi backup pre ovoga!</p>'
      + (deploy
          ? '<button class="btn btn-danger" id="data-reset">Vrati sve na fabričko</button>'
          : '<button class="btn btn-danger" id="data-reset" disabled>Nedostupno u dev modu</button><p class="hint" style="margin-top:.55rem">Reset radi samo na serveru (DATA_DIR + SEED_DIR postavljeni).</p>')
      + '</div>';

    $('data-import').onclick=function(){ $('data-import-file').click(); };
    $('data-import-file').onchange=function(e){
      var f=e.target.files&&e.target.files[0]; e.target.value=''; if(!f)return;
      $('data-import-name').textContent=f.name+' …';
      var btn=$('data-import'); btn.disabled=true;
      fetch('/api/admin/import-quiz-zip', { method:'POST', headers:{ 'X-Admin-Token':Admin.getToken(), 'Content-Type':'application/octet-stream' }, body:f })
        .then(function(res){ return res.json().then(function(d){ if(!res.ok) throw new Error(d.error||('Greška '+res.status)); return d; }); })
        .then(function(d){
          var extra=''; if(d.assetsWritten) extra=' · '+d.assetsWritten+' fajlova';
          if(d.missingAssets&&d.missingAssets.length) extra+=' · ⚠ nedostaje '+d.missingAssets.length+' fajl(ova)';
          $('data-import-name').textContent='✓ „'+((d.item&&d.item.name)||d.id)+'"'+extra;
          showOk('Pack uvezen kao „'+d.id+'". Vidljiv je u Kviz tabu.');
          // Refresh the cached kviz pack list so it shows up immediately.
          if(window.AdminApp.reloadPacks) window.AdminApp.reloadPacks('kviz');
        })
        .catch(function(err){ $('data-import-name').textContent=''; showErr(err.message); })
        .then(function(){ var b=$('data-import'); if(b)b.disabled=false; });
    };

    $('data-backup').onclick=function(){
      var btn=$('data-backup'); btn.disabled=true; btn.textContent='Pravim backup…';
      fetch('/api/admin/backup', { headers: { 'X-Admin-Token': Admin.getToken() } })
        .then(function(res){ if(!res.ok) throw new Error('Backup nije uspeo ('+res.status+').'); return res.blob().then(function(b){ return { b:b, res:res }; }); })
        .then(function(o){
          var name='igra-backup.zip';
          var cd=o.res.headers.get('Content-Disposition')||'';
          var m=cd.match(/filename="([^"]+)"/); if(m) name=m[1];
          var url=URL.createObjectURL(o.b);
          var a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click();
          document.body.removeChild(a); URL.revokeObjectURL(url);
          showOk('Backup preuzet.');
        })
        .catch(function(e){ showErr(e.message); })
        .then(function(){ var x=$('data-backup'); if(x){ x.disabled=false; x.textContent='Preuzmi backup (.zip)'; } });
    };

    var rb=$('data-reset');
    if(rb && !rb.disabled) rb.onclick=function(){
      if(!window.confirm('Vratiti SVE na fabričko? Svi packovi, izmene, slike i audio se trajno brišu. Ova akcija se ne može poništiti.')) return;
      if(!window.confirm('Sigurno? Poslednja potvrda.')) return;
      rb.disabled=true; rb.textContent='Vraćam…';
      api('POST','/api/admin/reset-defaults',{ confirm:true }).then(function(){
        showOk('Vraćeno na fabričko. Osvežavam…');
        setTimeout(function(){ location.reload(); }, 700);
      }).catch(function(e){ showErr(e.message); rb.disabled=false; rb.textContent='Vrati sve na fabričko'; });
    };
  }

  // ---------- prigovori (player feedback: reports + ratings) ----------
  var FB_TYPE={obicno:'❓',audio:'🎵',video:'🎬',geo:'🗺️',broj:'🔢',emoji:'😀',uljez:'🕵️',dopuna:'✍️',piksel:'🧩',anagram:'🔀',redosled:'↕️'};
  var FB_DEFTEXT={geo:'Gde je ovo slikano?',emoji:'Šta se krije iza emojija?',uljez:'Pronađi uljeza!',dopuna:'Završi citat!',piksel:'Šta je na slici?',anagram:'Reši anagram!'};
  var fbData=null; // { feedback, packs } cached across re-renders
  function fbAnswerBrief(q){
    if(!q) return '';
    var t=q.type||'obicno';
    if(t==='geo') return '📍 '+esc(q.caption||'(bez captiona)')+(q.lat!=null?(' · '+Number(q.lat).toFixed(2)+', '+Number(q.lng).toFixed(2)):'');
    if(t==='broj') return '✔ '+esc(String(q.answer))+(q.unit?' '+esc(q.unit):'');
    if(t==='emoji') return esc(q.emojis||'')+' → ✔ '+esc(q.answer||'');
    if(t==='dopuna') return '„'+esc(q.quote||'')+' …" → ✔ '+esc(q.answer||'');
    if(t==='piksel'||t==='anagram') return '✔ '+esc(q.answer||'');
    if(t==='redosled') return (Array.isArray(q.items)?q.items.map(esc).join(' · '):'');
    var o=Array.isArray(q.options)?q.options:[]; return o.map(function(x,i){return (i===q.correctIndex?'✔ ':'')+esc(x);}).join(' · ');
  }
  function fbResolve(key, packsById){
    var parts=String(key).split(':');
    if(parts[0]==='pack' && parts.length===3){
      var packId=parts[1], idx=parseInt(parts[2],10);
      var pack=packsById[packId];
      var q=(pack && Array.isArray(pack.questions))?pack.questions[idx]:null;
      return { source:'pack', packId:packId, packName:(pack?(pack.name||pack.id):packId), idx:idx, q:q, missing:!pack||!q };
    }
    if(parts[0]==='bank'){
      return { source:'bank', packId:null, packName:'Ugrađeni bank', idx:parseInt(parts[1],10), q:null, missing:false };
    }
    return { source:'?', packId:null, packName:'?', idx:-1, q:null, missing:true };
  }
  function renderFeedback(host, ctx){
    if(fbData){ paintFeedback(host,ctx); return; }
    host.innerHTML='<div class="empty">Učitavanje prigovora…</div>';
    Promise.all([ api('GET','/api/admin/quiz-feedback'), api('GET','/api/admin/quiz-packs') ])
      .then(function(r){ fbData={ feedback:r[0].feedback||{}, packs:(r[1].packs)||[] }; paintFeedback(host,ctx); })
      .catch(function(e){ host.innerHTML='<div class="empty">Greška pri učitavanju: '+esc(e.message)+'</div>'; });
  }
  function paintFeedback(host, ctx){
    var packsById={}; (fbData.packs||[]).forEach(function(p){ packsById[p.id]=p; });
    var fb=fbData.feedback||{};
    var entries=[];
    for(var key in fb){
      if(!Object.prototype.hasOwnProperty.call(fb,key)) continue;
      var v=fb[key]||{};
      if(!(v.reports>0)) continue; // Prigovori = prijavljena pitanja.
      var info=fbResolve(key, packsById);
      entries.push({ key:key, reports:v.reports||0, ratingCount:v.ratingCount||0,
        avg:(v.ratingCount>0?v.ratingSum/v.ratingCount:null), lastReportAt:v.lastReportAt||0, info:info });
    }
    entries.sort(function(a,b){ if(b.reports!==a.reports) return b.reports-a.reports; return (b.lastReportAt||0)-(a.lastReportAt||0); });

    var head='<div class="fb-head"><div><div class="fb-title">🚩 Prijavljena pitanja</div>'
      +'<div class="hint" style="margin:.2rem 0 0">Pitanja koja su igrači prijavili kao netačna tokom igre. Prijava se beleži čim igrač klikne „Prijavi", i pre isteka vremena.</div></div>'
      +'<button class="btn btn-ghost btn-sm" id="fb-refresh">↻ Osveži</button></div>';

    var body;
    if(entries.length===0){
      body='<div class="empty">Nema prijavljenih pitanja. 🎉</div>';
    } else {
      body='';
      entries.forEach(function(e){
        var info=e.info; var q=info.q; var t=q?(q.type||'obicno'):'';
        var icon=FB_TYPE[t]||'•';
        var text;
        if(info.source==='bank') text='Pitanje #'+(isNaN(info.idx)?'?':(info.idx+1))+' iz ugrađenog banka';
        else if(info.missing) text='Nepoznato pitanje (možda obrisano)';
        else text=q.text || FB_DEFTEXT[t] || '(bez teksta)';
        var ratingHtml=(e.avg!=null)?'<span class="fb-badge fb-rate" title="'+e.ratingCount+' ocena">★ '+e.avg.toFixed(1)+' ('+e.ratingCount+')</span>':'';
        var openBtn=(info.source==='pack' && !info.missing)
          ? '<button class="btn btn-ghost btn-sm fb-open" data-pk="'+esc(info.packId)+'">Otvori pack →</button>' : '';
        body+='<div class="fb-row">'
          +'<div class="fb-flag">🚩<b>'+e.reports+'</b></div>'
          +'<div class="fb-main"><div class="fb-text">'+(q?('<span class="fb-ico">'+icon+'</span>'):'')+esc(text)+'</div>'
          +'<div class="fb-meta">'+esc(info.packName)+(q?(' · '+icon+' '+esc(t)):'')+' '+ratingHtml+'</div>'
          +(q?'<div class="fb-ans">'+fbAnswerBrief(q)+'</div>':'')
          +'</div>'
          +'<div class="fb-acts">'+openBtn
          +'<button class="btn btn-danger btn-sm fb-clear" data-key="'+esc(e.key)+'">✓ Reši</button></div>'
          +'</div>';
      });
    }
    host.innerHTML=head+'<div class="fb-list">'+body+'</div>';

    $('fb-refresh').onclick=function(){ fbData=null; renderFeedback(host,ctx); };
    var opens=host.querySelectorAll('.fb-open');
    for(var i=0;i<opens.length;i++) opens[i].onclick=function(){ window.AdminApp.goToPack('kviz', this.getAttribute('data-pk')); };
    var clears=host.querySelectorAll('.fb-clear');
    for(var c=0;c<clears.length;c++) clears[c].onclick=function(){
      var key=this.getAttribute('data-key');
      if(!window.confirm('Označiti kao rešeno i ukloniti prijave/ocene za ovo pitanje?')) return;
      api('POST','/api/admin/quiz-feedback/clear',{key:key}).then(function(){ if(fbData&&fbData.feedback)delete fbData.feedback[key]; paintFeedback(host,ctx); showOk('Rešeno.'); })
        .catch(function(e){ showErr(e.message); });
    };
  }

  window.AdminApp.register('tajni',    { renderMain: renderTajni });
  window.AdminApp.register('gluvo',    { renderMain: renderGluvo });
  window.AdminApp.register('spijun',   { renderMain: renderSpijun });
  window.AdminApp.register('feedback', { renderMain: renderFeedback });
  window.AdminApp.register('timinzi',  { renderMain: renderTiminzi });
  window.AdminApp.register('data',     { renderMain: renderData });
})();
</script>
</body>
</html>`;
}

/**
 * Per-view CSS (table, sheet, chips, role grid, timinzi…) kept in one block so
 * later phases extend it without touching the shell above.
 */
const ADMIN_VIEW_CSS = `
/* ---- table editor (kviz + ko-sam-ja) ---- */
.tbl-tools{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:.75rem}
.tbl-search{position:relative;flex:1;min-width:180px;max-width:360px}
.tbl-search span{position:absolute;left:.7rem;top:50%;transform:translateY(-50%);color:var(--dim)}
.tbl-search input{padding-left:2rem}
.tbl-filterbar{margin-bottom:.9rem}
.tbl-filters{display:flex;gap:.3rem;flex-wrap:wrap}
.tbl-sortbar{display:flex;align-items:center;gap:.5rem;margin:-.4rem 0 .9rem}
.tbl-sortlbl{font-size:.8rem;font-weight:700;color:var(--dim)}
.tbl-sort{background:var(--surface3);color:var(--ink);border:1.5px solid var(--line2);border-radius:9px;padding:.35rem .6rem;font-size:.82rem;font-weight:600;cursor:pointer;max-width:230px}
.fb-head{display:flex;align-items:flex-start;gap:1rem;justify-content:space-between;margin-bottom:1.1rem;flex-wrap:wrap}
.fb-title{font-size:1.15rem;font-weight:800;color:var(--navy)}
.fb-list{display:flex;flex-direction:column;gap:.5rem}
.fb-row{display:flex;align-items:center;gap:.9rem;background:var(--surface);border:1.5px solid var(--line2);border-radius:12px;padding:.7rem .9rem}
.fb-flag{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:2.3rem;color:#B85C4F;font-size:.85rem;line-height:1.1}
.fb-flag b{font-size:1.15rem}
.fb-main{flex:1;min-width:0}
.fb-text{font-weight:700;color:var(--navy);display:flex;align-items:center;gap:.4rem}
.fb-ico{opacity:.85}
.fb-meta{font-size:.8rem;color:var(--dim);margin-top:.15rem}
.fb-ans{font-size:.82rem;color:var(--muted);margin-top:.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fb-badge{display:inline-flex;align-items:center;gap:.2rem;font-size:.72rem;font-weight:800;padding:2px 8px;border-radius:12px}
.fb-rate{color:#8a6f2c;background:rgba(194,155,71,.16)}
.fb-acts{display:flex;gap:.4rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.chip-f{display:inline-flex;align-items:center;gap:.3rem;border:1.5px solid var(--line2);background:var(--surface);color:var(--navy);
  font-weight:700;font-size:.82rem;padding:.38rem .7rem;border-radius:20px;white-space:nowrap;cursor:pointer}
.chip-f.on{background:var(--navy);color:#F5EBE0;border-color:var(--navy)}
.chip-f .c-n{opacity:.7;font-weight:800}
.tbl{display:flex;flex-direction:column;gap:.4rem}
.tbl-head{display:grid;grid-template-columns:52px 1fr auto;gap:.6rem;align-items:center;padding:.5rem 1rem;background:var(--surface2);border-radius:12px;
  font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:var(--muted)}
.tbl-row{display:grid;grid-template-columns:52px 1fr auto;gap:.6rem;align-items:center;padding:.7rem 1rem;
  background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 1px 4px rgba(29,53,87,.04)}
.tbl-row:hover{background:var(--surface3)}
/* Compact type column (kviz): icon only, narrow first column. */
.tbl-icont .tbl-head,.tbl-icont .tbl-row{grid-template-columns:40px 1fr auto}
.tbl-icont .t-type .tl{display:none}
.t-type{display:flex;flex-direction:column;align-items:center;gap:2px}
.t-type .ti{font-size:1.15rem;line-height:1}
.t-type .tl{font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;text-align:center}
.t-main{min-width:0}
.t-line1{display:flex;align-items:center;gap:.5rem}
.t-num{font-size:.72rem;font-weight:800;color:var(--dim);flex:none}
.t-text{font-weight:700;font-size:.95rem;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.t-mtag{font-size:.62rem;font-weight:800;padding:1px 6px;border-radius:6px;flex:none}
.t-ans{color:var(--muted);font-size:.82rem;margin-top:.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.t-ans .ok{color:var(--green);font-weight:800}
.t-acts{display:flex;align-items:center;gap:.4rem}
.t-time{font-size:.72rem;font-weight:800;color:var(--muted);background:var(--surface2);padding:3px 8px;border-radius:8px;white-space:nowrap}
.iconbtn{width:32px;height:32px;border-radius:9px;font-size:.85rem;border:1px solid rgba(29,53,87,.18);background:var(--surface3);color:var(--muted)}
.iconbtn.edit{color:var(--navy)}
.iconbtn.del{color:var(--red);border-color:rgba(176,74,66,.35);background:rgba(176,74,66,.08)}
.add-row{width:100%;margin-top:.7rem;border:1.5px dashed rgba(29,53,87,.28);background:transparent;color:var(--navy);
  font-weight:700;font-size:.9rem;padding:.75rem;border-radius:13px;cursor:pointer}
.add-row:hover{background:var(--surface);border-color:var(--gold)}
.tag-chip{display:inline-block;font-size:.62rem;font-weight:800;padding:1px 7px;border-radius:6px;background:var(--surface2);color:var(--muted);
  margin-right:.3rem;text-transform:uppercase;letter-spacing:.04em}
.tag-nsfw{background:rgba(176,74,66,.14);color:var(--red)}

/* ---- slide-in editor sheet ---- */
.sheet-scrim{position:fixed;inset:0;background:rgba(20,40,63,.42);backdrop-filter:blur(2px);z-index:50;animation:fadeIn .18s ease}
.sheet{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);background:var(--bg);z-index:51;
  box-shadow:-16px 0 48px rgba(20,40,63,.28);display:flex;flex-direction:column;animation:sheetIn .22s cubic-bezier(.2,.8,.2,1)}
.sheet-head{padding:1.1rem 1.3rem;border-bottom:1px solid var(--line);background:var(--surface)}
.sheet-eyebrow{font-size:.64rem;letter-spacing:.18em;text-transform:uppercase;color:var(--amber);font-weight:800}
.sheet-title{font-size:1.2rem;font-weight:800;color:var(--navy);margin-top:2px}
.sheet-x{border:1px solid rgba(29,53,87,.18);background:var(--surface3);width:36px;height:36px;border-radius:10px;font-size:1rem;color:var(--muted)}
.sheet-tabs{display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.9rem}
.sheet-tab{display:inline-flex;align-items:center;gap:.3rem;border:1.5px solid rgba(29,53,87,.16);background:var(--surface3);
  color:var(--muted);font-weight:700;font-size:.82rem;padding:.4rem .7rem;border-radius:10px;cursor:pointer}
.sheet-body{flex:1;overflow-y:auto;padding:1.3rem}
.sheet-foot{padding:1rem 1.3rem;border-top:1px solid var(--line);background:var(--surface);display:flex;gap:.6rem;align-items:center}
.opt-row{display:flex;align-items:center;gap:.6rem;margin-bottom:.5rem}
.opt-row input[type=radio],.opt-row input[type=checkbox]{width:20px;height:20px;flex:none;cursor:pointer}
.opt-row input[type=radio]{accent-color:#3E7D57}
.opt-row input[type=checkbox]{accent-color:#A07D2E}
.num-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.6rem}
.num-grid .sub{font-size:.72rem;color:var(--dim);font-weight:700}
.dropzone{border:1.5px dashed rgba(29,53,87,.28);border-radius:12px;padding:1rem;text-align:center;background:var(--surface3)}
.dropzone img{display:block;max-width:100%;max-height:190px;border-radius:8px;margin:0 auto .5rem}
.q-thumb{max-width:140px;max-height:100px;border-radius:8px;margin-top:.4rem;display:block}
.info-note{border-radius:12px;padding:.8rem 1rem;margin-top:1rem;font-size:.86rem}
.info-peer{background:rgba(184,92,79,.08);border:1px solid rgba(184,92,79,.28);color:#8a463c}

/* ---- geo map picker ---- */
#map-wrap{position:relative;width:100%;max-width:460px;overflow:hidden;border-radius:12px;border:1px solid var(--line2);
  background:#0B1728;touch-action:none;cursor:crosshair;aspect-ratio:1901/2386;margin-top:.3rem}
#map-content{position:absolute;inset:0;transform-origin:0 0}
#map-content img{position:absolute;inset:0;width:100%;height:100%;user-select:none}
#map-pin{position:absolute;transform:translate(-50%,-100%);pointer-events:none;display:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6));font-size:26px;line-height:1}
.map-btns{position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:4px}
.map-btns button{width:36px;height:36px;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;font-size:1.1rem;font-weight:800}
.map-row{background:var(--surface2);border-radius:10px;padding:.5rem .7rem;display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem;font-size:.85rem}
.map-row img{width:52px;height:40px;object-fit:cover;border-radius:6px}

/* ---- chips (tajni / spijun) ---- */
.chips{display:flex;flex-wrap:wrap;gap:.5rem}
.chip{display:inline-flex;align-items:center;gap:.45rem;background:var(--surface2);border:1px solid var(--line);color:var(--navy);
  font-weight:700;font-size:.9rem;padding:.35rem .4rem .35rem .8rem;border-radius:20px}
.chip .x{border:none;background:rgba(176,74,66,.12);color:var(--red);width:22px;height:22px;border-radius:50%;font-size:.75rem;line-height:1}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:1rem}

/* ---- gluvo roles ---- */
.role-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.6rem}
.role-btn{display:flex;align-items:flex-start;gap:.65rem;text-align:left;background:var(--surface);border:1.5px solid var(--line);border-radius:13px;padding:.7rem .85rem;cursor:pointer}
.role-btn.on{background:#FFFCF7;border-color:var(--gold)}
.role-btn .re{font-size:1.5rem;flex:none}
.role-btn .rn{display:block;font-weight:800;color:var(--navy)}
.role-btn .rd{display:block;font-size:.74rem;color:var(--muted);margin-top:.25rem;line-height:1.35}
.role-toggle{width:38px;height:22px;border-radius:20px;position:relative;flex:none;margin-top:.15rem;background:#C7BDB0}
.role-toggle.on{background:var(--green)}
.role-toggle span{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s}
.role-toggle.on span{left:18px}
.team-head{font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;font-weight:800;margin:1.1rem 0 .5rem}
.stepper{display:flex;align-items:center;gap:1rem;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:.9rem 1.1rem;margin-bottom:1rem}
.stepper button{border:1.5px solid var(--line2);background:var(--surface3);width:38px;height:38px;border-radius:10px;font-size:1.1rem;font-weight:800;color:var(--navy)}
.stepper .val{font-family:'Baloo 2';font-size:1.5rem;font-weight:700;color:var(--navy);min-width:2ch;text-align:center}

/* ---- timinzi ---- */
.tim-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:.9rem 1.1rem;margin-bottom:.9rem;max-width:680px}
.tim-field{display:flex;align-items:center;gap:.7rem;padding:.45rem 0;border-top:1px solid var(--line)}
.tim-field:first-of-type{border-top:none}
.tim-field .l{flex:1;min-width:0;font-size:.9rem;font-weight:600}
.tim-field .b{color:var(--dim);font-size:.72rem;font-weight:600}
.tim-field input{max-width:96px;text-align:center}
.tim-field input.changed{border-color:var(--gold);background:#FFF9EC}

/* On phones, stack the table toolbar: filters on their own row, search on
   its own row, "Novo pitanje" last — instead of cramming all three. */
@media (max-width:860px){
  .tbl-tools{flex-direction:column;flex-wrap:nowrap;align-items:stretch}
  .tbl-filters{order:1;flex-wrap:nowrap;overflow-x:auto;min-width:0}
  .tbl-filters::-webkit-scrollbar{height:0}
  .chip-f{flex:none}
  .tbl-search{order:2;max-width:none}
  .tbl-tools .btn-primary{order:3}
}
`;
