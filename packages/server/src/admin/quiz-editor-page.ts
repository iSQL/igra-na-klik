import { renderAdminPage } from './admin-shell.js';

/**
 * Admin editor for kviz packs, served at GET /admin/kviz. The single content
 * editor for all five question types (obicno / audio / video / geo / broj):
 *  - manifest format { name, description?, maps?, questions } via whole-file
 *    PUT to /api/admin/quiz-packs/:id;
 *  - binary assets (images, audio, custom map images) go through
 *    POST /api/admin/quiz-packs/:id/file and land in the pack's folder;
 *  - geo pin ↔ lat/lng conversion via POST /api/admin/pin-convert (the page
 *    does no geo math — same policy as the old geo editor).
 * NOTE: the script below lives inside a TS template literal — no backticks
 * or dollar-brace sequences allowed; string concatenation only.
 */
export function renderQuizEditorPage(): string {
  return renderAdminPage({
    title: 'Kviz editor',
    subtitle:
      'Packovi pitanja za „Kviz" — obična, audio, video, geo (mapa) i „pogodi broj" pitanja u istom packu.',
    active: 'kviz',
    extraCss: `
.opt-row{display:flex;gap:0.5rem;align-items:center;margin-bottom:0.45rem}
.opt-row input[type=radio]{width:20px;height:20px;accent-color:#3E7D57;flex:none}
.q-opts{color:var(--muted);font-size:0.8rem;margin-top:0.25rem}
.q-opts .correct{color:var(--green);font-weight:800}
.img-zone{border:1px dashed var(--border,#cbb);border-radius:10px;padding:0.7rem;margin-top:0.3rem}
.img-zone img{display:block;max-width:100%;max-height:190px;border-radius:8px;margin-bottom:0.5rem}
.q-thumb{max-width:120px;max-height:90px;border-radius:8px;margin-top:0.4rem;display:block}
.type-tabs{display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.3rem}
.type-tabs button{padding:0.4rem 0.8rem;border-radius:9px;font-size:0.85rem;font-weight:700;background:var(--surface2);color:var(--muted);border:1.5px solid transparent}
.type-tabs button.on{background:var(--grad);color:#F5EBE0}
.num-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.5rem}
#map-wrap{position:relative;width:100%;max-width:460px;overflow:hidden;border-radius:12px;border:1px solid var(--line2);background:#0B1728;touch-action:none;cursor:crosshair;aspect-ratio:1901/2386}
#map-content{position:absolute;inset:0;transform-origin:0 0}
#map-content img{position:absolute;inset:0;width:100%;height:100%;user-select:none}
#map-pin{position:absolute;transform:translate(-50%,-100%);pointer-events:none;display:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6));font-size:26px;line-height:1}
.map-btns{position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:4px}
.map-btns button{width:36px;height:36px;min-height:36px;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;font-size:1.1rem;font-weight:800}
.map-row{background:var(--surface2);border-radius:10px;padding:0.5rem 0.7rem;display:flex;align-items:center;gap:0.6rem;margin-bottom:0.4rem;font-size:0.85rem}
.map-row img{width:52px;height:40px;object-fit:cover;border-radius:6px}
`,
    body: `
    <!-- PACK LIST -->
    <div id="view-list">
      <h2>Packovi</h2>
      <div id="pack-list"></div>
      <div class="card" style="max-width:520px;margin-top:1rem">
        <strong style="font-size:0.95rem">Novi pack</strong>
        <label for="new-name">Naziv (postaje ime fajla)</label>
        <input type="text" id="new-name" placeholder="npr. Muzika devedesetih">
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
      <h2 id="pack-title"></h2>
      <div id="pack-status" class="hint" style="margin-bottom:0.8rem"></div>

      <div class="card" style="max-width:640px;margin-bottom:1rem">
        <strong style="font-size:0.95rem">Podaci o packu</strong>
        <label for="pack-name">Naziv</label>
        <input type="text" id="pack-name" maxlength="80">
        <label for="pack-desc">Opis (opciono)</label>
        <input type="text" id="pack-desc" maxlength="200">
        <div class="row" style="margin-top:0.8rem">
          <button class="btn btn-ghost btn-sm" id="save-meta-btn">Sačuvaj podatke</button>
        </div>
      </div>

      <div class="card" style="max-width:640px;margin-bottom:1rem">
        <strong style="font-size:0.95rem">Mape packa (za geo pitanja)</strong>
        <p class="hint" style="margin-top:0.3rem">Custom mapa = north-up Web Mercator izvoz (npr. render.openstreetmap.org export) + bbox brojevi sa ivica slike. Bez custom mape geo pitanja igraju na mapi Srbije.</p>
        <div id="maps-list" style="margin-top:0.6rem"></div>
        <button class="btn btn-ghost btn-sm" id="toggle-map-form-btn" style="margin-top:0.4rem">＋ Dodaj mapu</button>
        <div id="map-form" style="display:none;margin-top:0.6rem">
          <label for="map-id-input">Id mape (mala slova, cifre, crtice)</label>
          <input type="text" id="map-id-input" maxlength="40" placeholder="npr. zabari">
          <label>Slika mape</label>
          <input type="file" id="map-file-input" accept="image/*" style="display:none">
          <div class="row">
            <button type="button" class="btn btn-ghost btn-sm" id="map-file-btn">Izaberi sliku</button>
            <span class="hint" id="map-file-label">Nije izabrana</span>
          </div>
          <label>BBox (ivice slike, u stepenima)</label>
          <div class="num-grid">
            <input type="number" id="bbox-minlat" step="any" placeholder="minLat">
            <input type="number" id="bbox-maxlat" step="any" placeholder="maxLat">
            <input type="number" id="bbox-minlng" step="any" placeholder="minLng">
            <input type="number" id="bbox-maxlng" step="any" placeholder="maxLng">
          </div>
          <div class="row" style="margin-top:0.7rem">
            <button class="btn btn-primary btn-sm" id="save-map-btn">Sačuvaj mapu</button>
          </div>
        </div>
      </div>

      <div id="editor-home"></div>
      <div class="card" id="q-editor-card" style="max-width:640px">
        <strong id="editor-title" style="font-size:0.95rem">Novo pitanje</strong>
        <label>Tip pitanja</label>
        <div class="type-tabs" id="type-tabs">
          <button type="button" data-type="obicno" class="on">❓ Obično</button>
          <button type="button" data-type="audio">🎵 Audio</button>
          <button type="button" data-type="video">🎬 Video</button>
          <button type="button" data-type="geo">🗺️ Geo</button>
          <button type="button" data-type="broj">🔢 Broj</button>
        </div>

        <div id="grp-text">
          <label for="q-text" id="q-text-label">Tekst pitanja</label>
          <textarea id="q-text" rows="2" placeholder="npr. Koja planeta je najbliža Suncu?"></textarea>
        </div>

        <div id="grp-choice">
          <label>Odgovori (2–4; označi tačan)</label>
          <div class="opt-row"><input type="radio" name="correct" value="0" checked><input type="text" id="q-opt0" placeholder="Odgovor 1"></div>
          <div class="opt-row"><input type="radio" name="correct" value="1"><input type="text" id="q-opt1" placeholder="Odgovor 2"></div>
          <div class="opt-row"><input type="radio" name="correct" value="2"><input type="text" id="q-opt2" placeholder="Odgovor 3 (opciono)"></div>
          <div class="opt-row"><input type="radio" name="correct" value="3"><input type="text" id="q-opt3" placeholder="Odgovor 4 (opciono)"></div>
        </div>

        <div id="grp-audio">
          <label>Audio fajl (mp3/ogg/m4a, max ~10 MB)</label>
          <input type="file" id="q-audio-file" accept="audio/*" style="display:none">
          <div class="row">
            <button type="button" class="btn btn-ghost btn-sm" id="q-audio-pick">Dodaj audio</button>
            <button type="button" class="btn btn-danger btn-sm" id="q-audio-remove" style="display:none">Ukloni</button>
          </div>
          <audio id="q-audio-preview" controls style="display:none;width:100%;margin-top:0.5rem"></audio>
        </div>

        <div id="grp-video">
          <label for="q-video-id">YouTube video ID (11 znakova, iz linka youtube.com/watch?v=...)</label>
          <input type="text" id="q-video-id" maxlength="11" placeholder="npr. dQw4w9WgXcQ">
          <img id="q-video-thumb" class="q-thumb" style="display:none" alt="">
          <div class="num-grid" style="margin-top:0.5rem">
            <div><label for="q-video-start" style="margin:0 0 0.35rem">Start (s, opciono)</label>
            <input type="number" id="q-video-start" min="0" step="1" placeholder="0"></div>
            <div><label for="q-video-end" style="margin:0 0 0.35rem">Kraj (s, opciono)</label>
            <input type="number" id="q-video-end" min="1" step="1" placeholder=""></div>
          </div>
        </div>

        <div id="grp-broj">
          <label>Brojevi</label>
          <div class="num-grid">
            <div><span class="hint">Tačan odgovor</span><input type="number" id="q-broj-answer" step="any"></div>
            <div><span class="hint">Min (klizač)</span><input type="number" id="q-broj-min" step="any"></div>
            <div><span class="hint">Max (klizač)</span><input type="number" id="q-broj-max" step="any"></div>
            <div><span class="hint">Korak (opciono)</span><input type="number" id="q-broj-step" step="any" placeholder="1"></div>
          </div>
          <div class="num-grid" style="margin-top:0.5rem">
            <div><span class="hint">Jedinica (din, kg, km…)</span><input type="text" id="q-broj-unit" maxlength="20"></div>
            <div><span class="hint">Tip prikaza</span><select id="q-broj-valuetype"><option value="">Broj</option><option value="duration">Trajanje (mm:ss)</option></select></div>
            <div><span class="hint">Emoji (opciono)</span><input type="text" id="q-broj-emoji" maxlength="8"></div>
          </div>
        </div>

        <div id="grp-geo">
          <label for="q-caption">Caption / naziv lokacije (prikazuje se u rezultatima)</label>
          <input type="text" id="q-caption" maxlength="200" placeholder="npr. Đavolja varoš">
          <label for="geo-map-select">Mapa</label>
          <select id="geo-map-select"><option value="">— Srbija (podrazumevano) —</option></select>
          <div style="margin-top:0.5rem">
            <div id="map-wrap">
              <div id="map-content">
                <img id="base-map-img" src="/admin/serbia-map.png" alt="Mapa" draggable="false">
                <div id="map-pin">📍</div>
              </div>
              <div class="map-btns">
                <button type="button" id="zoom-in">＋</button>
                <button type="button" id="zoom-out">−</button>
                <button type="button" id="zoom-reset">↻</button>
              </div>
            </div>
            <p class="hint">Klik postavlja pin · točkić zumira · prevlačenje pomera uvećanu mapu. <span id="pin-readout">Pin nije postavljen.</span></p>
          </div>
        </div>

        <div id="grp-image">
          <label id="q-img-label">Slika (opciono)</label>
          <div class="img-zone" id="img-zone">
            <img id="q-img-preview" style="display:none" alt="">
            <div id="q-img-empty" class="hint" style="margin:0">Nema slike.</div>
            <input type="file" id="q-img-file" accept="image/*" style="display:none">
            <div class="row" style="margin-top:0.5rem">
              <button type="button" class="btn btn-ghost btn-sm" id="q-img-pick">Dodaj sliku</button>
              <button type="button" class="btn btn-danger btn-sm" id="q-img-remove" style="display:none">Ukloni sliku</button>
            </div>
          </div>
        </div>

        <label for="q-time" style="margin-top:0.8rem">Vreme u sekundama (opciono, 5–60)</label>
        <input type="number" id="q-time" min="5" max="60" step="1" placeholder="15" style="max-width:140px">
        <div class="row" style="margin-top:1rem">
          <button class="btn btn-primary" id="save-q-btn">Sačuvaj pitanje</button>
          <button class="btn btn-ghost" id="cancel-edit-btn" style="display:none">Otkaži izmenu</button>
        </div>
      </div>

      <h2>Pitanja (<span id="q-count">0</span>)</h2>
      <div id="q-list"></div>
    </div>
`,
    script: `
(function(){
  'use strict';
  var $ = Admin.$, esc = Admin.esc, api = Admin.api;
  var showErr = Admin.showErr, showOk = Admin.showOk;
  var API = '/api/admin/quiz-packs';
  var TYPE_LABELS = { obicno: '❓', audio: '🎵', video: '🎬', geo: '🗺️', broj: '🔢' };
  var TIME_DEFAULTS = { obicno: 15, audio: 15, video: 15, geo: 30, broj: 25 };
  var packs = [];
  var currentId = null;
  var editIndex = null;
  var qType = 'obicno';
  // Per-question pending asset state (filenames live in the pack folder;
  // legacy questions may carry absolute imageUrl/audioUrl instead).
  var pendingImageFile = null, pendingImageUrl = null;
  var pendingAudioFile = null, pendingAudioUrl = null;
  // geo state: normalized pin + server-converted lat/lng.
  var pin = null, geoLat = null, geoLng = null, geoMapId = '';
  var pendingMapImage = null;
  // map view state
  var zoom = 1, panX = 0, panY = 0;

  function show(view){
    $('view-list').style.display = view === 'list' ? 'block' : 'none';
    $('view-pack').style.display = view === 'pack' ? 'block' : 'none';
  }
  function currentPack(){
    for (var i = 0; i < packs.length; i++) if (packs[i].id === currentId) return packs[i];
    return null;
  }
  function fileUrl(name){ return '/kviz-files/' + currentId + '/' + name; }
  function imgSrcOf(q){
    if (q.imageUrl) return q.imageUrl;
    if (q.imageFile) return fileUrl(q.imageFile);
    return null;
  }
  function packMaps(){
    var p = currentPack();
    return (p && p.maps && typeof p.maps === 'object') ? p.maps : {};
  }

  function parkEditorHome(){
    var card = $('q-editor-card');
    var home = $('editor-home');
    if (card && home) home.insertAdjacentElement('afterend', card);
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
      var typeBits = '';
      if (p.types){
        for (var k in TYPE_LABELS){
          if (p.types[k]) typeBits += ' ' + TYPE_LABELS[k] + p.types[k];
        }
      }
      var html = '<div style="flex:1;min-width:0">'
        + '<div class="name">' + esc(p.name || p.id) + '</div>'
        + '<div class="meta">' + p.count + ' pitanja ·' + esc(typeBits || ' —') + '</div></div>';
      if (!p.visibleInGame) html += '<span class="badge">nevidljiv u igri</span>';
      row.innerHTML = html;
      var open = document.createElement('button');
      open.className = 'btn btn-ghost btn-sm';
      open.textContent = 'Otvori';
      open.onclick = function(){ openPack(p.id); };
      row.appendChild(open);
      box.appendChild(row);
    });
  }

  function openPack(id){
    currentId = id;
    resetForm();
    renderPack();
    show('pack');
    window.scrollTo(0, 0);
  }

  function questionSummary(q){
    var t = q.type || 'obicno';
    if (t === 'geo'){
      var mapBit = q.mapId ? ' · mapa: ' + esc(q.mapId) : ' · Srbija';
      return '<div class="q-opts">📍 ' + esc(q.caption || '(bez captiona)')
        + ' · lat ' + Number(q.lat).toFixed(4) + ', lng ' + Number(q.lng).toFixed(4) + mapBit + '</div>';
    }
    if (t === 'broj'){
      return '<div class="q-opts">✔ ' + esc(String(q.answer))
        + (q.unit ? ' ' + esc(q.unit) : '')
        + ' · opseg ' + esc(String(q.min)) + '–' + esc(String(q.max))
        + (q.valueType === 'duration' ? ' · mm:ss' : '') + '</div>';
    }
    var opts = '';
    var qOpts = Array.isArray(q.options) ? q.options : [];
    for (var j = 0; j < qOpts.length; j++){
      if (j > 0) opts += ' · ';
      if (j === q.correctIndex) opts += '<span class="correct">✓ ' + esc(qOpts[j]) + '</span>';
      else opts += esc(qOpts[j]);
    }
    var extra = '';
    if (t === 'video') extra = ' · ▶ ' + esc(q.videoId || '');
    if (t === 'audio') extra = ' · 🎵 ' + esc(q.audioFile || q.audioUrl || '');
    return '<div class="q-opts">' + opts + extra + '</div>';
  }

  function renderPack(){
    var p = currentPack();
    if (!p) return;
    parkEditorHome();
    $('pack-title').textContent = 'Pack: ' + (p.name || p.id);
    $('pack-name').value = p.name || '';
    $('pack-desc').value = p.description || '';
    $('pack-status').textContent = p.visibleInGame
      ? '✓ Pack je ispravan i vidljiv u igri.'
      : (p.count === 0
          ? 'Pack je prazan — dodaj bar jedno pitanje da bi se pojavio u igri.'
          : '⚠ Pack nije ispravan i ne vidi se u igri: ' + (p.error || 'nepoznata greška'));
    $('q-count').textContent = String(p.count);
    renderMaps();
    var list = $('q-list');
    list.innerHTML = '';
    (p.questions || []).forEach(function(q, i){
      var row = document.createElement('div');
      row.className = 'item-row';
      var t = q.type || 'obicno';
      var src = imgSrcOf(q);
      var thumb = src ? '<img class="q-thumb" src="' + esc(src) + '" alt="">' : '';
      row.innerHTML = '<div class="txt"><span class="tag">' + TYPE_LABELS[t] + ' ' + t + '</span>'
        + (i + 1) + '. ' + esc(q.text || (t === 'geo' ? '(Gde je ovo slikano?)' : '(bez teksta)')) + '</div>'
        + thumb
        + questionSummary(q)
        + (q.timeLimit ? '<div class="q-opts">⏱ ' + esc(q.timeLimit) + 's</div>' : '');
      var btns = document.createElement('div');
      btns.className = 'row';
      btns.style.marginTop = '0.5rem';
      var edit = document.createElement('button');
      edit.className = 'btn btn-ghost btn-sm';
      edit.textContent = 'Izmeni';
      edit.onclick = function(){ startEdit(i); };
      var del = document.createElement('button');
      del.className = 'btn btn-danger btn-sm';
      del.textContent = 'Obriši';
      del.onclick = function(){
        if (!confirm('Obrisati ovo pitanje?')) return;
        var next = p.questions.slice();
        next.splice(i, 1);
        put({ questions: next }, 'Pitanje obrisano.');
      };
      btns.appendChild(edit); btns.appendChild(del);
      row.appendChild(btns);
      list.appendChild(row);
    });
  }

  // ---------- maps card ----------
  function renderMaps(){
    var maps = packMaps();
    var box = $('maps-list');
    box.innerHTML = '';
    var sel = $('geo-map-select');
    var keep = geoMapId;
    sel.innerHTML = '<option value="">— Srbija (podrazumevano) —</option>';
    var ids = Object.keys(maps);
    if (ids.length === 0){
      box.innerHTML = '<p class="hint" style="margin:0">Nema custom mapa — geo pitanja igraju na mapi Srbije.</p>';
    }
    ids.forEach(function(id){
      var m = maps[id];
      var row = document.createElement('div');
      row.className = 'map-row';
      row.innerHTML = '<img src="' + esc(fileUrl(m.imageFile)) + '" alt="">'
        + '<div style="flex:1;min-width:0"><strong>' + esc(id) + '</strong>'
        + '<div class="hint" style="margin:0">bbox ' + m.bbox.minLat + '…' + m.bbox.maxLat + ' / ' + m.bbox.minLng + '…' + m.bbox.maxLng + '</div></div>';
      var del = document.createElement('button');
      del.className = 'btn btn-danger btn-sm';
      del.textContent = 'Obriši';
      del.onclick = function(){ deleteMap(id); };
      row.appendChild(del);
      box.appendChild(row);
      var opt = document.createElement('option');
      opt.value = id; opt.textContent = id;
      sel.appendChild(opt);
    });
    sel.value = maps[keep] ? keep : '';
    geoMapId = sel.value;
    syncMapImage();
  }

  function deleteMap(id){
    var p = currentPack();
    if (!p) return;
    var used = (p.questions || []).some(function(q){ return (q.type === 'geo') && q.mapId === id; });
    if (used){ showErr('Mapa "' + id + '" se koristi u geo pitanjima — prvo ih prebaci ili obriši.'); return; }
    if (!confirm('Obrisati mapu "' + id + '"?')) return;
    var maps = {};
    var all = packMaps();
    for (var k in all) if (k !== id) maps[k] = all[k];
    put({ maps: maps }, 'Mapa obrisana.');
  }

  // ---------- editor form ----------
  function setType(t){
    qType = t;
    var tabs = $('type-tabs').querySelectorAll('button');
    for (var i = 0; i < tabs.length; i++){
      tabs[i].className = tabs[i].getAttribute('data-type') === t ? 'on' : '';
    }
    var isChoice = (t === 'obicno' || t === 'audio' || t === 'video');
    $('grp-choice').style.display = isChoice ? 'block' : 'none';
    $('grp-audio').style.display = t === 'audio' ? 'block' : 'none';
    $('grp-video').style.display = t === 'video' ? 'block' : 'none';
    $('grp-broj').style.display = t === 'broj' ? 'block' : 'none';
    $('grp-geo').style.display = t === 'geo' ? 'block' : 'none';
    $('grp-image').style.display = t === 'video' ? 'none' : 'block';
    $('q-img-label').textContent = t === 'geo' ? 'Slika (obavezno — to je pitanje)' : 'Slika (opciono)';
    $('q-text-label').textContent = t === 'geo'
      ? 'Tekst pitanja (opciono; podrazumevano „Gde je ovo slikano?")'
      : 'Tekst pitanja';
    $('q-time').placeholder = String(TIME_DEFAULTS[t] || 15);
    if (t === 'geo') syncMapImage();
  }

  function resetForm(){
    editIndex = null;
    $('editor-title').textContent = 'Novo pitanje';
    $('q-text').value = '';
    for (var i = 0; i < 4; i++) $('q-opt' + i).value = '';
    document.querySelector('input[name=correct][value="0"]').checked = true;
    $('q-time').value = '';
    $('q-video-id').value = '';
    $('q-video-start').value = '';
    $('q-video-end').value = '';
    $('q-video-thumb').style.display = 'none';
    $('q-broj-answer').value = '';
    $('q-broj-min').value = '';
    $('q-broj-max').value = '';
    $('q-broj-step').value = '';
    $('q-broj-unit').value = '';
    $('q-broj-valuetype').value = '';
    $('q-broj-emoji').value = '';
    $('q-caption').value = '';
    pin = null; geoLat = null; geoLng = null; geoMapId = '';
    var sel = $('geo-map-select');
    if (sel) sel.value = '';
    updatePinUi();
    setImage(null, null);
    setAudio(null, null);
    $('cancel-edit-btn').style.display = 'none';
    $('save-q-btn').textContent = 'Sačuvaj pitanje';
    setType('obicno');
    parkEditorHome();
  }

  function setImage(file, url){
    pendingImageFile = file || null;
    pendingImageUrl = url || null;
    var src = pendingImageUrl || (pendingImageFile ? fileUrl(pendingImageFile) : null);
    var prev = $('q-img-preview');
    if (src){
      prev.src = src;
      prev.style.display = 'block';
      $('q-img-empty').style.display = 'none';
      $('q-img-remove').style.display = '';
      $('q-img-pick').textContent = 'Promeni sliku';
    } else {
      prev.removeAttribute('src');
      prev.style.display = 'none';
      $('q-img-empty').style.display = '';
      $('q-img-remove').style.display = 'none';
      $('q-img-pick').textContent = 'Dodaj sliku';
    }
  }

  function setAudio(file, url){
    pendingAudioFile = file || null;
    pendingAudioUrl = url || null;
    var src = pendingAudioUrl || (pendingAudioFile ? fileUrl(pendingAudioFile) : null);
    var prev = $('q-audio-preview');
    if (src){
      prev.src = src;
      prev.style.display = 'block';
      $('q-audio-remove').style.display = '';
      $('q-audio-pick').textContent = 'Promeni audio';
    } else {
      prev.removeAttribute('src');
      prev.style.display = 'none';
      $('q-audio-remove').style.display = 'none';
      $('q-audio-pick').textContent = 'Dodaj audio';
    }
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
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e){ URL.revokeObjectURL(url); resolve(null); }
      };
      img.onerror = function(){ URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function uploadFile(kind, dataBase64){
    return api('POST', API + '/' + currentId + '/file', { kind: kind, dataBase64: dataBase64 });
  }

  function handleImgFile(file){
    if (!file || file.type.indexOf('image/') !== 0){ showErr('Izaberi sliku.'); return; }
    $('q-img-pick').disabled = true;
    downscale(file, 1280, 0.75).then(function(base64){
      if (!base64){ showErr('Ne mogu da pročitam sliku.'); $('q-img-pick').disabled = false; return; }
      return uploadFile('image', base64)
        .then(function(data){ setImage(data.file, null); showOk('Slika dodata.'); })
        .catch(function(e){ showErr(e.message); });
    }).then(function(){ $('q-img-pick').disabled = false; });
  }

  function handleAudioFile(file){
    if (!file || file.type.indexOf('audio/') !== 0){ showErr('Izaberi audio fajl.'); return; }
    var reader = new FileReader();
    reader.onerror = function(){ showErr('Ne mogu da pročitam fajl.'); };
    reader.onload = function(){
      var base64 = String(reader.result || '');
      if (base64.length > 14000000){ showErr('Audio je prevelik (max ~10 MB).'); return; }
      $('q-audio-pick').disabled = true;
      uploadFile('audio', base64)
        .then(function(data){ setAudio(data.file, null); showOk('Audio dodat.'); })
        .catch(function(e){ showErr(e.message); })
        .then(function(){ $('q-audio-pick').disabled = false; });
    };
    reader.readAsDataURL(file);
  }

  // ---------- geo map picker ----------
  function currentBBox(){
    var maps = packMaps();
    return geoMapId && maps[geoMapId] ? maps[geoMapId].bbox : null;
  }

  function syncMapImage(){
    var maps = packMaps();
    var img = $('base-map-img');
    var src = geoMapId && maps[geoMapId] ? fileUrl(maps[geoMapId].imageFile) : '/admin/serbia-map.png';
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  }

  function updatePinUi(){
    var el = $('map-pin');
    if (pin){
      el.style.display = 'block';
      el.style.left = (pin.x * 100) + '%';
      el.style.top = (pin.y * 100) + '%';
      $('pin-readout').textContent = (geoLat != null)
        ? 'Pin: ' + geoLat.toFixed(5) + ', ' + geoLng.toFixed(5)
        : 'Pin: postavljen';
    } else {
      el.style.display = 'none';
      $('pin-readout').textContent = 'Pin nije postavljen.';
    }
  }

  function convertPin(){
    if (!pin) return;
    var body = { pin: pin };
    var bbox = currentBBox();
    if (bbox) body.bbox = bbox;
    api('POST', '/api/admin/pin-convert', body).then(function(data){
      if (data.latLng){
        geoLat = data.latLng.lat;
        geoLng = data.latLng.lng;
        updatePinUi();
      }
    }).catch(function(e){ showErr(e.message); });
  }

  function pinFromLatLng(lat, lng){
    var body = { lat: lat, lng: lng };
    var bbox = currentBBox();
    if (bbox) body.bbox = bbox;
    api('POST', '/api/admin/pin-convert', body).then(function(data){
      if (data.pin){
        pin = data.pin;
        geoLat = lat; geoLng = lng;
        updatePinUi();
      }
    }).catch(function(e){ showErr(e.message); });
  }

  function applyView(){
    $('map-content').style.transform =
      'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
  }
  function clampPanView(){
    var wrap = $('map-wrap');
    var w = wrap.clientWidth, h = wrap.clientHeight;
    var minX = w * (1 - zoom), minY = h * (1 - zoom);
    panX = Math.min(0, Math.max(minX, panX));
    panY = Math.min(0, Math.max(minY, panY));
  }
  function setZoom(next, ax, ay){
    var clamped = Math.max(1, Math.min(6, next));
    var wrap = $('map-wrap');
    if (ax === undefined){ ax = wrap.clientWidth / 2; ay = wrap.clientHeight / 2; }
    var cx = (ax - panX) / zoom;
    var cy = (ay - panY) / zoom;
    zoom = clamped;
    panX = ax - cx * zoom;
    panY = ay - cy * zoom;
    clampPanView();
    applyView();
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
        clampPanView(); applyView();
      }
    });
    wrap.addEventListener('pointerup', function(e){
      if (dragging && !moved){
        var rect = $('map-content').getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width;
        var y = (e.clientY - rect.top) / rect.height;
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1){
          pin = { x: x, y: y };
          geoLat = null; geoLng = null;
          updatePinUi();
          convertPin();
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
    $('base-map-img').addEventListener('load', function(){
      var img = $('base-map-img');
      if (img.naturalWidth > 0 && img.naturalHeight > 0){
        $('map-wrap').style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
      }
    });
    $('geo-map-select').onchange = function(){
      geoMapId = this.value;
      // A pin from another map means nothing here — reset it.
      pin = null; geoLat = null; geoLng = null;
      zoom = 1; panX = 0; panY = 0; applyView();
      updatePinUi();
      syncMapImage();
    };
  }

  // ---------- edit / build / save ----------
  function startEdit(i){
    var p = currentPack();
    if (!p || !p.questions[i]) return;
    parkEditorHome();
    var q = p.questions[i];
    editIndex = i;
    var t = q.type || 'obicno';
    $('editor-title').textContent = 'Izmena pitanja #' + (i + 1);
    setType(t);
    $('q-text').value = q.text || '';
    $('q-time').value = q.timeLimit ? String(q.timeLimit) : '';
    setImage(q.imageFile || null, q.imageUrl || null);
    if (t === 'obicno' || t === 'audio' || t === 'video'){
      var qOpts = Array.isArray(q.options) ? q.options : [];
      for (var j = 0; j < 4; j++) $('q-opt' + j).value = qOpts[j] || '';
      var ci = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
      var radio = document.querySelector('input[name=correct][value="' + ci + '"]');
      if (radio) radio.checked = true;
    }
    if (t === 'audio') setAudio(q.audioFile || null, q.audioUrl || null);
    if (t === 'video'){
      $('q-video-id').value = q.videoId || '';
      $('q-video-start').value = q.startSeconds != null ? String(q.startSeconds) : '';
      $('q-video-end').value = q.endSeconds != null ? String(q.endSeconds) : '';
      updateVideoThumb();
    }
    if (t === 'broj'){
      $('q-broj-answer').value = String(q.answer);
      $('q-broj-min').value = String(q.min);
      $('q-broj-max').value = String(q.max);
      $('q-broj-step').value = q.step != null ? String(q.step) : '';
      $('q-broj-unit').value = q.unit || '';
      $('q-broj-valuetype').value = q.valueType || '';
      $('q-broj-emoji').value = q.emoji || '';
    }
    if (t === 'geo'){
      $('q-caption').value = q.caption || '';
      geoMapId = q.mapId || '';
      $('geo-map-select').value = geoMapId;
      syncMapImage();
      pin = null; geoLat = null; geoLng = null;
      updatePinUi();
      if (typeof q.lat === 'number' && typeof q.lng === 'number'){
        pinFromLatLng(q.lat, q.lng);
      }
    }
    $('cancel-edit-btn').style.display = '';
    $('save-q-btn').textContent = 'Sačuvaj izmene';
    var row = $('q-list').children[i];
    var card = $('q-editor-card');
    if (row && card){
      row.insertAdjacentElement('afterend', card);
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollTo(0, 0);
    }
  }

  function updateVideoThumb(){
    var id = $('q-video-id').value.trim();
    var img = $('q-video-thumb');
    if (/^[A-Za-z0-9_-]{11}$/.test(id)){
      img.src = 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg';
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }
  }

  function buildChoiceCore(q){
    var text = $('q-text').value.trim();
    if (!text){ showErr('Unesi tekst pitanja.'); return null; }
    var selected = document.querySelector('input[name=correct]:checked');
    var selectedSlot = selected ? parseInt(selected.value, 10) : 0;
    var options = [];
    var correctIndex = -1;
    for (var i = 0; i < 4; i++){
      var v = $('q-opt' + i).value.trim();
      if (!v) continue;
      if (i === selectedSlot) correctIndex = options.length;
      options.push(v);
    }
    if (options.length < 2){ showErr('Unesi bar 2 odgovora.'); return null; }
    if (correctIndex === -1){ showErr('Tačan odgovor mora biti popunjena opcija.'); return null; }
    q.text = text;
    q.options = options;
    q.correctIndex = correctIndex;
    return q;
  }

  function attachTime(q){
    var t = $('q-time').value.trim();
    if (t){
      var n = parseInt(t, 10);
      if (isNaN(n) || n < 5 || n > 60){ showErr('Vreme mora biti između 5 i 60 sekundi.'); return false; }
      q.timeLimit = n;
    }
    return true;
  }

  function attachImage(q){
    if (pendingImageFile) q.imageFile = pendingImageFile;
    else if (pendingImageUrl) q.imageUrl = pendingImageUrl;
  }

  function buildQuestion(){
    var q = { type: qType };

    if (qType === 'obicno'){
      if (!buildChoiceCore(q)) return null;
      attachImage(q);
    } else if (qType === 'audio'){
      if (!buildChoiceCore(q)) return null;
      if (!pendingAudioFile && !pendingAudioUrl){ showErr('Dodaj audio fajl.'); return null; }
      if (pendingAudioFile) q.audioFile = pendingAudioFile;
      else q.audioUrl = pendingAudioUrl;
      attachImage(q);
    } else if (qType === 'video'){
      if (!buildChoiceCore(q)) return null;
      var vid = $('q-video-id').value.trim();
      if (!/^[A-Za-z0-9_-]{11}$/.test(vid)){ showErr('YouTube ID mora imati tačno 11 znakova.'); return null; }
      q.videoId = vid;
      var vs = $('q-video-start').value.trim();
      var ve = $('q-video-end').value.trim();
      if (vs) q.startSeconds = parseInt(vs, 10);
      if (ve) q.endSeconds = parseInt(ve, 10);
      if (q.startSeconds != null && q.endSeconds != null && q.endSeconds <= q.startSeconds){
        showErr('Kraj mora biti posle starta.'); return null;
      }
    } else if (qType === 'broj'){
      var text = $('q-text').value.trim();
      if (!text){ showErr('Unesi tekst pitanja.'); return null; }
      q.text = text;
      var answer = parseFloat($('q-broj-answer').value);
      var mn = parseFloat($('q-broj-min').value);
      var mx = parseFloat($('q-broj-max').value);
      if (isNaN(answer) || isNaN(mn) || isNaN(mx)){ showErr('Popuni odgovor, min i max.'); return null; }
      if (mn >= mx){ showErr('Min mora biti manji od max.'); return null; }
      if (answer < mn || answer > mx){ showErr('Odgovor mora biti između min i max.'); return null; }
      q.answer = answer; q.min = mn; q.max = mx;
      var st = $('q-broj-step').value.trim();
      if (st){
        var stepN = parseFloat(st);
        if (isNaN(stepN) || stepN <= 0){ showErr('Korak mora biti pozitivan broj.'); return null; }
        q.step = stepN;
      }
      var unit = $('q-broj-unit').value.trim();
      if (unit) q.unit = unit;
      if ($('q-broj-valuetype').value) q.valueType = $('q-broj-valuetype').value;
      var emoji = $('q-broj-emoji').value.trim();
      if (emoji) q.emoji = emoji;
      attachImage(q);
    } else if (qType === 'geo'){
      var gtext = $('q-text').value.trim();
      if (gtext) q.text = gtext;
      if (!pendingImageFile && !pendingImageUrl){ showErr('Geo pitanje mora imati sliku.'); return null; }
      attachImage(q);
      var caption = $('q-caption').value.trim();
      if (caption) q.caption = caption;
      if (geoLat == null || geoLng == null){ showErr('Postavi pin na mapu.'); return null; }
      q.lat = geoLat; q.lng = geoLng;
      if (geoMapId) q.mapId = geoMapId;
    }

    if (!attachTime(q)) return null;
    return q;
  }

  function put(partial, okMsg){
    var p = currentPack();
    if (!p) return;
    var body = {
      name: partial.name !== undefined ? partial.name : (p.name || p.id),
      description: partial.description !== undefined ? partial.description : (p.description || ''),
      maps: partial.maps !== undefined ? partial.maps : packMaps(),
      questions: partial.questions !== undefined ? partial.questions : (p.questions || [])
    };
    api('PUT', API + '/' + currentId, body)
      .then(function(data){
        for (var i = 0; i < packs.length; i++){
          if (packs[i].id === data.item.id){ packs[i] = data.item; break; }
        }
        renderList();
        renderPack();
        resetForm();
        showOk(okMsg);
      })
      .catch(function(e){ showErr(e.message); });
  }

  function saveQuestion(){
    var p = currentPack();
    if (!p) return;
    var q = buildQuestion();
    if (!q) return;
    var next = (p.questions || []).slice();
    if (editIndex === null) next.push(q);
    else next[editIndex] = q;
    put({ questions: next }, editIndex === null ? 'Pitanje dodato.' : 'Pitanje izmenjeno.');
  }

  // ---------- wiring ----------
  $('create-btn').onclick = function(){
    var name = $('new-name').value.trim();
    if (!name){ showErr('Unesi naziv packa.'); return; }
    api('POST', API, { name: name }).then(function(data){
      packs.push(data.item);
      packs.sort(function(a, b){ return a.id < b.id ? -1 : 1; });
      $('new-name').value = '';
      renderList();
      openPack(data.item.id);
      showOk('Pack napravljen.');
    }).catch(function(e){ showErr(e.message); });
  };

  $('back-btn').onclick = function(e){
    e.preventDefault();
    currentId = null;
    show('list');
  };

  $('save-meta-btn').onclick = function(){
    put({ name: $('pack-name').value.trim(), description: $('pack-desc').value.trim() }, 'Sačuvano.');
  };

  $('delete-pack-btn').onclick = function(){
    var p = currentPack();
    if (!p) return;
    if (!confirm('Obrisati ceo pack "' + (p.name || p.id) + '" i sve njegove fajlove?')) return;
    api('DELETE', API + '/' + currentId).then(function(){
      packs = packs.filter(function(x){ return x.id !== currentId; });
      currentId = null;
      renderList();
      show('list');
      showOk('Pack obrisan.');
    }).catch(function(e){ showErr(e.message); });
  };

  $('save-q-btn').onclick = saveQuestion;
  $('cancel-edit-btn').onclick = resetForm;

  var tabButtons = $('type-tabs').querySelectorAll('button');
  for (var ti = 0; ti < tabButtons.length; ti++){
    tabButtons[ti].onclick = function(){ setType(this.getAttribute('data-type')); };
  }

  $('q-img-pick').onclick = function(){ $('q-img-file').click(); };
  $('q-img-file').onchange = function(e){
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) handleImgFile(f);
  };
  $('q-img-remove').onclick = function(){ setImage(null, null); };

  $('q-audio-pick').onclick = function(){ $('q-audio-file').click(); };
  $('q-audio-file').onchange = function(e){
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) handleAudioFile(f);
  };
  $('q-audio-remove').onclick = function(){ setAudio(null, null); };

  $('q-video-id').addEventListener('input', updateVideoThumb);

  // maps card
  $('toggle-map-form-btn').onclick = function(){
    var form = $('map-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  };
  $('map-file-btn').onclick = function(){ $('map-file-input').click(); };
  $('map-file-input').onchange = function(){
    var file = this.files && this.files[0];
    this.value = '';
    if (!file || file.type.indexOf('image/') !== 0){ showErr('Izaberi sliku.'); return; }
    downscale(file, 2200, 0.85).then(function(base64){
      if (!base64){ showErr('Ne mogu da pročitam sliku.'); return; }
      if (base64.length > 7500000){
        showErr('Slika mape je prevelika i posle kompresije.');
        return;
      }
      pendingMapImage = base64;
      var kb = Math.round(base64.length * 0.75 / 1024);
      $('map-file-label').textContent = '✓ ' + file.name + ' (~' + kb + ' KB)';
    });
  };
  $('save-map-btn').onclick = function(){
    if (!currentId) return;
    var mapId = $('map-id-input').value.trim();
    if (!/^[a-z0-9-]{1,40}$/.test(mapId)){ showErr('Id mape: mala slova, cifre i crtice.'); return; }
    var bbox = {
      minLat: parseFloat($('bbox-minlat').value),
      maxLat: parseFloat($('bbox-maxlat').value),
      minLng: parseFloat($('bbox-minlng').value),
      maxLng: parseFloat($('bbox-maxlng').value)
    };
    if (isNaN(bbox.minLat) || isNaN(bbox.maxLat) || isNaN(bbox.minLng) || isNaN(bbox.maxLng)){
      showErr('Popuni sva 4 bbox broja.');
      return;
    }
    var existing = packMaps()[mapId];
    if (!pendingMapImage && !existing){ showErr('Izaberi sliku mape.'); return; }
    $('save-map-btn').disabled = true;
    var imagePromise = pendingMapImage
      ? uploadFile('image', pendingMapImage).then(function(d){ return d.file; })
      : Promise.resolve(existing.imageFile);
    imagePromise.then(function(imageFile){
      var maps = {};
      var all = packMaps();
      for (var k in all) maps[k] = all[k];
      maps[mapId] = { imageFile: imageFile, bbox: bbox };
      pendingMapImage = null;
      $('map-file-label').textContent = 'Nije izabrana';
      $('map-id-input').value = '';
      put({ maps: maps }, 'Mapa sačuvana.');
    }).catch(function(e){ showErr(e.message); })
      .then(function(){ $('save-map-btn').disabled = false; });
  };

  initMap();
  setType('obicno');

  Admin.start(API, function(data){
    packs = data.packs || [];
    renderList();
    show(currentId ? 'pack' : 'list');
  });
})();
`,
  });
}
