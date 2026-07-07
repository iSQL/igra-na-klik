/**
 * Standalone admin editor page for geo-packs, served at GET /admin/geo.
 *
 * Plain HTML + vanilla JS in a template literal (same approach as the
 * landing page in index.ts). IMPORTANT: the inline script must not contain
 * backticks or the `${` sequence — the whole page lives inside a TS template
 * literal. Use string concatenation in the page JS.
 *
 * The page does no geo math: map clicks are sent to the server as
 * normalized {x, y} pins, and the server returns each location's derived
 * pin alongside lat/lng.
 */

import { renderAdminNav, ADMIN_NAV_CSS } from './admin-shell.js';

export function renderGeoEditorPage(districts: readonly string[]): string {
  return PAGE_HTML.replace('__DISTRICTS__', JSON.stringify(districts))
    .replace('__NAV__', renderAdminNav('geo'))
    .replace('__NAV_CSS__', ADMIN_NAV_CSS);
}

const PAGE_HTML = `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Geo editor · Igra Na Klik</title>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0b0a17;--surface:#1a1735;--surface2:#252148;
  --line:rgba(255,255,255,.09);--line2:rgba(255,255,255,.16);
  --ink:#fff;--muted:#9c97c4;--dim:#635e86;
  --pink:#ff2e88;--violet:#8b41f2;--cyan:#22dee6;--amber:#ffb627;
  --green:#2fe08a;--red:#ff4d5e;
  --grad:linear-gradient(120deg,#ff2e88,#8b41f2);
}
html,body{min-height:100%}
body{
  font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
  background:
    radial-gradient(1200px 700px at 15% -10%, rgba(139,65,242,.18), transparent 60%),
    radial-gradient(1000px 600px at 95% 0%, rgba(255,46,136,.14), transparent 55%),
    var(--bg);
  color:var(--ink);-webkit-text-size-adjust:100%;
}
.wrap{max-width:1100px;margin:0 auto;padding:1.2rem 1rem 4rem}
h1{font-size:1.5rem;font-weight:800;margin-bottom:0.2rem}
h1 .grad{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:1.1rem;font-weight:800;margin:1.4rem 0 0.7rem}
.sub{color:var(--muted);font-size:0.85rem;margin-bottom:1.2rem}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:1rem}
button{font:inherit;cursor:pointer;border:none;min-height:42px}
.btn{padding:0.55rem 1.1rem;border-radius:12px;font-weight:800;font-size:0.9rem}
.btn-primary{background:var(--grad);color:#fff;box-shadow:0 8px 20px rgba(255,46,136,.3)}
.btn-primary:disabled{background:var(--surface2);color:var(--dim);box-shadow:none;cursor:not-allowed}
.btn-ghost{background:transparent;color:var(--ink);border:1.5px solid var(--line2)}
.btn-danger{background:rgba(255,77,94,.14);color:var(--red);border:1px solid rgba(255,77,94,.5)}
.btn-sm{min-height:34px;padding:0.3rem 0.7rem;font-size:0.8rem;border-radius:9px}
input[type=text],textarea,select{
  font:inherit;width:100%;background:var(--bg);color:var(--ink);
  border:1.5px solid var(--line2);border-radius:11px;padding:0.55rem 0.75rem;min-height:42px;
}
input[type=text]:focus,textarea:focus,select:focus{outline:none;border-color:var(--cyan);box-shadow:0 0 0 3px rgba(34,222,230,.15)}
label{display:block;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin:0.8rem 0 0.35rem}
.err{background:rgba(255,77,94,.12);border:1px solid rgba(255,77,94,.45);color:var(--red);border-radius:11px;padding:0.55rem 0.8rem;font-size:0.85rem;font-weight:700;margin:0.8rem 0;display:none}
.ok-msg{background:rgba(47,224,138,.12);border:1px solid rgba(47,224,138,.45);color:var(--green);border-radius:11px;padding:0.55rem 0.8rem;font-size:0.85rem;font-weight:700;margin:0.8rem 0;display:none}
.row{display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap}
.spacer{flex:1}
.pack-row{display:flex;align-items:center;gap:0.8rem;padding:0.7rem 0.9rem;background:var(--surface);border:1px solid var(--line);border-radius:13px;margin-bottom:0.5rem}
.pack-row .name{font-weight:800}
.pack-row .meta{color:var(--muted);font-size:0.8rem}
.badge{font-size:0.68rem;font-weight:800;padding:2px 8px;border-radius:7px;background:rgba(255,182,39,.14);color:var(--amber)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:0.7rem}
.loc-card{background:var(--surface);border:1px solid var(--line);border-radius:13px;overflow:hidden}
.loc-card img{width:100%;height:120px;object-fit:cover;display:block;background:#000}
.loc-card .body{padding:0.55rem 0.7rem}
.loc-card .cap{font-weight:800;font-size:0.85rem;min-height:1.2em}
.loc-card .coords{color:var(--dim);font-size:0.72rem;margin:0.2rem 0 0.5rem}
.editor-cols{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
@media(max-width:820px){.editor-cols{grid-template-columns:1fr}}
#map-wrap{position:relative;width:100%;aspect-ratio:1901/2386;background:#0e1424;border-radius:13px;overflow:hidden;touch-action:none;cursor:crosshair;user-select:none}
#map-content{position:absolute;inset:0;transform-origin:0 0}
#map-content img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;-webkit-user-drag:none}
.map-dot{position:absolute;width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 0 1.5px rgba(255,255,255,.8);transform:translate(-50%,-50%);pointer-events:none;opacity:0.75}
#map-pin{position:absolute;transform:translate(-50%,-100%);pointer-events:none;display:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6));font-size:26px;line-height:1}
.map-btns{position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:6px}
.map-btns button{width:38px;height:38px;min-height:38px;border-radius:10px;background:rgba(0,0,0,.55);color:#fff;font-weight:800;font-size:1rem}
#drop-zone{border:1.5px dashed var(--line2);border-radius:13px;padding:0.9rem;text-align:center;color:var(--muted);font-size:0.85rem;font-weight:700;cursor:pointer}
#drop-zone.has-img{padding:0}
#img-preview{width:100%;max-height:260px;object-fit:contain;border-radius:12px;display:none}
.hint{color:var(--dim);font-size:0.75rem;margin-top:0.3rem}
.top-actions{display:flex;gap:0.5rem;align-items:center;margin-bottom:0.8rem}
a.back{color:var(--muted);text-decoration:none;font-weight:800;font-size:0.85rem}
a.back:hover{color:var(--ink)}
__NAV_CSS__
</style>
</head>
<body>
<div class="wrap">
  <h1>Geo editor <span class="grad">· Igra Na Klik</span></h1>
  __NAV__
  <p class="sub">Packovi za „Pogodi gde je" i „Foto kviz" — dodaj sliku, klikni lokaciju na mapi, sačuvaj.</p>
  <div class="err" id="err"></div>
  <div class="ok-msg" id="ok"></div>

  <!-- TOKEN GATE -->
  <div id="view-token" class="card" style="max-width:420px">
    <label for="token-input">Admin token</label>
    <input type="text" id="token-input" autocomplete="off" placeholder="ADMIN_TOKEN iz .env">
    <div style="margin-top:0.8rem">
      <button class="btn btn-primary" id="token-btn">Uđi</button>
    </div>
    <p class="hint">Token se čuva samo u ovom browseru (localStorage).</p>
  </div>

  <!-- PACK LIST -->
  <div id="view-list" style="display:none">
    <h2>Packovi</h2>
    <div id="pack-list"></div>
    <div class="card" style="max-width:520px;margin-top:1rem">
      <strong style="font-size:0.95rem">Novi pack</strong>
      <label for="new-name">Naziv</label>
      <input type="text" id="new-name" placeholder="npr. Planine Srbije">
      <label for="new-desc">Opis (opciono)</label>
      <input type="text" id="new-desc" placeholder="Kratak opis packa">
      <div style="margin-top:0.9rem">
        <button class="btn btn-primary" id="create-btn">＋ Napravi pack</button>
      </div>
    </div>
  </div>

  <!-- PACK DETAIL -->
  <div id="view-pack" style="display:none">
    <div class="top-actions">
      <a href="#" class="back" id="back-btn">← Svi packovi</a>
      <span class="spacer"></span>
      <button class="btn btn-danger btn-sm" id="delete-pack-btn">Obriši pack</button>
    </div>
    <div class="card" style="margin-bottom:1rem">
      <div class="row">
        <div style="flex:2;min-width:220px">
          <label for="pack-name">Naziv</label>
          <input type="text" id="pack-name">
        </div>
        <div style="flex:3;min-width:220px">
          <label for="pack-desc">Opis</label>
          <input type="text" id="pack-desc">
        </div>
        <div style="align-self:flex-end">
          <button class="btn btn-ghost" id="save-meta-btn">Sačuvaj</button>
        </div>
      </div>
    </div>

    <h2 id="editor-title">Nova lokacija</h2>
    <div class="editor-cols">
      <div>
        <div id="drop-zone">
          <span id="drop-label">📷 Klikni ili prevuci sliku ovde</span>
          <img id="img-preview" alt="">
        </div>
        <input type="file" id="file-input" accept="image/*" style="display:none">
        <p class="hint" id="img-hint">Slika se automatski smanjuje na max 1920px (JPEG).</p>
        <label for="caption-input">Caption / naziv lokacije</label>
        <input type="text" id="caption-input" maxlength="200" placeholder="npr. Đavolja varoš">
        <p class="hint">Foto kviz koristi caption kao tačan odgovor — obavezno ga popuni ako pack treba da radi i tamo.</p>
        <label for="district-select">Okrug (opciono)</label>
        <select id="district-select"><option value="">— bez okruga —</option></select>
        <div class="row" style="margin-top:1rem">
          <button class="btn btn-primary" id="save-loc-btn">Sačuvaj lokaciju</button>
          <button class="btn btn-ghost" id="cancel-edit-btn" style="display:none">Otkaži izmenu</button>
          <span class="spacer"></span>
          <span class="hint" id="pin-readout">Pin nije postavljen</span>
        </div>
      </div>
      <div>
        <div id="map-wrap">
          <div id="map-content">
            <img src="/admin/serbia-map.png" alt="Mapa Srbije" draggable="false">
            <div id="map-dots"></div>
            <div id="map-pin">📍</div>
          </div>
          <div class="map-btns">
            <button type="button" id="zoom-in">＋</button>
            <button type="button" id="zoom-out">−</button>
            <button type="button" id="zoom-reset">↻</button>
          </div>
        </div>
        <p class="hint">Klik postavlja pin · točkić miša zumira · prevlačenje pomera uvećanu mapu. Plave tačke su postojeće lokacije.</p>
      </div>
    </div>

    <h2>Lokacije u packu (<span id="loc-count">0</span>)</h2>
    <div class="grid" id="loc-grid"></div>
  </div>
</div>

<script>
(function(){
  'use strict';
  var DISTRICTS = __DISTRICTS__;
  var TOKEN_KEY = 'igra-admin-token';
  var token = localStorage.getItem(TOKEN_KEY) || '';
  var packs = [];
  var currentId = null;      // open pack id
  var editIndex = null;      // location index being edited, or null = new
  var pendingImage = null;   // base64 of a newly chosen image
  var pin = null;            // {x, y} normalized
  // map view state
  var zoom = 1, panX = 0, panY = 0;

  var $ = function(id){ return document.getElementById(id); };

  // ---------- messages ----------
  var errTimer = null, okTimer = null;
  function showErr(msg){
    var el = $('err'); el.textContent = msg; el.style.display = 'block';
    clearTimeout(errTimer); errTimer = setTimeout(function(){ el.style.display='none'; }, 6000);
  }
  function showOk(msg){
    var el = $('ok'); el.textContent = msg; el.style.display = 'block';
    clearTimeout(okTimer); okTimer = setTimeout(function(){ el.style.display='none'; }, 3000);
  }

  // ---------- api ----------
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

  // ---------- views ----------
  function show(view){
    $('view-token').style.display = view === 'token' ? 'block' : 'none';
    $('view-list').style.display = view === 'list' ? 'block' : 'none';
    $('view-pack').style.display = view === 'pack' ? 'block' : 'none';
  }
  function gate(){ localStorage.removeItem(TOKEN_KEY); show('token'); }

  function currentPack(){
    for (var i = 0; i < packs.length; i++) if (packs[i].id === currentId) return packs[i];
    return null;
  }

  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ---------- pack list ----------
  function renderList(){
    var box = $('pack-list');
    box.innerHTML = '';
    if (packs.length === 0){
      box.innerHTML = '<p class="sub">Nema packova — napravi prvi ispod.</p>';
      return;
    }
    packs.forEach(function(p){
      var row = document.createElement('div');
      row.className = 'pack-row';
      var html = '<div style="flex:1;min-width:0">'
        + '<div class="name">' + escapeHtml(p.name) + ' <span class="meta">(' + escapeHtml(p.id) + ')</span></div>'
        + '<div class="meta">' + p.locations.length + ' lokacija'
        + (p.description ? ' · ' + escapeHtml(p.description) : '') + '</div></div>';
      if (p.locations.length === 0) html += '<span class="badge">prazan · nevidljiv u igri</span>';
      row.innerHTML = html;
      var open = document.createElement('button');
      open.className = 'btn btn-ghost btn-sm';
      open.textContent = 'Otvori';
      open.onclick = function(){ openPack(p.id); };
      row.appendChild(open);
      box.appendChild(row);
    });
  }

  function refresh(){
    return api('GET', '/api/admin/geo-packs').then(function(data){
      packs = data.packs || [];
      renderList();
      if (currentId){
        var p = currentPack();
        if (p) renderPack(); else { currentId = null; show('list'); }
      }
    });
  }

  // ---------- pack detail ----------
  function openPack(id){
    currentId = id;
    resetLocForm();
    renderPack();
    show('pack');
    window.scrollTo(0, 0);
  }

  function renderPack(){
    var p = currentPack();
    if (!p) return;
    $('pack-name').value = p.name;
    $('pack-desc').value = p.description || '';
    $('loc-count').textContent = String(p.locations.length);
    var grid = $('loc-grid');
    grid.innerHTML = '';
    p.locations.forEach(function(loc, i){
      var card = document.createElement('div');
      card.className = 'loc-card';
      card.innerHTML = '<img src="' + escapeHtml(loc.imageUrl) + '" loading="lazy" alt="">'
        + '<div class="body">'
        + '<div class="cap">' + escapeHtml(loc.caption || '(bez captiona)') + '</div>'
        + '<div class="coords">' + loc.lat.toFixed(4) + ', ' + loc.lng.toFixed(4)
        + (loc.district ? ' · ' + escapeHtml(loc.district) : '') + '</div>'
        + '</div>';
      var body = card.querySelector('.body');
      var row = document.createElement('div');
      row.className = 'row';
      var edit = document.createElement('button');
      edit.className = 'btn btn-ghost btn-sm';
      edit.textContent = 'Izmeni';
      edit.onclick = function(){ startEdit(i); };
      var del = document.createElement('button');
      del.className = 'btn btn-danger btn-sm';
      del.textContent = 'Obriši';
      del.onclick = function(){
        if (!confirm('Obrisati ovu lokaciju?')) return;
        api('DELETE', '/api/admin/geo-packs/' + currentId + '/locations/' + i)
          .then(function(data){ replacePack(data.pack); showOk('Lokacija obrisana.'); })
          .catch(function(e){ showErr(e.message); });
      };
      row.appendChild(edit); row.appendChild(del);
      body.appendChild(row);
      grid.appendChild(card);
    });
    renderMapDots();
  }

  function replacePack(pack){
    for (var i = 0; i < packs.length; i++){
      if (packs[i].id === pack.id){ packs[i] = pack; break; }
    }
    renderList();
    renderPack();
    resetLocForm();
  }

  // ---------- location form ----------
  function resetLocForm(){
    editIndex = null;
    pendingImage = null;
    pin = null;
    $('editor-title').textContent = 'Nova lokacija';
    $('caption-input').value = '';
    $('district-select').value = '';
    $('img-preview').style.display = 'none';
    $('img-preview').src = '';
    $('drop-label').style.display = '';
    $('drop-zone').className = '';
    $('cancel-edit-btn').style.display = 'none';
    $('save-loc-btn').textContent = 'Sačuvaj lokaciju';
    updatePinUi();
  }

  function startEdit(i){
    var p = currentPack();
    if (!p || !p.locations[i]) return;
    var loc = p.locations[i];
    editIndex = i;
    pendingImage = null;
    pin = { x: loc.pin.x, y: loc.pin.y };
    $('editor-title').textContent = 'Izmena lokacije #' + (i + 1);
    $('caption-input').value = loc.caption || '';
    $('district-select').value = loc.district || '';
    $('img-preview').src = loc.imageUrl;
    $('img-preview').style.display = 'block';
    $('drop-label').style.display = 'none';
    $('drop-zone').className = 'has-img';
    $('cancel-edit-btn').style.display = '';
    $('save-loc-btn').textContent = 'Sačuvaj izmene';
    updatePinUi();
    window.scrollTo(0, 0);
  }

  function saveLocation(){
    if (!currentId) return;
    if (!pin){ showErr('Postavi pin na mapu.'); return; }
    if (editIndex === null && !pendingImage){ showErr('Izaberi sliku.'); return; }
    var body = {
      pin: pin,
      caption: $('caption-input').value,
      district: $('district-select').value
    };
    if (pendingImage) body.imageBase64 = pendingImage;
    var req = editIndex === null
      ? api('POST', '/api/admin/geo-packs/' + currentId + '/locations', body)
      : api('PATCH', '/api/admin/geo-packs/' + currentId + '/locations/' + editIndex, body);
    $('save-loc-btn').disabled = true;
    req.then(function(data){
      replacePack(data.pack);
      showOk(editIndex === null ? 'Lokacija dodata.' : 'Lokacija izmenjena.');
    }).catch(function(e){ showErr(e.message); })
      .then(function(){ $('save-loc-btn').disabled = false; });
  }

  // ---------- image pick + downscale ----------
  function handleFile(file){
    if (!file || file.type.indexOf('image/') !== 0){ showErr('Izaberi sliku.'); return; }
    downscale(file, 1920, 0.85).then(function(base64){
      if (!base64){ showErr('Ne mogu da pročitam sliku.'); return; }
      pendingImage = base64;
      $('img-preview').src = base64;
      $('img-preview').style.display = 'block';
      $('drop-label').style.display = 'none';
      $('drop-zone').className = 'has-img';
    });
  }

  function downscale(file, maxDim, quality){
    return new Promise(function(resolve){
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){
        try {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e){ URL.revokeObjectURL(url); resolve(null); }
      };
      img.onerror = function(){ URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  // ---------- map ----------
  function applyView(){
    $('map-content').style.transform =
      'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
  }
  function clampPan(){
    var wrap = $('map-wrap');
    var minX = wrap.clientWidth * (1 - zoom);
    var minY = wrap.clientHeight * (1 - zoom);
    panX = Math.min(0, Math.max(minX, panX));
    panY = Math.min(0, Math.max(minY, panY));
  }
  function setZoom(next, anchorX, anchorY){
    var wrap = $('map-wrap');
    var rect = wrap.getBoundingClientRect();
    var ax = anchorX === undefined ? rect.width / 2 : anchorX;
    var ay = anchorY === undefined ? rect.height / 2 : anchorY;
    var clamped = Math.max(1, Math.min(8, next));
    // keep the content point under the anchor fixed
    var cx = (ax - panX) / zoom;
    var cy = (ay - panY) / zoom;
    zoom = clamped;
    panX = ax - cx * zoom;
    panY = ay - cy * zoom;
    clampPan();
    applyView();
  }

  function updatePinUi(){
    var el = $('map-pin');
    if (pin){
      el.style.display = 'block';
      el.style.left = (pin.x * 100) + '%';
      el.style.top = (pin.y * 100) + '%';
      $('pin-readout').textContent = 'Pin: postavljen ✓';
    } else {
      el.style.display = 'none';
      $('pin-readout').textContent = 'Pin nije postavljen';
    }
  }

  function renderMapDots(){
    var p = currentPack();
    var box = $('map-dots');
    box.innerHTML = '';
    if (!p) return;
    p.locations.forEach(function(loc, i){
      if (editIndex === i) return; // the active pin already marks it
      var d = document.createElement('div');
      d.className = 'map-dot';
      d.style.left = (loc.pin.x * 100) + '%';
      d.style.top = (loc.pin.y * 100) + '%';
      box.appendChild(d);
    });
  }

  function initMap(){
    var wrap = $('map-wrap');
    var dragging = false, moved = false, startX = 0, startY = 0, startPanX = 0, startPanY = 0;

    wrap.addEventListener('pointerdown', function(e){
      wrap.setPointerCapture(e.pointerId);
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      startPanX = panX; startPanY = panY;
    });
    wrap.addEventListener('pointermove', function(e){
      if (!dragging) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (zoom > 1 && moved){
        panX = startPanX + dx; panY = startPanY + dy;
        clampPan(); applyView();
      }
    });
    wrap.addEventListener('pointerup', function(e){
      if (dragging && !moved){
        var rect = $('map-content').getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width;
        var y = (e.clientY - rect.top) / rect.height;
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1){
          pin = { x: x, y: y };
          updatePinUi();
        }
      }
      dragging = false;
    });
    wrap.addEventListener('pointercancel', function(){ dragging = false; });
    wrap.addEventListener('wheel', function(e){
      e.preventDefault();
      var rect = wrap.getBoundingClientRect();
      setZoom(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    $('zoom-in').onclick = function(){ setZoom(zoom * 1.5); };
    $('zoom-out').onclick = function(){ setZoom(zoom / 1.5); };
    $('zoom-reset').onclick = function(){ zoom = 1; panX = 0; panY = 0; applyView(); };
  }

  // ---------- wiring ----------
  function init(){
    var sel = $('district-select');
    DISTRICTS.forEach(function(d){
      var opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      sel.appendChild(opt);
    });

    $('token-btn').onclick = function(){
      token = $('token-input').value.trim();
      if (!token) return;
      api('GET', '/api/admin/geo-packs').then(function(data){
        localStorage.setItem(TOKEN_KEY, token);
        packs = data.packs || [];
        renderList();
        show('list');
      }).catch(function(e){ showErr(e.message); });
    };
    $('token-input').addEventListener('keydown', function(e){
      if (e.key === 'Enter') $('token-btn').click();
    });

    $('create-btn').onclick = function(){
      var name = $('new-name').value.trim();
      if (!name){ showErr('Unesi naziv packa.'); return; }
      api('POST', '/api/admin/geo-packs', {
        name: name, description: $('new-desc').value.trim()
      }).then(function(data){
        packs.push(data.pack);
        packs.sort(function(a, b){ return a.id < b.id ? -1 : 1; });
        $('new-name').value = ''; $('new-desc').value = '';
        renderList();
        openPack(data.pack.id);
        showOk('Pack napravljen.');
      }).catch(function(e){ showErr(e.message); });
    };

    $('back-btn').onclick = function(e){
      e.preventDefault();
      currentId = null;
      show('list');
    };

    $('save-meta-btn').onclick = function(){
      api('PATCH', '/api/admin/geo-packs/' + currentId, {
        name: $('pack-name').value, description: $('pack-desc').value
      }).then(function(data){ replacePack(data.pack); showOk('Sačuvano.'); })
        .catch(function(e){ showErr(e.message); });
    };

    $('delete-pack-btn').onclick = function(){
      var p = currentPack();
      if (!p) return;
      if (!confirm('Obrisati ceo pack "' + p.name + '" i sve njegove slike?')) return;
      api('DELETE', '/api/admin/geo-packs/' + currentId).then(function(){
        packs = packs.filter(function(x){ return x.id !== currentId; });
        currentId = null;
        renderList();
        show('list');
        showOk('Pack obrisan.');
      }).catch(function(e){ showErr(e.message); });
    };

    $('drop-zone').onclick = function(){ $('file-input').click(); };
    $('file-input').onchange = function(){ handleFile(this.files && this.files[0]); this.value = ''; };
    $('drop-zone').addEventListener('dragover', function(e){ e.preventDefault(); });
    $('drop-zone').addEventListener('drop', function(e){
      e.preventDefault();
      handleFile(e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    $('save-loc-btn').onclick = saveLocation;
    $('cancel-edit-btn').onclick = resetLocForm;

    initMap();

    if (token){
      api('GET', '/api/admin/geo-packs').then(function(data){
        packs = data.packs || [];
        renderList();
        show('list');
      }).catch(function(){ show('token'); });
    } else {
      show('token');
    }
  }

  init();
})();
</script>
</body>
</html>`;
