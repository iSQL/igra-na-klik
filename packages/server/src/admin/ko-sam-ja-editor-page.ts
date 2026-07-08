import { renderAdminPage } from './admin-shell.js';

/**
 * Admin editor for Ko sam ja packs, served at GET /admin/ko-sam-ja.
 * Talks to /api/admin/ko-sam-ja-packs (whole-file PUT per save action).
 * NOTE: the script below lives inside a TS template literal — no backticks
 * or dollar-brace sequences allowed; string concatenation only.
 *
 * The literal placeholder tokens ({subject}, {peer1}...) that appear in the
 * page's static HTML/hints are written with HTML entity &#123; for '{' so
 * the TS template literal never contains a dollar-brace-like sequence and
 * the hints stay copy-pasteable in the browser.
 */
export function renderKoSamJaEditorPage(): string {
  return renderAdminPage({
    title: 'Ko sam ja editor',
    subtitle:
      'Packovi ličnih pitanja za „Ko sam ja" — 4 oblika pitanja (fixed / peer / free / pickN), family i nsfw kategorije.',
    active: 'ko-sam-ja',
    extraCss: `
.shape-blk{margin-top:0.2rem}
.opt-mini{margin-bottom:0.45rem}
`,
    body: `
    <!-- PACK LIST -->
    <div id="view-list">
      <h2>Packovi</h2>
      <div id="pack-list"></div>
      <div class="card" style="max-width:520px;margin-top:1rem">
        <strong style="font-size:0.95rem">Novi pack</strong>
        <label for="new-name">Naziv (postaje ime fajla)</label>
        <input type="text" id="new-name" placeholder="npr. Pitanja za ekipu">
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
        <div class="row">
          <div style="flex:1;min-width:160px">
            <label for="q-shape">Oblik</label>
            <select id="q-shape">
              <option value="fixed">fixed — autorske opcije</option>
              <option value="peer">peer — poređenje dva igrača</option>
              <option value="free">free — slobodan odgovor</option>
              <option value="pickN">pickN — dugme po igraču</option>
            </select>
          </div>
          <div style="flex:1;min-width:140px">
            <label for="q-cat">Kategorija</label>
            <select id="q-cat">
              <option value="family">family</option>
              <option value="nsfw">nsfw</option>
            </select>
          </div>
        </div>
        <label for="q-text">Tekst pitanja</label>
        <textarea id="q-text" rows="2" placeholder="npr. Omiljena boja igrača &#123;subject}?"></textarea>
        <p class="hint" id="text-hint"></p>

        <div class="shape-blk" id="blk-options">
          <label id="options-label">Opcije</label>
          <div class="opt-mini"><input type="text" id="q-opt0" placeholder="Opcija 1"></div>
          <div class="opt-mini"><input type="text" id="q-opt1" placeholder="Opcija 2"></div>
          <div class="opt-mini"><input type="text" id="q-opt2" placeholder="Opcija 3 (opciono)"></div>
          <div class="opt-mini" id="opt3-wrap"><input type="text" id="q-opt3" placeholder="Opcija 4 (opciono)"></div>
          <p class="hint" id="options-hint"></p>
        </div>

        <div class="shape-blk" id="blk-free" style="display:none">
          <label for="q-maxlen">Max dužina odgovora (10–120; podrazumevano 60)</label>
          <input type="number" id="q-maxlen" min="10" max="120" step="1" placeholder="60" style="max-width:140px">
        </div>

        <div class="shape-blk" id="blk-pickn" style="display:none">
          <label for="q-tpl">Šablon dugmeta (opciono)</label>
          <input type="text" id="q-tpl" placeholder="npr. sa &#123;peer}">
          <p class="hint">Mora sadržati &#123;peer} tačno jednom; sme i &#123;subject}. Prazno = samo ime igrača.</p>
          <label for="q-maxpeers">Max broj igrača-dugmadi (2–8; podrazumevano 4)</label>
          <input type="number" id="q-maxpeers" min="2" max="8" step="1" placeholder="4" style="max-width:140px">
          <label>Dodatne opcije (opciono, do 4)</label>
          <div class="opt-mini"><input type="text" id="q-extra0" placeholder="npr. niko"></div>
          <div class="opt-mini"><input type="text" id="q-extra1" placeholder=""></div>
          <div class="opt-mini"><input type="text" id="q-extra2" placeholder=""></div>
          <div class="opt-mini"><input type="text" id="q-extra3" placeholder=""></div>
          <p class="hint" id="extra-hint"></p>
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
  var API = '/api/admin/ko-sam-ja-packs';
  var packs = [];
  var currentId = null;
  var editIndex = null;
  // '{' + name + '}' concatenation keeps the page source free of
  // dollar-brace-like sequences (see file header).
  var PH_SUBJECT = '{' + 'subject}';
  var PH_PEER = '{' + 'peer}';
  var PH_PEER1 = '{' + 'peer1}';
  var PH_PEER2 = '{' + 'peer2}';

  var TEXT_HINTS = {
    fixed: 'Mora sadržati ' + PH_SUBJECT + ' tačno jednom. Bez ' + PH_PEER1 + '/' + PH_PEER2 + '.',
    peer: 'Mora sadržati ' + PH_SUBJECT + ' tačno jednom. Bez opcija: mora i ' + PH_PEER1 + ' i ' + PH_PEER2 + ' tačno jednom.',
    free: 'Mora sadržati ' + PH_SUBJECT + ' tačno jednom. Subjekat kuca slobodan odgovor.',
    pickN: 'Mora sadržati ' + PH_SUBJECT + ' tačno jednom. Dugmad se prave po igračima — bez ' + PH_PEER + ' u tekstu.'
  };
  var OPT_HINTS = {
    fixed: '2–4 različite opcije; smeju sadržati ' + PH_SUBJECT + '.',
    peer: 'OPCIONO: ostavi prazno za automatska dva dugmeta sa imenima. Ako popuniš (2–4), opcije smeju sadržati ' + PH_PEER1 + '/' + PH_PEER2 + '/' + PH_SUBJECT + '.',
    free: 'OPCIONO: ponuđeni netačni odgovori (do 3). Ako popuniš, zamenjuju nasumične — prikazuju se uz odgovor subjekta. Smeju sadržati ' + PH_SUBJECT + ', ' + PH_PEER1 + ' i ' + PH_PEER2 + ' (nasumični igrači).'
  };
  var OPT_LABELS = {
    fixed: 'Opcije',
    peer: 'Opcije',
    free: 'Ponuđeni odgovori (opciono)'
  };
  var EXTRA_HINT = 'Smeju sadržati ' + PH_SUBJECT + ', ' + PH_PEER1 + ' i ' + PH_PEER2 + ' (prva dva izabrana igrača). Bez ' + PH_PEER + '.';

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

  function questionMeta(q){
    var parts = [];
    if (Array.isArray(q.options) && q.options.length) parts.push(q.options.map(esc).join(' · '));
    if (q.shape === 'free') parts.push('max ' + esc(q.maxLength || 60) + ' znakova');
    if (q.shape === 'pickN'){
      if (q.optionTemplate) parts.push('šablon: ' + esc(q.optionTemplate));
      if (q.maxPeers) parts.push('max ' + esc(q.maxPeers) + ' igrača');
      if (Array.isArray(q.extraOptions) && q.extraOptions.length) parts.push('+ ' + q.extraOptions.map(esc).join(' · '));
    }
    return parts.join(' — ');
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
      var tags = '<span class="tag tag-cyan">' + esc(q.shape || '?') + '</span>'
        + '<span class="tag' + (q.category === 'nsfw' ? ' tag-nsfw' : '') + '">' + esc(q.category || '?') + '</span>';
      var meta = questionMeta(q);
      row.innerHTML = '<div>' + tags + '</div>'
        + '<div class="txt" style="margin-top:0.3rem">' + (i + 1) + '. ' + esc(q.text || '(bez teksta)') + '</div>'
        + (meta ? '<div class="meta">' + meta + '</div>' : '');
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

  function applyShape(){
    var shape = $('q-shape').value;
    var showOpts = (shape === 'fixed' || shape === 'peer' || shape === 'free');
    $('blk-options').style.display = showOpts ? 'block' : 'none';
    $('blk-free').style.display = shape === 'free' ? 'block' : 'none';
    $('blk-pickn').style.display = shape === 'pickN' ? 'block' : 'none';
    $('text-hint').textContent = TEXT_HINTS[shape] || '';
    if (showOpts){
      $('options-hint').textContent = OPT_HINTS[shape] || '';
      $('options-label').textContent = OPT_LABELS[shape] || 'Opcije';
    }
    // free allows at most 3 offered answers (the subject's typed answer is
    // the 4th button) — hide and clear the 4th input.
    if (shape === 'free'){
      $('opt3-wrap').style.display = 'none';
      $('q-opt3').value = '';
    } else {
      $('opt3-wrap').style.display = '';
    }
    $('extra-hint').textContent = EXTRA_HINT;
  }

  function resetForm(){
    editIndex = null;
    $('editor-title').textContent = 'Novo pitanje';
    $('q-shape').value = 'fixed';
    $('q-cat').value = 'family';
    $('q-text').value = '';
    for (var i = 0; i < 4; i++){ $('q-opt' + i).value = ''; $('q-extra' + i).value = ''; }
    $('q-maxlen').value = '';
    $('q-tpl').value = '';
    $('q-maxpeers').value = '';
    $('cancel-edit-btn').style.display = 'none';
    $('save-q-btn').textContent = 'Sačuvaj pitanje';
    applyShape();
  }

  function startEdit(i){
    var p = currentPack();
    if (!p || !p.questions[i]) return;
    var q = p.questions[i];
    editIndex = i;
    $('editor-title').textContent = 'Izmena pitanja #' + (i + 1);
    $('q-shape').value = q.shape || 'fixed';
    $('q-cat').value = q.category || 'family';
    $('q-text').value = q.text || '';
    var opts = Array.isArray(q.options) ? q.options : [];
    for (var j = 0; j < 4; j++) $('q-opt' + j).value = opts[j] || '';
    var extras = Array.isArray(q.extraOptions) ? q.extraOptions : [];
    for (var k = 0; k < 4; k++) $('q-extra' + k).value = extras[k] || '';
    $('q-maxlen').value = q.maxLength ? String(q.maxLength) : '';
    $('q-tpl').value = q.optionTemplate || '';
    $('q-maxpeers').value = q.maxPeers ? String(q.maxPeers) : '';
    $('cancel-edit-btn').style.display = '';
    $('save-q-btn').textContent = 'Sačuvaj izmene';
    applyShape();
    window.scrollTo(0, 0);
  }

  function collect(prefix){
    var out = [];
    for (var i = 0; i < 4; i++){
      var v = $(prefix + i).value.trim();
      if (v) out.push(v);
    }
    return out;
  }

  function buildQuestion(){
    var shape = $('q-shape').value;
    var text = $('q-text').value.trim();
    if (!text){ showErr('Unesi tekst pitanja.'); return null; }
    var q = { shape: shape, category: $('q-cat').value, text: text };
    if (shape === 'fixed'){
      q.options = collect('q-opt');
    } else if (shape === 'peer'){
      var opts = collect('q-opt');
      if (opts.length > 0) q.options = opts;
    } else if (shape === 'free'){
      var ml = $('q-maxlen').value.trim();
      if (ml){
        var n = parseInt(ml, 10);
        if (isNaN(n)){ showErr('Max dužina mora biti broj.'); return null; }
        q.maxLength = n;
      }
      var freeOpts = collect('q-opt');
      if (freeOpts.length > 0) q.options = freeOpts;
    } else if (shape === 'pickN'){
      var tpl = $('q-tpl').value.trim();
      if (tpl) q.optionTemplate = tpl;
      var mp = $('q-maxpeers').value.trim();
      if (mp){
        var m = parseInt(mp, 10);
        if (isNaN(m)){ showErr('Max broj igrača mora biti broj.'); return null; }
        q.maxPeers = m;
      }
      var extras = collect('q-extra');
      if (extras.length > 0) q.extraOptions = extras;
    }
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

  $('q-shape').onchange = applyShape;

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
  applyShape();

  Admin.start(API, function(data){
    packs = data.packs || [];
    renderList();
    show(currentId ? 'pack' : 'list');
  });
})();
`,
  });
}
