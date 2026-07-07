import { renderAdminPage } from './admin-shell.js';

/**
 * Admin editor for Tajni agenti scenarios (pre-built 5×5 boards), served at
 * GET /admin/tajni-agenti-scenariji. Talks to /api/admin/tajni-agenti-scenarios.
 * Drafts are saveable in any state; the strict 25-card / 9-8-7-1 check runs
 * server-side and its verdict is shown on the page — invalid drafts simply
 * stay invisible in the game.
 * NOTE: the script below lives inside a TS template literal — no backticks
 * or dollar-brace sequences allowed; string concatenation only.
 */
export function renderTajniAgentiScenarioEditorPage(): string {
  return renderAdminPage({
    title: 'Scenariji editor',
    subtitle:
      'Unapred složene table za „Tajni agenti" — 25 karata, raspored 9/8/7/1 (tim sa 9 karata počinje). Klik na boju menja tip karte.',
    active: 'scenariji',
    extraCss: `
#board{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:0.6rem}
.cell{border-radius:10px;padding:4px;display:flex;flex-direction:column;gap:3px;border:1px solid var(--line)}
.cell input{min-height:34px;font-size:0.78rem;padding:0.3rem 0.4rem;border-radius:7px;border-width:1px}
.cell-type{min-height:24px;font-size:0.6rem;font-weight:800;border-radius:7px;text-transform:uppercase;letter-spacing:0.05em;color:#fff}
.cell.t-red{background:rgba(255,77,94,.2)} .cell.t-red .cell-type{background:var(--red)}
.cell.t-blue{background:rgba(59,130,246,.2)} .cell.t-blue .cell-type{background:var(--blue)}
.cell.t-neutral{background:rgba(201,184,150,.14)} .cell.t-neutral .cell-type{background:#c9b896;color:#2b2416}
.cell.t-assassin{background:rgba(0,0,0,.5)} .cell.t-assassin .cell-type{background:#111319;border:1px solid var(--line2)}
#counts{display:flex;gap:0.9rem;flex-wrap:wrap;font-size:0.82rem;font-weight:800;margin-top:0.6rem}
#counts .c-red{color:var(--red)} #counts .c-blue{color:var(--blue)}
#counts .c-neutral{color:#c9b896} #counts .c-assassin{color:var(--muted)}
@media(max-width:640px){.cell input{font-size:0.68rem;min-height:30px;padding:0.2rem 0.3rem}}
`,
    body: `
    <!-- SCENARIO LIST -->
    <div id="view-list">
      <h2>Scenariji</h2>
      <div id="scen-list"></div>
      <div class="card" style="max-width:520px;margin-top:1rem">
        <strong style="font-size:0.95rem">Novi scenario</strong>
        <label for="new-name">Naziv</label>
        <input type="text" id="new-name" placeholder="npr. Rodjendanska tabla">
        <label for="new-code">Kod (max 12 znakova — voditelj ga kuca u igri)</label>
        <input type="text" id="new-code" maxlength="12" placeholder="npr. RODJ25" style="text-transform:uppercase">
        <div style="margin-top:0.9rem">
          <button class="btn btn-primary" id="create-btn">＋ Napravi scenario</button>
        </div>
      </div>
    </div>

    <!-- SCENARIO DETAIL -->
    <div id="view-scen" style="display:none">
      <div class="top-actions">
        <a href="#" class="back" id="back-btn">← Svi scenariji</a>
        <span class="spacer"></span>
        <button class="btn btn-danger btn-sm" id="delete-btn">Obriši scenario</button>
      </div>
      <h2 id="scen-title"></h2>
      <div id="scen-status" class="hint" style="margin-bottom:0.8rem"></div>

      <div class="card">
        <div class="row">
          <div style="flex:1;min-width:160px">
            <label for="scen-name">Naziv</label>
            <input type="text" id="scen-name">
          </div>
          <div style="max-width:200px">
            <label for="scen-code">Kod</label>
            <input type="text" id="scen-code" maxlength="12" style="text-transform:uppercase">
          </div>
        </div>
        <div id="counts"></div>
        <div id="board"></div>
        <p class="hint">Klik na obojenu traku menja tip karte (crvena → plava → neutralna → ubica). Sve reči moraju biti popunjene i različite, raspored 9/8/7/1, da bi scenario bio vidljiv u igri.</p>
        <div class="row" style="margin-top:1rem">
          <button class="btn btn-primary" id="save-btn">Sačuvaj scenario</button>
        </div>
      </div>
    </div>
`,
    script: `
(function(){
  'use strict';
  var $ = Admin.$, esc = Admin.esc, api = Admin.api;
  var showErr = Admin.showErr, showOk = Admin.showOk;
  var API = '/api/admin/tajni-agenti-scenarios';
  var TYPES = ['red', 'blue', 'neutral', 'assassin'];
  var TYPE_LABELS = { red: 'crvena', blue: 'plava', neutral: 'neutralna', assassin: 'ubica' };
  var scenarios = [];
  var currentId = null;
  var cards = []; // working copy of 25 {word, type}

  function show(view){
    $('view-list').style.display = view === 'list' ? 'block' : 'none';
    $('view-scen').style.display = view === 'scen' ? 'block' : 'none';
  }
  function current(){
    for (var i = 0; i < scenarios.length; i++) if (scenarios[i].id === currentId) return scenarios[i];
    return null;
  }

  function renderList(){
    var box = $('scen-list');
    box.innerHTML = '';
    if (scenarios.length === 0){
      box.innerHTML = '<p class="sub">Nema scenarija — napravi prvi ispod.</p>';
      return;
    }
    scenarios.forEach(function(s){
      var row = document.createElement('div');
      row.className = 'pack-row';
      var html = '<div style="flex:1;min-width:0">'
        + '<div class="name">' + esc(s.name || s.id) + ' <span class="meta">kod: ' + esc(s.code || '?') + '</span></div>'
        + '<div class="meta">(' + esc(s.id) + ')</div></div>';
      if (s.visibleInGame){
        html += '<span class="badge badge-ok">' + (s.startingTeam === 'red' ? 'crveni počinju' : 'plavi počinju') + '</span>';
      } else {
        html += '<span class="badge">nevidljiv u igri</span>';
      }
      row.innerHTML = html;
      var open = document.createElement('button');
      open.className = 'btn btn-ghost btn-sm';
      open.textContent = 'Otvori';
      open.onclick = function(){ openScen(s.id); };
      row.appendChild(open);
      box.appendChild(row);
    });
  }

  function openScen(id){
    currentId = id;
    var s = current();
    if (!s) return;
    cards = (s.cards || []).map(function(c){ return { word: c.word || '', type: c.type || 'neutral' }; });
    while (cards.length < 25) cards.push({ word: '', type: 'neutral' });
    cards = cards.slice(0, 25);
    $('scen-title').textContent = 'Scenario: ' + s.id;
    $('scen-name').value = s.name || '';
    $('scen-code').value = s.code || '';
    renderStatus(s);
    renderBoard();
    show('scen');
    window.scrollTo(0, 0);
  }

  function renderStatus(s){
    $('scen-status').textContent = s.visibleInGame
      ? '✓ Scenario je ispravan i vidljiv u igri (' + (s.startingTeam === 'red' ? 'crveni' : 'plavi') + ' počinju).'
      : '⚠ Scenario se ne vidi u igri: ' + (s.error || 'nepotpun');
  }

  function updateCounts(){
    var n = { red: 0, blue: 0, neutral: 0, assassin: 0 };
    var filled = 0;
    cards.forEach(function(c){
      n[c.type]++;
      if (c.word.trim()) filled++;
    });
    $('counts').innerHTML =
      '<span class="c-red">crvene: ' + n.red + '</span>'
      + '<span class="c-blue">plave: ' + n.blue + '</span>'
      + '<span class="c-neutral">neutralne: ' + n.neutral + '/7</span>'
      + '<span class="c-assassin">ubica: ' + n.assassin + '/1</span>'
      + '<span class="c-assassin">reči: ' + filled + '/25</span>'
      + '<span class="c-assassin">(cilj: 9/8 ili 8/9)</span>';
  }

  function renderBoard(){
    var board = $('board');
    board.innerHTML = '';
    cards.forEach(function(card, i){
      var cell = document.createElement('div');
      cell.className = 'cell t-' + card.type;
      var typeBtn = document.createElement('button');
      typeBtn.type = 'button';
      typeBtn.className = 'cell-type';
      typeBtn.textContent = TYPE_LABELS[card.type];
      typeBtn.onclick = function(){
        var next = TYPES[(TYPES.indexOf(card.type) + 1) % TYPES.length];
        card.type = next;
        cell.className = 'cell t-' + next;
        typeBtn.textContent = TYPE_LABELS[next];
        updateCounts();
      };
      var input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 30;
      input.value = card.word;
      input.placeholder = String(i + 1);
      input.addEventListener('input', function(){
        card.word = input.value;
        updateCounts();
      });
      cell.appendChild(typeBtn);
      cell.appendChild(input);
      board.appendChild(cell);
    });
    updateCounts();
  }

  function replaceScen(item){
    for (var i = 0; i < scenarios.length; i++){
      if (scenarios[i].id === item.id){ scenarios[i] = item; break; }
    }
    renderList();
    renderStatus(item);
  }

  $('create-btn').onclick = function(){
    var name = $('new-name').value.trim();
    var code = $('new-code').value.trim().toUpperCase();
    if (!name){ showErr('Unesi naziv scenarija.'); return; }
    if (!code){ showErr('Unesi kod scenarija.'); return; }
    api('POST', API, { name: name, code: code }).then(function(data){
      scenarios.push(data.item);
      scenarios.sort(function(a, b){ return a.id < b.id ? -1 : 1; });
      $('new-name').value = ''; $('new-code').value = '';
      renderList();
      openScen(data.item.id);
      showOk('Scenario napravljen — popuni reči na tabli.');
    }).catch(function(e){ showErr(e.message); });
  };

  $('back-btn').onclick = function(e){
    e.preventDefault();
    currentId = null;
    show('list');
  };

  $('delete-btn').onclick = function(){
    var s = current();
    if (!s) return;
    if (!confirm('Obrisati scenario "' + (s.name || s.id) + '"?')) return;
    api('DELETE', API + '/' + currentId).then(function(){
      scenarios = scenarios.filter(function(x){ return x.id !== currentId; });
      currentId = null;
      renderList();
      show('list');
      showOk('Scenario obrisan.');
    }).catch(function(e){ showErr(e.message); });
  };

  $('save-btn').onclick = function(){
    if (!currentId) return;
    var body = {
      name: $('scen-name').value.trim(),
      code: $('scen-code').value.trim().toUpperCase(),
      cards: cards.map(function(c){ return { word: c.word.trim(), type: c.type }; })
    };
    $('save-btn').disabled = true;
    api('PUT', API + '/' + currentId, body)
      .then(function(data){
        replaceScen(data.item);
        showOk(data.item.visibleInGame
          ? 'Sačuvano — scenario je ispravan i vidljiv u igri.'
          : 'Sačuvano kao nacrt (još nije vidljiv u igri).');
      })
      .catch(function(e){ showErr(e.message); })
      .then(function(){ $('save-btn').disabled = false; });
  };

  Admin.start(API, function(data){
    scenarios = data.scenarios || [];
    renderList();
    show(currentId ? 'scen' : 'list');
  });
})();
`,
  });
}
