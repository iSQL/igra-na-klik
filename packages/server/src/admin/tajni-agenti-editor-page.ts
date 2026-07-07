import { renderAdminPage } from './admin-shell.js';
import { TAJNI_AGENTI_MIN_WORDS, TAJNI_AGENTI_MAX_WORD_LENGTH } from '@igra/shared';

/**
 * Admin editor for Tajni agenti word packs, served at GET /admin/tajni-agenti.
 * Talks to /api/admin/tajni-agenti-packs. One textarea, one word per line.
 * NOTE: the script below lives inside a TS template literal — no backticks
 * or dollar-brace sequences allowed; string concatenation only.
 */
export function renderTajniAgentiEditorPage(): string {
  return renderAdminPage({
    title: 'Tajni agenti editor',
    subtitle:
      'Packovi reči za „Tajni agenti" — jedna reč po redu, najmanje ' +
      String(TAJNI_AGENTI_MIN_WORDS) +
      ' jedinstvenih reči da bi pack bio vidljiv u igri.',
    active: 'tajni-agenti',
    extraCss: `
#words{font-size:0.9rem;min-height:320px}
.count-line{font-size:0.85rem;font-weight:800;margin-top:0.4rem}
.count-line.ok{color:var(--green)}
.count-line.low{color:var(--amber)}
`,
    body: `
    <!-- PACK LIST -->
    <div id="view-list">
      <h2>Packovi</h2>
      <div id="pack-list"></div>
      <div class="card" style="max-width:520px;margin-top:1rem">
        <strong style="font-size:0.95rem">Novi pack</strong>
        <label for="new-name">Naziv</label>
        <input type="text" id="new-name" placeholder="npr. Filmovi i serije">
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
        <label for="pack-name">Naziv packa (opciono, prikazuje se u igri)</label>
        <input type="text" id="pack-name">
        <label for="words">Reči — jedna po redu (max __MAXLEN__ znakova po reči; duplikati se sami uklanjaju)</label>
        <textarea id="words" spellcheck="false"></textarea>
        <div class="count-line" id="word-count"></div>
        <div class="row" style="margin-top:1rem">
          <button class="btn btn-primary" id="save-btn">Sačuvaj pack</button>
        </div>
      </div>
    </div>
`.replace('__MAXLEN__', String(TAJNI_AGENTI_MAX_WORD_LENGTH)),
    script: `
(function(){
  'use strict';
  var $ = Admin.$, esc = Admin.esc, api = Admin.api;
  var showErr = Admin.showErr, showOk = Admin.showOk;
  var API = '/api/admin/tajni-agenti-packs';
  var MIN_WORDS = ${TAJNI_AGENTI_MIN_WORDS};
  var packs = [];
  var currentId = null;

  function show(view){
    $('view-list').style.display = view === 'list' ? 'block' : 'none';
    $('view-pack').style.display = view === 'pack' ? 'block' : 'none';
  }
  function currentPack(){
    for (var i = 0; i < packs.length; i++) if (packs[i].id === currentId) return packs[i];
    return null;
  }

  function parseWords(){
    var lines = $('words').value.split('\\n');
    var out = [];
    var seen = {};
    for (var i = 0; i < lines.length; i++){
      var w = lines[i].trim();
      if (!w) continue;
      var key = w.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(w);
    }
    return out;
  }

  function updateCount(){
    var n = parseWords().length;
    var el = $('word-count');
    if (n >= MIN_WORDS){
      el.className = 'count-line ok';
      el.textContent = '✓ ' + n + ' jedinstvenih reči — pack je vidljiv u igri.';
    } else {
      el.className = 'count-line low';
      el.textContent = n + ' / ' + MIN_WORDS + ' jedinstvenih reči — potrebno još ' + (MIN_WORDS - n) + ' da bi se pack pojavio u igri.';
    }
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
        + '<div class="name">' + esc(p.name || p.id) + ' <span class="meta">(' + esc(p.id) + ')</span></div>'
        + '<div class="meta">' + p.count + ' reči</div></div>';
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
      : '⚠ Pack se ne vidi u igri: ' + (p.error || 'premalo reči');
    $('pack-name').value = p.name || '';
    $('words').value = (p.words || []).join('\\n');
    updateCount();
  }

  function replacePack(item){
    for (var i = 0; i < packs.length; i++){
      if (packs[i].id === item.id){ packs[i] = item; break; }
    }
    renderList();
    renderPack();
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
    if (!confirm('Obrisati ceo pack "' + (p.name || p.id) + '"?')) return;
    api('DELETE', API + '/' + currentId).then(function(){
      packs = packs.filter(function(x){ return x.id !== currentId; });
      currentId = null;
      renderList();
      show('list');
      showOk('Pack obrisan.');
    }).catch(function(e){ showErr(e.message); });
  };

  $('save-btn').onclick = function(){
    if (!currentId) return;
    var body = { name: $('pack-name').value.trim(), words: parseWords() };
    $('save-btn').disabled = true;
    api('PUT', API + '/' + currentId, body)
      .then(function(data){ replacePack(data.item); showOk('Pack sačuvan.'); })
      .catch(function(e){ showErr(e.message); })
      .then(function(){ $('save-btn').disabled = false; });
  };

  $('words').addEventListener('input', updateCount);

  Admin.start(API, function(data){
    packs = data.packs || [];
    renderList();
    show(currentId ? 'pack' : 'list');
  });
})();
`,
  });
}
