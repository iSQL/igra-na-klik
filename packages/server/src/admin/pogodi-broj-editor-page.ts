import { renderAdminPage } from './admin-shell.js';

/**
 * Admin editor for "Pogodi broj" question packs, served at GET /admin/pogodi-broj.
 * Talks to /api/admin/pogodi-broj-packs (granular per-question POST/PATCH/DELETE;
 * images ride inline as base64 on the same request).
 * NOTE: the script below lives inside a TS template literal — no backticks or
 * dollar-brace sequences allowed; string concatenation only.
 */
export function renderPogodiBrojEditorPage(): string {
  return renderAdminPage({
    title: 'Pogodi broj editor',
    subtitle:
      'Packovi pitanja za „Pogodi broj" — svako pitanje ima tačan odgovor, raspon (min–max), opciono jedinicu, korak, tip vrednosti i sliku.',
    active: 'pogodi-broj',
    extraCss: `
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0.6rem}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.6rem}
.img-zone{border:1px dashed var(--line2);border-radius:10px;padding:0.7rem;margin-top:0.3rem}
.img-zone img{display:block;max-width:100%;max-height:190px;border-radius:8px;margin-bottom:0.5rem}
.q-thumb{max-width:120px;max-height:90px;border-radius:8px;margin-top:0.4rem;display:block}
.q-meta{color:var(--muted);font-size:0.8rem;margin-top:0.25rem}
.q-meta b{color:var(--ink)}
`,
    body: `
    <!-- PACK LIST -->
    <div id="view-list">
      <h2>Packovi</h2>
      <div id="pack-list"></div>
      <div class="card" style="max-width:520px;margin-top:1rem">
        <strong style="font-size:0.95rem">Novi pack</strong>
        <label for="new-name">Naziv (postaje ime fajla)</label>
        <input type="text" id="new-name" placeholder="npr. Cene i težine">
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

      <div id="editor-home"></div>
      <div class="card" id="q-editor-card" style="max-width:640px">
        <strong id="editor-title" style="font-size:0.95rem">Novo pitanje</strong>
        <label for="q-text">Tekst pitanja</label>
        <textarea id="q-text" rows="2" placeholder="npr. Kolika je cena proizvoda sa slike?"></textarea>

        <div class="grid3">
          <div>
            <label for="q-answer">Tačan odgovor</label>
            <input type="number" id="q-answer" step="any" placeholder="npr. 1440">
          </div>
          <div>
            <label for="q-min">Min (donja granica)</label>
            <input type="number" id="q-min" step="any" placeholder="npr. 1300">
          </div>
          <div>
            <label for="q-max">Max (gornja granica)</label>
            <input type="number" id="q-max" step="any" placeholder="npr. 1600">
          </div>
        </div>

        <div class="grid3">
          <div>
            <label for="q-unit">Jedinica (opciono)</label>
            <input type="text" id="q-unit" maxlength="20" placeholder="din, kg, km, god.">
          </div>
          <div>
            <label for="q-step">Korak (opciono)</label>
            <input type="number" id="q-step" min="0" step="any" placeholder="1">
          </div>
          <div>
            <label for="q-valuetype">Tip vrednosti</label>
            <select id="q-valuetype">
              <option value="number">Broj</option>
              <option value="duration">Trajanje (mm:ss)</option>
            </select>
          </div>
        </div>

        <label for="q-emoji">Emodži (opciono)</label>
        <input type="text" id="q-emoji" maxlength="8" placeholder="🖨️" style="max-width:120px">

        <label>Slika (opciono)</label>
        <div class="img-zone" id="img-zone">
          <img id="q-img-preview" style="display:none" alt="">
          <div id="q-img-empty" class="hint" style="margin:0">Nema slike.</div>
          <input type="file" id="q-img-file" accept="image/*" style="display:none">
          <div class="row" style="margin-top:0.5rem">
            <button type="button" class="btn btn-ghost btn-sm" id="q-img-pick">Dodaj sliku</button>
            <button type="button" class="btn btn-danger btn-sm" id="q-img-remove" style="display:none">Ukloni sliku</button>
          </div>
        </div>

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
  var API = '/api/admin/pogodi-broj-packs';
  var packs = [];
  var currentId = null;
  var editIndex = null;
  // Image editing state for the current form:
  //  imgMode: 'none' | 'existing' | 'new'
  //  pendingBase64: data URL to upload on save (imgMode === 'new')
  var imgMode = 'none';
  var pendingBase64 = null;

  function show(view){
    $('view-list').style.display = view === 'list' ? 'block' : 'none';
    $('view-pack').style.display = view === 'pack' ? 'block' : 'none';
  }
  function currentPack(){
    for (var i = 0; i < packs.length; i++) if (packs[i].id === currentId) return packs[i];
    return null;
  }

  function parkEditorHome(){
    var card = $('q-editor-card');
    var home = $('editor-home');
    if (card && home) home.insertAdjacentElement('afterend', card);
  }

  function fmtValue(v, unit, valueType){
    if (valueType === 'duration'){
      var t = Math.max(0, Math.round(v));
      var m = Math.floor(t / 60), s = t % 60;
      return m + ':' + (s < 10 ? '0' + s : '' + s);
    }
    var str = String(Math.round(v)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');
    return unit ? str + ' ' + unit : str;
  }

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
      var count = (p.questions || []).length;
      var html = '<div style="flex:1;min-width:0">'
        + '<div class="name">' + esc(p.name || p.id) + '</div>'
        + '<div class="meta">' + esc(p.id) + ' · ' + count + ' pitanja</div></div>';
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

  function renderPack(){
    var p = currentPack();
    if (!p) return;
    parkEditorHome();
    var count = (p.questions || []).length;
    $('pack-title').textContent = 'Pack: ' + p.name + ' (' + p.id + ')';
    $('pack-status').textContent = p.visibleInGame
      ? '✓ Pack je ispravan i vidljiv u igri.'
      : (count === 0
          ? 'Pack je prazan — dodaj bar jedno pitanje da bi se pojavio u igri.'
          : '⚠ Pack nije ispravan i ne vidi se u igri: ' + (p.error || 'nepoznata greška'));
    $('q-count').textContent = String(count);
    var list = $('q-list');
    list.innerHTML = '';
    (p.questions || []).forEach(function(q, i){
      var row = document.createElement('div');
      row.className = 'item-row';
      var thumb = q.imageUrl ? '<img class="q-thumb" src="' + esc(q.imageUrl) + '" alt="">' : '';
      var meta = 'Odgovor: <b>' + esc(fmtValue(q.answer, q.unit, q.valueType)) + '</b>'
        + ' · Raspon: ' + esc(fmtValue(q.min, q.unit, q.valueType)) + ' – ' + esc(fmtValue(q.max, q.unit, q.valueType));
      if (q.step) meta += ' · Korak: ' + esc(q.step);
      row.innerHTML = '<div class="txt">' + (i + 1) + '. ' + (q.emoji ? esc(q.emoji) + ' ' : '') + (q.imageUrl ? '🖼 ' : '') + esc(q.text || '(bez teksta)') + '</div>'
        + thumb
        + '<div class="q-meta">' + meta + '</div>';
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
        api('DELETE', API + '/' + currentId + '/questions/' + i)
          .then(function(data){ replacePack(data.pack); showOk('Pitanje obrisano.'); })
          .catch(function(e){ showErr(e.message); });
      };
      btns.appendChild(edit); btns.appendChild(del);
      row.appendChild(btns);
      list.appendChild(row);
    });
  }

  function replacePack(pack){
    for (var i = 0; i < packs.length; i++){
      if (packs[i].id === pack.id){ packs[i] = pack; break; }
    }
    renderList();
    renderPack();
    resetForm();
  }

  function resetForm(){
    editIndex = null;
    $('editor-title').textContent = 'Novo pitanje';
    $('q-text').value = '';
    $('q-answer').value = '';
    $('q-min').value = '';
    $('q-max').value = '';
    $('q-unit').value = '';
    $('q-step').value = '';
    $('q-emoji').value = '';
    $('q-valuetype').value = 'number';
    setImageNone();
    $('cancel-edit-btn').style.display = 'none';
    $('save-q-btn').textContent = 'Sačuvaj pitanje';
    parkEditorHome();
  }

  function updateImgUi(previewSrc){
    var prev = $('q-img-preview');
    if (previewSrc){
      prev.src = previewSrc;
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
  function setImageNone(){ imgMode = 'none'; pendingBase64 = null; updateImgUi(null); }
  function setImageExisting(url){ imgMode = 'existing'; pendingBase64 = null; updateImgUi(url); }
  function setImageNew(base64){ imgMode = 'new'; pendingBase64 = base64; updateImgUi(base64); }

  function handleImgFile(file){
    if (!file || file.type.indexOf('image/') !== 0){ showErr('Izaberi sliku.'); return; }
    $('q-img-pick').disabled = true;
    downscale(file, 1280, 0.75).then(function(base64){
      if (!base64){ showErr('Ne mogu da pročitam sliku.'); }
      else { setImageNew(base64); showOk('Slika spremna (sačuvaj pitanje da bi se otpremila).'); }
      $('q-img-pick').disabled = false;
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
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e){ URL.revokeObjectURL(url); resolve(null); }
      };
      img.onerror = function(){ URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function startEdit(i){
    var p = currentPack();
    if (!p || !p.questions[i]) return;
    parkEditorHome();
    var q = p.questions[i];
    editIndex = i;
    $('editor-title').textContent = 'Izmena pitanja #' + (i + 1);
    $('q-text').value = q.text || '';
    $('q-answer').value = (q.answer != null ? q.answer : '');
    $('q-min').value = (q.min != null ? q.min : '');
    $('q-max').value = (q.max != null ? q.max : '');
    $('q-unit').value = q.unit || '';
    $('q-step').value = (q.step != null ? q.step : '');
    $('q-emoji').value = q.emoji || '';
    $('q-valuetype').value = q.valueType === 'duration' ? 'duration' : 'number';
    if (q.imageUrl) setImageExisting(q.imageUrl); else setImageNone();
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

  function buildBody(){
    var text = $('q-text').value.trim();
    if (!text){ showErr('Unesi tekst pitanja.'); return null; }
    var answer = parseFloat($('q-answer').value);
    var min = parseFloat($('q-min').value);
    var max = parseFloat($('q-max').value);
    if (!isFinite(answer) || !isFinite(min) || !isFinite(max)){
      showErr('Odgovor, min i max moraju biti brojevi.'); return null;
    }
    if (min >= max){ showErr('Min mora biti manji od max.'); return null; }
    if (answer < min || answer > max){ showErr('Odgovor mora biti između min i max.'); return null; }
    var body = { text: text, answer: answer, min: min, max: max };
    var stepStr = $('q-step').value.trim();
    if (stepStr){
      var step = parseFloat(stepStr);
      if (!isFinite(step) || step <= 0){ showErr('Korak mora biti pozitivan broj.'); return null; }
      body.step = step;
    }
    var unit = $('q-unit').value.trim();
    if (unit) body.unit = unit;
    var vt = $('q-valuetype').value;
    if (vt === 'duration') body.valueType = 'duration';
    var emoji = $('q-emoji').value.trim();
    if (emoji) body.emoji = emoji;
    // Image intent
    if (imgMode === 'new' && pendingBase64) body.imageBase64 = pendingBase64;
    else if (imgMode === 'none' && editIndex !== null) body.removeImage = true;
    return body;
  }

  function saveQuestion(){
    var p = currentPack();
    if (!p) return;
    var body = buildBody();
    if (!body) return;
    var isEdit = editIndex !== null;
    var method = isEdit ? 'PATCH' : 'POST';
    var url = API + '/' + currentId + '/questions' + (isEdit ? '/' + editIndex : '');
    api(method, url, body)
      .then(function(data){ replacePack(data.pack); showOk(isEdit ? 'Pitanje izmenjeno.' : 'Pitanje dodato.'); })
      .catch(function(e){ showErr(e.message); });
  }

  $('create-btn').onclick = function(){
    var name = $('new-name').value.trim();
    if (!name){ showErr('Unesi naziv packa.'); return; }
    api('POST', API, { name: name }).then(function(data){
      packs.push(data.pack);
      packs.sort(function(a, b){ return a.id < b.id ? -1 : 1; });
      $('new-name').value = '';
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

  $('delete-pack-btn').onclick = function(){
    var p = currentPack();
    if (!p) return;
    if (!confirm('Obrisati ceo pack "' + p.id + '"?')) return;
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

  $('q-img-pick').onclick = function(){ $('q-img-file').click(); };
  $('q-img-file').onchange = function(e){
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) handleImgFile(f);
  };
  $('q-img-remove').onclick = function(){ setImageNone(); };

  Admin.start(API, function(data){
    packs = data.packs || [];
    renderList();
    show(currentId ? 'pack' : 'list');
  });
})();
`,
  });
}
