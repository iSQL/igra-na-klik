import { renderAdminPage } from './admin-shell.js';
import {
  GLUVO_DOBA_PACK_ROLE_IDS,
  GLUVO_DOBA_ROLES,
  GLUVO_DOBA_TEAM_NAMES,
  GLUVO_DOBA_MIN_WOLVES,
  GLUVO_DOBA_MAX_WOLVES,
  type GluvoDobaRoleId,
} from '@igra/shared';

/**
 * Admin editor for Gluvo doba role packs ("modes"), served at
 * GET /admin/gluvo-doba. Talks to /api/admin/gluvo-doba-packs. A pack picks
 * a wolf count + a set of enabled special roles; the game deals those (and
 * fills the rest with Domaćini) instead of the built-in bands.
 *
 * NOTE: the inline script lives inside a TS template literal — no backticks
 * or dollar-brace sequences allowed; string concatenation only. Role
 * metadata is injected once as a JSON literal (safe: no backticks / ${ }).
 */

const EDITOR_ROLE_EMOJI: Record<GluvoDobaRoleId, string> = {
  vukodlak: '🐺',
  vampir: '🧛',
  todorac: '🐎',
  drekavac: '😱',
  bauk: '👹',
  zmaj: '🐉',
  vidovnjak: '🔮',
  zduhac: '🌪️',
  sudjaja: '🧵',
  knez: '👑',
  raskovnik: '🌿',
  bajacica: '🕯️',
  vila: '🧚',
  domacin: '🌾',
  lesnik: '🌲',
  morana: '❄️',
};

export function renderGluvoDobaEditorPage(): string {
  const roleMeta = GLUVO_DOBA_PACK_ROLE_IDS.map((id) => ({
    id,
    name: GLUVO_DOBA_ROLES[id].name,
    team: GLUVO_DOBA_ROLES[id].team,
    teamName: GLUVO_DOBA_TEAM_NAMES[GLUVO_DOBA_ROLES[id].team],
    emoji: EDITOR_ROLE_EMOJI[id],
    desc: GLUVO_DOBA_ROLES[id].description,
  }));

  return renderAdminPage({
    title: 'Gluvo doba editor',
    subtitle:
      'Packovi (modovi) za „Gluvo doba" — izaberi broj vukova i uključene uloge. ' +
      'Igra deli izabrane specijalce koji stanu (nasumičan podskup ako ih je više nego što staje), ostatak su Domaćini.',
    active: 'gluvo-doba',
    extraCss: `
.role-grid{display:grid;grid-template-columns:1fr;gap:0.4rem;margin-top:0.35rem}
@media(min-width:560px){.role-grid{grid-template-columns:1fr 1fr}}
.role-chk{display:flex;gap:0.55rem;align-items:flex-start;padding:0.5rem 0.7rem;background:var(--surface);border:1px solid var(--line);border-radius:11px;cursor:pointer}
.role-chk input{width:auto;min-height:0;margin-top:0.2rem}
.role-chk.on{border-color:var(--gold);background:#FFFCF7}
.role-chk .rn{font-weight:800;font-size:0.9rem}
.role-chk .rd{color:var(--muted);font-size:0.75rem;margin-top:0.1rem}
.team-head{font-family:'Fredoka','Manrope',system-ui,sans-serif;font-size:0.72rem;letter-spacing:0.14em;text-transform:uppercase;margin:0.9rem 0 0.2rem}
.team-dark{color:var(--red)}
.team-selo{color:var(--blue)}
.team-neutralci{color:var(--amber)}
.wolves-row{display:flex;align-items:center;gap:0.6rem}
.wolves-row input{width:5rem}
.summary{font-size:0.85rem;font-weight:700;margin-top:0.6rem;color:var(--green)}
`,
    body: `
    <!-- PACK LIST -->
    <div id="view-list">
      <h2>Packovi</h2>
      <div id="pack-list"></div>
      <div class="card" style="max-width:520px;margin-top:1rem">
        <strong style="font-size:0.95rem">Novi pack</strong>
        <label for="new-name">Naziv</label>
        <input type="text" id="new-name" placeholder="npr. Samo osnovno">
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

      <div class="card" style="max-width:720px">
        <label for="pack-name">Naziv packa (prikazuje se u igri)</label>
        <input type="text" id="pack-name">

        <label>Broj vukodlaka</label>
        <div class="wolves-row">
          <input type="number" id="wolves" min="__MINW__" max="__MAXW__" step="1">
          <span class="hint" style="margin:0">Ostali igrači: izabrani specijalci + Domaćini</span>
        </div>

        <label>Uključene uloge</label>
        <div id="roles"></div>
        <div class="summary" id="summary"></div>

        <div class="row" style="margin-top:1rem">
          <button class="btn btn-primary" id="save-btn">Sačuvaj pack</button>
        </div>
      </div>
    </div>
`.replace('__MINW__', String(GLUVO_DOBA_MIN_WOLVES))
      .replace('__MAXW__', String(GLUVO_DOBA_MAX_WOLVES)),
    script: `
(function(){
  'use strict';
  var $ = Admin.$, esc = Admin.esc, api = Admin.api;
  var showErr = Admin.showErr, showOk = Admin.showOk;
  var API = '/api/admin/gluvo-doba-packs';
  var ROLES = ${JSON.stringify(roleMeta)};
  var TEAM_ORDER = ['vukodlaci', 'selo', 'neutralci'];
  var TEAM_CLASS = { vukodlaci: 'team-dark', selo: 'team-selo', neutralci: 'team-neutralci' };
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

  function buildRoleGrid(){
    var box = $('roles');
    box.innerHTML = '';
    for (var t = 0; t < TEAM_ORDER.length; t++){
      var team = TEAM_ORDER[t];
      var inTeam = ROLES.filter(function(r){ return r.team === team; });
      if (inTeam.length === 0) continue;
      var head = document.createElement('div');
      head.className = 'team-head ' + TEAM_CLASS[team];
      head.textContent = inTeam[0].teamName;
      box.appendChild(head);
      var grid = document.createElement('div');
      grid.className = 'role-grid';
      inTeam.forEach(function(r){
        var lab = document.createElement('label');
        lab.className = 'role-chk';
        lab.setAttribute('data-role', r.id);
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = r.id;
        cb.addEventListener('change', function(){
          lab.className = 'role-chk' + (cb.checked ? ' on' : '');
          updateSummary();
        });
        var txt = document.createElement('div');
        txt.innerHTML = '<div class="rn">' + r.emoji + ' ' + esc(r.name) + '</div>'
          + '<div class="rd">' + esc(r.desc) + '</div>';
        lab.appendChild(cb);
        lab.appendChild(txt);
        grid.appendChild(lab);
      });
      box.appendChild(grid);
    }
  }

  function setChecked(roleIds){
    var set = {};
    for (var i = 0; i < roleIds.length; i++) set[roleIds[i]] = true;
    var labs = $('roles').querySelectorAll('.role-chk');
    for (var j = 0; j < labs.length; j++){
      var id = labs[j].getAttribute('data-role');
      var cb = labs[j].querySelector('input');
      cb.checked = !!set[id];
      labs[j].className = 'role-chk' + (cb.checked ? ' on' : '');
    }
  }
  function readChecked(){
    var out = [];
    var cbs = $('roles').querySelectorAll('input[type=checkbox]');
    for (var i = 0; i < cbs.length; i++) if (cbs[i].checked) out.push(cbs[i].value);
    return out;
  }
  function updateSummary(){
    var w = parseInt($('wolves').value, 10) || 0;
    var n = readChecked().length;
    $('summary').textContent = w + ' ' + (w === 1 ? 'vukodlak' : 'vukodlaka')
      + ' + ' + n + ' ' + (n === 1 ? 'specijalac' : 'specijalaca') + ' + Domaćini';
  }

  function renderList(){
    var box = $('pack-list');
    box.innerHTML = '';
    if (packs.length === 0){
      box.innerHTML = '<p class="sub">Nema packova — napravi prvi ispod. (Bez packa igra koristi ugrađeni balans.)</p>';
      return;
    }
    packs.forEach(function(p){
      var row = document.createElement('div');
      row.className = 'pack-row';
      var html = '<div style="flex:1;min-width:0">'
        + '<div class="name">' + esc(p.name || p.id) + ' <span class="meta">(' + esc(p.id) + ')</span></div>'
        + '<div class="meta">' + p.wolves + ' vuka · ' + (p.roles ? p.roles.length : 0) + ' specijalaca</div></div>';
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
      : '⚠ Pack se ne vidi u igri: ' + (p.error || 'nevažeći');
    $('pack-name').value = p.name || '';
    $('wolves').value = p.wolves != null ? p.wolves : 2;
    setChecked(p.roles || []);
    updateSummary();
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
    var body = {
      name: $('pack-name').value.trim(),
      wolves: parseInt($('wolves').value, 10) || 0,
      roles: readChecked()
    };
    $('save-btn').disabled = true;
    api('PUT', API + '/' + currentId, body)
      .then(function(data){ replacePack(data.item); showOk('Pack sačuvan.'); })
      .catch(function(e){ showErr(e.message); })
      .then(function(){ $('save-btn').disabled = false; });
  };

  $('wolves').addEventListener('input', updateSummary);

  buildRoleGrid();
  Admin.start(API, function(data){
    packs = data.packs || [];
    renderList();
    show(currentId ? 'pack' : 'list');
  });
})();
`,
  });
}
