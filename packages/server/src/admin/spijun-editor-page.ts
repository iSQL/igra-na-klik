import { renderAdminPage } from './admin-shell.js';
import {
  SPIJUN_MIN_LOCATIONS,
  SPIJUN_MIN_ROLES,
  SPIJUN_MAX_LOCATION_LENGTH,
  SPIJUN_MAX_ROLE_LENGTH,
} from '@igra/shared';

/**
 * Admin editor for Špijun location packs, served at GET /admin/spijun.
 * Talks to /api/admin/spijun-packs. One big textarea: locations as blocks
 * separated by a blank line — first line of a block is the location name,
 * every following line one role.
 * NOTE: the script below lives inside a TS template literal — no backticks
 * or dollar-brace sequences allowed; string concatenation only.
 */
export function renderSpijunEditorPage(): string {
  return renderAdminPage({
    title: 'Špijun editor',
    subtitle:
      'Packovi lokacija za „Špijun" — blokovi razdvojeni praznim redom: ' +
      'prvi red je lokacija, svaki sledeći red jedna uloga. Najmanje ' +
      String(SPIJUN_MIN_LOCATIONS) +
      ' lokacije (svaka sa bar ' +
      String(SPIJUN_MIN_ROLES) +
      ' uloge) da bi pack bio vidljiv u igri.',
    active: 'spijun',
    extraCss: `
#locations{font-size:0.9rem;min-height:380px;font-family:inherit}
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
        <input type="text" id="new-name" placeholder="npr. Kancelarijske lokacije">
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
        <label for="pack-name">Naziv packa (opciono, prikazuje se u igri)</label>
        <input type="text" id="pack-name">
        <label for="locations">Lokacije — blokovi razdvojeni praznim redom (1. red lokacija, ostali redovi uloge)</label>
        <textarea id="locations" spellcheck="false" placeholder="Srpska svadba pod šatrom
Pijani teča
Mladoženjin kum
Kuvarica kupusa

Šalter u Pošti
Radnica koja kuca jednim prstom
Nervozni penzioner"></textarea>
        <div class="count-line" id="loc-count"></div>
        <div class="row" style="margin-top:1rem">
          <button class="btn btn-primary" id="save-btn">Sačuvaj pack</button>
        </div>
      </div>
    </div>
`,
    script: `
(function(){
  'use strict';
  var $ = Admin.$, esc = Admin.esc, api = Admin.api;
  var showErr = Admin.showErr, showOk = Admin.showOk;
  var API = '/api/admin/spijun-packs';
  var MIN_LOCATIONS = ${SPIJUN_MIN_LOCATIONS};
  var MIN_ROLES = ${SPIJUN_MIN_ROLES};
  var MAX_LOC_LEN = ${SPIJUN_MAX_LOCATION_LENGTH};
  var MAX_ROLE_LEN = ${SPIJUN_MAX_ROLE_LENGTH};
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

  // Textarea → [{location, roles}] blocks; blank line separates blocks.
  function parseLocations(){
    var blocks = $('locations').value.split(/\\n\\s*\\n/);
    var out = [];
    for (var i = 0; i < blocks.length; i++){
      var lines = blocks[i].split('\\n');
      var cleaned = [];
      for (var j = 0; j < lines.length; j++){
        var t = lines[j].trim();
        if (t) cleaned.push(t);
      }
      if (cleaned.length === 0) continue;
      out.push({
        location: cleaned[0].slice(0, MAX_LOC_LEN),
        roles: cleaned.slice(1).map(function(r){ return r.slice(0, MAX_ROLE_LEN); })
      });
    }
    return out;
  }

  function locationsToText(list){
    var parts = [];
    (list || []).forEach(function(l){
      parts.push([l.location].concat(l.roles || []).join('\\n'));
    });
    return parts.join('\\n\\n');
  }

  function updateCount(){
    var locs = parseLocations();
    var el = $('loc-count');
    var thin = locs.filter(function(l){ return (l.roles || []).length < MIN_ROLES; });
    if (locs.length >= MIN_LOCATIONS && thin.length === 0){
      el.className = 'count-line ok';
      el.textContent = '✓ ' + locs.length + ' lokacija — pack je vidljiv u igri.';
    } else if (thin.length > 0){
      el.className = 'count-line low';
      el.textContent = locs.length + ' lokacija, ali "' + thin[0].location + '" ima manje od ' + MIN_ROLES + ' uloge.';
    } else {
      el.className = 'count-line low';
      el.textContent = locs.length + ' / ' + MIN_LOCATIONS + ' lokacija — potrebno još ' + (MIN_LOCATIONS - locs.length) + ' da bi se pack pojavio u igri.';
    }
  }

  function renderList(){
    var box = $('pack-list');
    box.innerHTML = '';
    if (packs.length === 0){
      box.innerHTML = '<p class="sub">Nema packova — napravi prvi ispod. Bez packa igra koristi ugrađenih ~25 domaćih lokacija.</p>';
      return;
    }
    packs.forEach(function(p){
      var row = document.createElement('div');
      row.className = 'pack-row';
      var html = '<div style="flex:1;min-width:0">'
        + '<div class="name">' + esc(p.name || p.id) + ' <span class="meta">(' + esc(p.id) + ')</span></div>'
        + '<div class="meta">' + p.count + ' lokacija</div></div>';
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
      : '⚠ Pack se ne vidi u igri: ' + (p.error || 'premalo lokacija');
    $('pack-name').value = p.name || '';
    $('locations').value = locationsToText(p.locations);
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
    var body = { name: $('pack-name').value.trim(), locations: parseLocations() };
    $('save-btn').disabled = true;
    api('PUT', API + '/' + currentId, body)
      .then(function(data){ replacePack(data.item); showOk('Pack sačuvan.'); })
      .catch(function(e){ showErr(e.message); })
      .then(function(){ $('save-btn').disabled = false; });
  };

  $('locations').addEventListener('input', updateCount);

  Admin.start(API, function(data){
    packs = data.packs || [];
    renderList();
    show(currentId ? 'pack' : 'list');
  });
})();
`,
  });
}
