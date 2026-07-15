import { renderAdminPage } from './admin-shell.js';

/**
 * Admin editor for „Emoji zagonetke" packs, served at GET /admin/emoji.
 * Talks to /api/admin/emoji-packs (whole-file PUT per save action).
 * NOTE: the script below lives inside a TS template literal — no backticks
 * or dollar-brace sequences allowed; string concatenation only.
 */
export function renderEmojiEditorPage(): string {
  return renderAdminPage({
    title: 'Emoji zagonetke editor',
    subtitle:
      'Packovi zagonetki za „Emoji zagonetke" — niz emojija + tačan odgovor, opciono alternativni odgovori i vreme (5–60 s).',
    active: 'emoji',
    extraCss: `
.q-emojis{font-size:1.6rem;line-height:1.2}
.q-meta{color:var(--muted);font-size:0.8rem;margin-top:0.25rem}
.q-accept{color:var(--cyan);font-size:0.78rem;margin-top:0.2rem}
#q-emojis{font-size:1.4rem}
`,
    body: `
    <!-- PACK LIST -->
    <div id="view-list">
      <h2>Packovi</h2>
      <div id="pack-list"></div>
      <div class="card" style="max-width:520px;margin-top:1rem">
        <strong style="font-size:0.95rem">Novi pack</strong>
        <label for="new-name">Naziv (postaje ime fajla)</label>
        <input type="text" id="new-name" placeholder="npr. Crtani filmovi">
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
        <strong id="editor-title" style="font-size:0.95rem">Nova zagonetka</strong>
        <label for="q-emojis">Emojiji (zagonetka)</label>
        <input type="text" id="q-emojis" placeholder="npr. 🎬🦁👑">
        <label for="q-answer">Tačan odgovor</label>
        <input type="text" id="q-answer" placeholder="npr. Kralj lavova">
        <label for="q-accept">Alternativni odgovori (opciono, razdvoji zarezom)</label>
        <input type="text" id="q-accept" placeholder="npr. The Lion King, Lavlji kralj">
        <label for="q-time" style="margin-top:0.8rem">Vreme u sekundama (opciono, 5–60; podrazumevano 20)</label>
        <input type="number" id="q-time" min="5" max="60" step="1" placeholder="20" style="max-width:140px">
        <div class="row" style="margin-top:1rem">
          <button class="btn btn-primary" id="save-q-btn">Sačuvaj zagonetku</button>
          <button class="btn btn-ghost" id="cancel-edit-btn" style="display:none">Otkaži izmenu</button>
        </div>
      </div>

      <h2>Zagonetke (<span id="q-count">0</span>)</h2>
      <div id="q-list"></div>
    </div>
`,
    script: `
(function(){
  'use strict';
  var $ = Admin.$, esc = Admin.esc, api = Admin.api;
  var showErr = Admin.showErr, showOk = Admin.showOk;
  var API = '/api/admin/emoji-packs';
  var packs = [];
  var currentId = null;
  var editIndex = null;

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
        + '<div class="meta">' + p.count + ' zagonetki</div></div>';
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
    $('pack-title').textContent = 'Pack: ' + p.id;
    $('pack-status').textContent = p.visibleInGame
      ? '✓ Pack je ispravan i vidljiv u igri.'
      : (p.count === 0
          ? 'Pack je prazan — dodaj bar jednu zagonetku da bi se pojavio u igri.'
          : '⚠ Pack nije ispravan i ne vidi se u igri: ' + (p.error || 'nepoznata greška'));
    $('q-count').textContent = String(p.count);
    var list = $('q-list');
    list.innerHTML = '';
    (p.puzzles || []).forEach(function(q, i){
      var row = document.createElement('div');
      row.className = 'item-row';
      var accept = (q.accept && q.accept.length)
        ? '<div class="q-accept">Alt: ' + esc(q.accept.join(', ')) + '</div>' : '';
      row.innerHTML = '<div class="q-emojis">' + esc(q.emojis || '') + '</div>'
        + '<div class="txt">' + (i + 1) + '. ' + esc(q.answer || '(bez odgovora)') + '</div>'
        + accept
        + '<div class="q-meta">' + (q.timeLimit ? '⏱ ' + esc(q.timeLimit) + 's' : '⏱ 20s') + '</div>';
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
        if (!confirm('Obrisati ovu zagonetku?')) return;
        var next = p.puzzles.slice();
        next.splice(i, 1);
        put(next, 'Zagonetka obrisana.');
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
    $('editor-title').textContent = 'Nova zagonetka';
    $('q-emojis').value = '';
    $('q-answer').value = '';
    $('q-accept').value = '';
    $('q-time').value = '';
    $('cancel-edit-btn').style.display = 'none';
    $('save-q-btn').textContent = 'Sačuvaj zagonetku';
    parkEditorHome();
  }

  function startEdit(i){
    var p = currentPack();
    if (!p || !p.puzzles[i]) return;
    parkEditorHome();
    var q = p.puzzles[i];
    editIndex = i;
    $('editor-title').textContent = 'Izmena zagonetke #' + (i + 1);
    $('q-emojis').value = q.emojis || '';
    $('q-answer').value = q.answer || '';
    $('q-accept').value = (q.accept && q.accept.length) ? q.accept.join(', ') : '';
    $('q-time').value = q.timeLimit ? String(q.timeLimit) : '';
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

  function buildPuzzle(){
    var emojis = $('q-emojis').value.trim();
    if (!emojis){ showErr('Unesi emojije.'); return null; }
    var answer = $('q-answer').value.trim();
    if (!answer){ showErr('Unesi tačan odgovor.'); return null; }
    var q = { emojis: emojis, answer: answer };
    var acc = $('q-accept').value.trim();
    if (acc){
      var parts = acc.split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });
      if (parts.length) q.accept = parts;
    }
    var t = $('q-time').value.trim();
    if (t){
      var n = parseInt(t, 10);
      if (isNaN(n) || n < 5 || n > 60){ showErr('Vreme mora biti između 5 i 60 sekundi.'); return null; }
      q.timeLimit = n;
    }
    return q;
  }

  function put(puzzles, okMsg){
    api('PUT', API + '/' + currentId, { puzzles: puzzles })
      .then(function(data){ replacePack(data.item); showOk(okMsg); })
      .catch(function(e){ showErr(e.message); });
  }

  function savePuzzle(){
    var p = currentPack();
    if (!p) return;
    var q = buildPuzzle();
    if (!q) return;
    var next = (p.puzzles || []).slice();
    if (editIndex === null) next.push(q);
    else next[editIndex] = q;
    put(next, editIndex === null ? 'Zagonetka dodata.' : 'Zagonetka izmenjena.');
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

  $('save-q-btn').onclick = savePuzzle;
  $('cancel-edit-btn').onclick = resetForm;

  Admin.start(API, function(data){
    packs = data.packs || [];
    renderList();
    show(currentId ? 'pack' : 'list');
  });
})();
`,
  });
}
