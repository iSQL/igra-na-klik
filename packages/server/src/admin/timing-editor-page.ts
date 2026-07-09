import { renderAdminPage } from './admin-shell.js';

/**
 * Admin editor for the configurable "wait" timings, served at GET /admin/timinzi.
 * Talks to /api/admin/timing-config (GET defs+overrides, PUT the whole overrides
 * object). The form is built dynamically from `defs` returned by the API, so
 * adding a field in game-timings.ts surfaces here automatically.
 * NOTE: the script lives inside a TS template literal — no backticks or
 * dollar-brace sequences; string concatenation only.
 */
export function renderTimingEditorPage(): string {
  return renderAdminPage({
    title: 'Timinzi',
    subtitle:
      'Vremena čekanja (rezultati, rang liste, uvod, narativne pauze) po igri. Aktivni tajmeri (odgovaranje, crtanje, glasanje) se ne diraju ovde. Sve vrednosti su u sekundama.',
    active: 'timinzi',
    extraCss: `
.game-card{max-width:640px;margin-bottom:0.9rem}
.game-card h3{font-family:'Manrope',system-ui,sans-serif;font-size:1rem;font-weight:800;color:#1D3557;margin:0 0 0.2rem}
.tfield{display:flex;align-items:center;gap:0.7rem;padding:0.45rem 0;border-top:1px solid var(--line)}
.tfield:first-of-type{border-top:none}
.tfield .lbl{flex:1;min-width:0;font-size:0.9rem;font-weight:600}
.tfield .bounds{color:var(--dim);font-size:0.72rem;font-weight:600}
.tfield input{max-width:96px;text-align:center}
.tfield input.changed{border-color:var(--gold);background:#FFF9EC}
.save-bar{position:sticky;bottom:0;background:linear-gradient(0deg,var(--bg) 70%,transparent);padding:0.8rem 0;display:flex;gap:0.6rem;align-items:center}
`,
    body: `
    <div id="games"></div>
    <div class="save-bar">
      <button class="btn btn-primary" id="save-btn">Sačuvaj sve</button>
      <button class="btn btn-ghost" id="reset-btn">Vrati sve na podrazumevano</button>
      <span class="spacer"></span>
      <span class="hint" id="dirty-hint" style="margin-top:0"></span>
    </div>
`,
    script: `
(function(){
  'use strict';
  var $ = Admin.$, esc = Admin.esc, api = Admin.api;
  var showErr = Admin.showErr, showOk = Admin.showOk;
  var API = '/api/admin/timing-config';
  var defs = [];
  var overrides = {};

  function inputId(gameId, key){ return 'tf-' + gameId + '-' + key; }

  function render(){
    var box = $('games');
    box.innerHTML = '';
    defs.forEach(function(g){
      var card = document.createElement('div');
      card.className = 'card game-card';
      var html = '<h3>' + esc(g.gameName) + '</h3>';
      g.fields.forEach(function(f){
        var ov = overrides[g.gameId] && overrides[g.gameId][f.key];
        var val = (typeof ov === 'number') ? ov : f.def;
        html += '<div class="tfield">'
          + '<span class="lbl">' + esc(f.label) + '</span>'
          + '<span class="bounds">' + f.min + '–' + f.max + ' s</span>'
          + '<input type="number" id="' + inputId(g.gameId, f.key) + '"'
          + ' min="' + f.min + '" max="' + f.max + '" step="1"'
          + ' value="' + val + '" placeholder="' + f.def + '"'
          + ' data-def="' + f.def + '">'
          + '</div>';
      });
      card.innerHTML = html;
      box.appendChild(card);
    });
    // Highlight inputs that differ from the default + wire change tracking.
    defs.forEach(function(g){
      g.fields.forEach(function(f){
        var el = $(inputId(g.gameId, f.key));
        markChanged(el);
        el.addEventListener('input', function(){ markChanged(el); updateDirty(); });
      });
    });
    updateDirty();
  }

  function markChanged(el){
    var def = parseInt(el.getAttribute('data-def'), 10);
    var v = parseInt(el.value, 10);
    if (!isNaN(v) && v !== def) el.classList.add('changed');
    else el.classList.remove('changed');
  }

  function updateDirty(){
    var n = 0;
    defs.forEach(function(g){
      g.fields.forEach(function(f){
        var el = $(inputId(g.gameId, f.key));
        if (el && el.classList.contains('changed')) n++;
      });
    });
    $('dirty-hint').textContent = n === 0
      ? 'Sve na podrazumevanom.'
      : (n + ' izmenjeno u odnosu na podrazumevano.');
  }

  function collect(){
    var out = {};
    for (var i = 0; i < defs.length; i++){
      var g = defs[i];
      var gout = {};
      for (var j = 0; j < g.fields.length; j++){
        var f = g.fields[j];
        var el = $(inputId(g.gameId, f.key));
        var v = parseInt(el.value, 10);
        if (isNaN(v)){
          showErr(g.gameName + ' · ' + f.label + ': unesi broj.');
          return null;
        }
        if (v < f.min || v > f.max){
          showErr(g.gameName + ' · ' + f.label + ': mora biti između ' + f.min + ' i ' + f.max + '.');
          return null;
        }
        gout[f.key] = v; // server drops values equal to the default
      }
      out[g.gameId] = gout;
    }
    return out;
  }

  function save(body, okMsg){
    $('save-btn').disabled = true;
    api('PUT', API, body)
      .then(function(data){ overrides = data.overrides || {}; render(); showOk(okMsg); })
      .catch(function(e){ showErr(e.message); })
      .then(function(){ $('save-btn').disabled = false; });
  }

  $('save-btn').onclick = function(){
    var body = collect();
    if (!body) return;
    save(body, 'Sačuvano.');
  };

  $('reset-btn').onclick = function(){
    if (!confirm('Vratiti sva vremena na podrazumevano?')) return;
    save({}, 'Vraćeno na podrazumevano.');
  };

  Admin.start(API, function(data){
    defs = data.defs || [];
    overrides = data.overrides || {};
    render();
  });
})();
`,
  });
}
