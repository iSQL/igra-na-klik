import { renderAdminPage } from './admin-shell.js';

/**
 * Admin editor for quiz question packs, served at GET /admin/kviz.
 * Talks to /api/admin/quiz-packs (whole-file PUT per save action).
 * NOTE: the script below lives inside a TS template literal — no backticks
 * or dollar-brace sequences allowed; string concatenation only.
 */
export function renderQuizEditorPage(): string {
  return renderAdminPage({
    title: 'Kviz editor',
    subtitle:
      'Packovi pitanja za „Kviz" — 2 do 4 odgovora po pitanju, jedan tačan, opciono slika i vreme (5–60 s).',
    active: 'kviz',
    extraCss: `
.opt-row{display:flex;gap:0.5rem;align-items:center;margin-bottom:0.45rem}
.opt-row input[type=radio]{width:20px;height:20px;accent-color:#3E7D57;flex:none}
.q-opts{color:var(--muted);font-size:0.8rem;margin-top:0.25rem}
.q-opts .correct{color:var(--green);font-weight:800}
.img-zone{border:1px dashed var(--border,#cbb);border-radius:10px;padding:0.7rem;margin-top:0.3rem}
.img-zone img{display:block;max-width:100%;max-height:190px;border-radius:8px;margin-bottom:0.5rem}
.q-thumb{max-width:120px;max-height:90px;border-radius:8px;margin-top:0.4rem;display:block}
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

      <div class="card" style="max-width:640px">
        <strong id="editor-title" style="font-size:0.95rem">Novo pitanje</strong>
        <label for="q-text">Tekst pitanja</label>
        <textarea id="q-text" rows="2" placeholder="npr. Koja planeta je najbliža Suncu?"></textarea>
        <label>Odgovori (2–4; označi tačan)</label>
        <div class="opt-row"><input type="radio" name="correct" value="0" checked><input type="text" id="q-opt0" placeholder="Odgovor 1"></div>
        <div class="opt-row"><input type="radio" name="correct" value="1"><input type="text" id="q-opt1" placeholder="Odgovor 2"></div>
        <div class="opt-row"><input type="radio" name="correct" value="2"><input type="text" id="q-opt2" placeholder="Odgovor 3 (opciono)"></div>
        <div class="opt-row"><input type="radio" name="correct" value="3"><input type="text" id="q-opt3" placeholder="Odgovor 4 (opciono)"></div>
        <label>Slika (opciono) — npr. „Koji pevač je na slici?"</label>
        <div class="img-zone" id="img-zone">
          <img id="q-img-preview" style="display:none" alt="">
          <div id="q-img-empty" class="hint" style="margin:0">Nema slike.</div>
          <input type="file" id="q-img-file" accept="image/*" style="display:none">
          <div class="row" style="margin-top:0.5rem">
            <button type="button" class="btn btn-ghost btn-sm" id="q-img-pick">Dodaj sliku</button>
            <button type="button" class="btn btn-danger btn-sm" id="q-img-remove" style="display:none">Ukloni sliku</button>
          </div>
        </div>
        <label for="q-time" style="margin-top:0.8rem">Vreme u sekundama (opciono, 5–60; podrazumevano 15)</label>
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
  var packs = [];
  var currentId = null;
  var editIndex = null;
  // Server path (/quiz-images/...) of the image on the question being edited,
  // or null. Set by a successful upload, cleared by "Ukloni sliku" / reset.
  var pendingImageUrl = null;

  function show(view){
    $('view-list').style.display = view === 'list' ? 'block' : 'none';
    $('view-pack').style.display = view === 'pack' ? 'block' : 'none';
  }
  function currentPack(){
    for (var i = 0; i < packs.length; i++) if (packs[i].id === currentId) return packs[i];
    return null;
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
      var html = '<div style="flex:1;min-width:0">'
        + '<div class="name">' + esc(p.id) + '</div>'
        + '<div class="meta">' + p.count + ' pitanja</div></div>';
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
    $('pack-title').textContent = 'Pack: ' + p.id;
    $('pack-status').textContent = p.visibleInGame
      ? '✓ Pack je ispravan i vidljiv u igri.'
      : (p.count === 0
          ? 'Pack je prazan — dodaj bar jedno pitanje da bi se pojavio u igri.'
          : '⚠ Pack nije ispravan i ne vidi se u igri: ' + (p.error || 'nepoznata greška'));
    $('q-count').textContent = String(p.count);
    var list = $('q-list');
    list.innerHTML = '';
    (p.questions || []).forEach(function(q, i){
      var row = document.createElement('div');
      row.className = 'item-row';
      var opts = '';
      var qOpts = Array.isArray(q.options) ? q.options : [];
      for (var j = 0; j < qOpts.length; j++){
        if (j > 0) opts += ' · ';
        if (j === q.correctIndex) opts += '<span class="correct">✓ ' + esc(qOpts[j]) + '</span>';
        else opts += esc(qOpts[j]);
      }
      var thumb = q.imageUrl ? '<img class="q-thumb" src="' + esc(q.imageUrl) + '" alt="">' : '';
      row.innerHTML = '<div class="txt">' + (i + 1) + '. ' + (q.imageUrl ? '🖼 ' : '') + esc(q.text || '(bez teksta)') + '</div>'
        + thumb
        + '<div class="q-opts">' + opts + (q.timeLimit ? ' · ⏱ ' + esc(q.timeLimit) + 's' : '') + '</div>';
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
        put(next, 'Pitanje obrisano.');
      };
      btns.appendChild(edit); btns.appendChild(del);
      row.appendChild(btns);
      list.appendChild(row);
    });
  }

  function replacePack(item){
    for (var i = 0; i < packs.length; i++){
      if (packs[i].id === item.id){ packs[i] = item; break; }
    }
    renderList();
    renderPack();
    resetForm();
  }

  function resetForm(){
    editIndex = null;
    $('editor-title').textContent = 'Novo pitanje';
    $('q-text').value = '';
    for (var i = 0; i < 4; i++) $('q-opt' + i).value = '';
    document.querySelector('input[name=correct][value="0"]').checked = true;
    $('q-time').value = '';
    setImage(null);
    $('cancel-edit-btn').style.display = 'none';
    $('save-q-btn').textContent = 'Sačuvaj pitanje';
  }

  // Reflect the current image (or its absence) in the editor form.
  function setImage(url){
    pendingImageUrl = url || null;
    var prev = $('q-img-preview');
    if (pendingImageUrl){
      prev.src = pendingImageUrl;
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

  // Downscale a picked file to a small JPEG and upload it; the server stores
  // it and returns a short /quiz-images/... path we keep on the question.
  function handleImgFile(file){
    if (!file || file.type.indexOf('image/') !== 0){ showErr('Izaberi sliku.'); return; }
    $('q-img-pick').disabled = true;
    downscale(file, 1280, 0.75).then(function(base64){
      if (!base64){ showErr('Ne mogu da pročitam sliku.'); $('q-img-pick').disabled = false; return; }
      return api('POST', '/api/admin/quiz-image', { imageBase64: base64 })
        .then(function(data){ setImage(data.imageUrl); showOk('Slika dodata.'); })
        .catch(function(e){ showErr(e.message); });
    }).then(function(){ $('q-img-pick').disabled = false; });
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
    var q = p.questions[i];
    editIndex = i;
    $('editor-title').textContent = 'Izmena pitanja #' + (i + 1);
    $('q-text').value = q.text || '';
    var qOpts = Array.isArray(q.options) ? q.options : [];
    for (var j = 0; j < 4; j++) $('q-opt' + j).value = qOpts[j] || '';
    var ci = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
    var radio = document.querySelector('input[name=correct][value="' + ci + '"]');
    if (radio) radio.checked = true;
    $('q-time').value = q.timeLimit ? String(q.timeLimit) : '';
    setImage(q.imageUrl || null);
    $('cancel-edit-btn').style.display = '';
    $('save-q-btn').textContent = 'Sačuvaj izmene';
    window.scrollTo(0, 0);
  }

  function buildQuestion(){
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
    var q = { text: text, options: options, correctIndex: correctIndex };
    var t = $('q-time').value.trim();
    if (t){
      var n = parseInt(t, 10);
      if (isNaN(n) || n < 5 || n > 60){ showErr('Vreme mora biti između 5 i 60 sekundi.'); return null; }
      q.timeLimit = n;
    }
    if (pendingImageUrl) q.imageUrl = pendingImageUrl;
    return q;
  }

  function put(questions, okMsg){
    api('PUT', API + '/' + currentId, { questions: questions })
      .then(function(data){ replacePack(data.item); showOk(okMsg); })
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
    put(next, editIndex === null ? 'Pitanje dodato.' : 'Pitanje izmenjeno.');
  }

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
  $('q-img-remove').onclick = function(){ setImage(null); };

  Admin.start(API, function(data){
    packs = data.packs || [];
    renderList();
    show(currentId ? 'pack' : 'list');
  });
})();
`,
  });
}
