/**
 * Public, standalone Kviz pack generator served at GET /kviz-generator.
 *
 * A self-contained page (no auth, no server round-trips) that lets anyone build
 * a quiz pack — questions of every non-geo type plus bundled images/audio — and
 * export it as `<slug>.zip`. The zip holds `pack.json` (the manifest) + an
 * `assets/` folder; the admin "Podaci" tab imports it via /api/admin/import-quiz-zip.
 *
 * The whole page is one template literal (like the landing/admin pages), so the
 * inline JS avoids backticks and the dollar-brace sequence. The zip is built in
 * the browser with a tiny STORE-method writer (CRC32 + local/central records) —
 * no external library. Geo (pin-on-map) questions are intentionally left to the
 * admin editor since they need server-side projection.
 */
export function renderKvizGeneratorPage(): string {
  return `<!doctype html>
<html lang="sr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Kviz pack generator · Igra na klik</title>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--navy:#1D3557;--navy2:#162E4E;--gold:#C29B47;--cream:#F5EBE0;--ink:#22303f;--muted:#6b7688;--dim:#9aa4b2;--surface:#fff;--surface2:#f4eee4;--surface3:#faf6ef;--line:#e4dccd;--line2:#d9cfbd;--green:#3E7D57;--red:#B85C4F;}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:'Manrope',system-ui,sans-serif;background:var(--cream);color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:920px;margin:0 auto;padding:1.5rem 1.2rem 6rem}
h1,h2,h3{font-family:'Baloo 2',system-ui,sans-serif;margin:0}
.top{display:flex;align-items:center;gap:.8rem;margin:.5rem 0 1.4rem;flex-wrap:wrap}
.logo{font-family:'Baloo 2';font-weight:700;font-size:1.5rem;color:var(--navy)}
.logo b{color:var(--gold)}
.lead{color:var(--muted);font-size:.95rem;margin:.2rem 0 0}
.card{background:var(--surface);border:1.5px solid var(--line);border-radius:16px;padding:1.1rem 1.2rem;margin-bottom:1.1rem;box-shadow:0 2px 10px rgba(29,53,87,.05)}
.card h2{font-size:1.05rem;color:var(--navy);margin-bottom:.7rem;display:flex;align-items:center;gap:.5rem}
label.lbl{display:block;font-weight:700;font-size:.82rem;color:var(--navy);margin:.7rem 0 .3rem}
label.lbl:first-child{margin-top:0}
.sub{font-weight:600;font-size:.75rem;color:var(--muted)}
.field{width:100%;background:var(--surface3);color:var(--ink);border:1.5px solid var(--line2);border-radius:11px;padding:.6rem .75rem;font:inherit;min-height:44px}
.field:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(194,155,71,.18)}
textarea.field{min-height:64px;resize:vertical}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.7rem}
@media(max-width:560px){.row2,.row3{grid-template-columns:1fr}}
.hint{font-size:.78rem;color:var(--muted);margin:.35rem 0 0}
.btn{border:none;border-radius:11px;font:inherit;font-weight:700;padding:.6rem 1rem;cursor:pointer;min-height:44px}
.btn-primary{background:var(--navy);color:var(--cream)}
.btn-primary:disabled{opacity:.45;cursor:not-allowed}
.btn-gold{background:var(--gold);color:#3a2e12}
.btn-ghost{background:var(--surface2);color:var(--navy);border:1.5px solid var(--line2)}
.btn-danger{background:rgba(184,92,79,.12);color:var(--red);border:1.5px solid var(--red)}
.btn-sm{padding:.4rem .7rem;font-size:.82rem;min-height:38px}
.opt-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem}
.opt-row input[type=radio]{width:20px;height:20px;flex:none}
.qlist{display:flex;flex-direction:column;gap:.5rem}
.qrow{display:flex;align-items:center;gap:.7rem;background:var(--surface3);border:1.5px solid var(--line);border-radius:12px;padding:.55rem .75rem}
.qnum{font-weight:800;color:var(--gold);min-width:1.6rem}
.qtype{font-size:.72rem;font-weight:800;color:var(--navy);background:var(--surface2);border-radius:20px;padding:2px 9px;white-space:nowrap}
.qmain{flex:1;min-width:0}
.qtext{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qans{font-size:.8rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qacts{display:flex;gap:.3rem;flex-shrink:0}
.iconbtn{background:var(--surface2);border:1.5px solid var(--line2);border-radius:9px;width:36px;height:36px;cursor:pointer;font-size:.95rem}
.empty{text-align:center;color:var(--muted);padding:1.4rem;border:1.5px dashed var(--line2);border-radius:12px}
.grp{display:none}
.grp.on{display:block}
.tagchips{display:flex;flex-wrap:wrap;gap:.4rem}
.tagchip{padding:.35rem .8rem;border-radius:999px;font-size:.8rem;font-weight:700;cursor:pointer;border:1.5px solid var(--line2);background:var(--surface3);color:var(--muted)}
.mediaprev{max-width:150px;max-height:110px;border-radius:10px;margin-top:.5rem;display:none}
.bar{position:fixed;left:0;right:0;bottom:0;background:rgba(245,235,224,.96);border-top:1.5px solid var(--line);backdrop-filter:blur(8px);padding:.8rem 1.2rem;display:flex;align-items:center;gap:.9rem;justify-content:center;flex-wrap:wrap;z-index:10}
.bar .count{font-weight:700;color:var(--navy)}
.toast{position:fixed;left:50%;bottom:5.5rem;transform:translateX(-50%);background:var(--navy);color:var(--cream);padding:.6rem 1rem;border-radius:10px;font-weight:700;font-size:.9rem;opacity:0;transition:opacity .2s;z-index:20;pointer-events:none}
.toast.show{opacity:1}
.toast.err{background:var(--red)}
a.back{color:var(--navy);font-weight:700;text-decoration:none;font-size:.9rem}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div style="flex:1">
      <div class="logo">Igra <b>na klik</b> · Kviz generator</div>
      <p class="lead">Napravi svoj kviz pack i preuzmi ga kao .zip. Vlasnik igre ga zatim ubacuje kroz „Podaci → Uvezi .zip".</p>
    </div>
    <a class="back" href="/">← Početna</a>
  </div>

  <div class="card">
    <h2>📦 O packu</h2>
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-bottom:.4rem">
      <input type="file" id="import-file" accept=".zip,.json,application/zip,application/json" style="display:none">
      <button class="btn btn-ghost btn-sm" id="import-btn">⬆ Uvezi postojeći .zip / .json</button>
      <span class="hint" style="margin:0">Učitaj pack koji si ranije napravio da ga dopuniš ili ispraviš.</span>
    </div>
    <label class="lbl">Naziv packa *</label>
    <input class="field" id="pk-name" maxlength="80" placeholder="npr. Filmovi 90-ih">
    <label class="lbl">Opis (opciono)</label>
    <input class="field" id="pk-desc" maxlength="200" placeholder="Kratak opis">
    <label class="lbl">Kategorija</label>
    <select class="field" id="pk-cat">
      <option value="">— Ostalo —</option>
      <option value="opste">🧠 Opšte znanje</option>
      <option value="nauka">🔬 Nauka i priroda</option>
      <option value="pop">🎬 Pop kultura i zabava</option>
      <option value="sport">⚽ Sport i razonoda</option>
      <option value="umetnost">🎨 Umetnost i književnost</option>
    </select>
  </div>

  <div class="card">
    <h2>➕ <span id="form-title">Novo pitanje</span></h2>
    <label class="lbl">Tip pitanja</label>
    <select class="field" id="q-type"></select>

    <div class="grp" id="grp-text"><label class="lbl" id="lbl-text">Tekst pitanja</label>
      <textarea class="field" id="q-text" rows="2" placeholder="npr. Koje godine je pao Berlinski zid?"></textarea></div>

    <div class="grp" id="grp-choice"><label class="lbl" id="lbl-choice">Odgovori · označi tačan</label>
      <div class="opt-row"><input type="radio" name="correct" value="0" checked><input class="field" id="q-opt0" placeholder="Odgovor 1"></div>
      <div class="opt-row"><input type="radio" name="correct" value="1"><input class="field" id="q-opt1" placeholder="Odgovor 2"></div>
      <div class="opt-row"><input type="radio" name="correct" value="2"><input class="field" id="q-opt2" placeholder="Odgovor 3 (opciono)"></div>
      <div class="opt-row"><input type="radio" name="correct" value="3"><input class="field" id="q-opt3" placeholder="Odgovor 4 (opciono)"></div>
    </div>

    <div class="grp" id="grp-broj"><div class="row2">
      <div><label class="lbl">Tačan odgovor</label><input class="field" type="number" id="q-b-ans" step="any"></div>
      <div><label class="lbl">Jedinica (opciono)</label><input class="field" id="q-b-unit" maxlength="20" placeholder="din, kg, god."></div>
      <div><label class="lbl">Min (klizač)</label><input class="field" type="number" id="q-b-min" step="any"></div>
      <div><label class="lbl">Max (klizač)</label><input class="field" type="number" id="q-b-max" step="any"></div>
    </div>
      <label class="lbl">Tip prikaza</label>
      <select class="field" id="q-b-vt"><option value="">Broj</option><option value="duration">Trajanje (mm:ss)</option></select></div>

    <div class="grp" id="grp-emoji"><label class="lbl">Emoji zagonetka</label>
      <input class="field" id="q-e-emojis" maxlength="40" placeholder="🦁👑" style="font-size:1.2rem">
      <label class="lbl">Rešenje</label><input class="field" id="q-e-ans" maxlength="60" placeholder="Kralj lavova">
      <label class="lbl">Prihvaćeni odgovori (zarezom, opciono)</label><input class="field" id="q-e-accept" placeholder="The Lion King"></div>

    <div class="grp" id="grp-dopuna"><label class="lbl">Vidljivi deo citata (bez skrivene reči)</label>
      <textarea class="field" id="q-d-quote" rows="2" placeholder="Bolje vrabac u ruci nego golub na"></textarea></div>

    <div class="grp" id="grp-textans"><label class="lbl">Rešenje</label>
      <input class="field" id="q-ta-ans" maxlength="60" placeholder="grani">
      <label class="lbl">Prihvaćeni odgovori (zarezom, opciono)</label><input class="field" id="q-ta-accept" placeholder="na grani"></div>

    <div class="grp" id="grp-redosled"><label class="lbl">Pojmovi u TAČNOM redosledu (jedan po redu, 3–10)</label>
      <textarea class="field" id="q-items" rows="5" placeholder="Prvi svetski rat&#10;Drugi svetski rat&#10;Pad Berlinskog zida"></textarea></div>

    <div class="grp" id="grp-video"><label class="lbl">YouTube link ili ID</label>
      <input class="field" id="q-v-id" placeholder="https://youtu.be/… ili 11 znakova">
      <div class="row2"><div><label class="lbl">Start (s, opciono)</label><input class="field" type="number" id="q-v-start" min="0"></div>
      <div><label class="lbl">Kraj (s, opciono)</label><input class="field" type="number" id="q-v-end" min="1"></div></div></div>

    <div class="grp" id="grp-audio"><label class="lbl">Audio fajl (mp3/ogg/m4a, max ~10 MB)</label>
      <input type="file" id="q-audio-file" accept="audio/*">
      <div class="hint" id="q-audio-name"></div></div>

    <div class="grp" id="grp-image"><label class="lbl" id="lbl-image">Slika (opciono)</label>
      <input type="file" id="q-img-file" accept="image/*">
      <img class="mediaprev" id="q-img-prev" alt="">
      <div class="hint" id="q-img-name"></div></div>

    <label class="lbl">Oznake (interno — igrači ih ne vide)</label>
    <div class="tagchips" id="q-tags"></div>

    <div style="display:flex;gap:.6rem;margin-top:1rem;flex-wrap:wrap">
      <button class="btn btn-primary" id="q-add">Dodaj pitanje</button>
      <button class="btn btn-ghost" id="q-clear" style="display:none">Otkaži izmenu</button>
    </div>
  </div>

  <div class="card">
    <h2>📝 Pitanja (<span id="q-count">0</span>)</h2>
    <div class="qlist" id="qlist"><div class="empty">Još nema pitanja — dodaj prvo gore.</div></div>
  </div>
</div>

<div class="bar">
  <span class="count"><span id="bar-count">0</span> pitanja</span>
  <button class="btn btn-gold" id="export-btn" disabled>⬇ Preuzmi .zip</button>
</div>
<div class="toast" id="toast"></div>

<script>
(function(){
  'use strict';
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  var toastT=null;
  function toast(msg,isErr){ var t=$('toast'); t.textContent=msg; t.className='toast show'+(isErr?' err':''); if(toastT)clearTimeout(toastT); toastT=setTimeout(function(){ t.className='toast'; },2600); }

  var TYPES=[
    {id:'obicno',label:'Obično (2–4 opcije)'},
    {id:'uljez',label:'Uljez (4 pojma)'},
    {id:'broj',label:'Broj (klizač)'},
    {id:'emoji',label:'Emoji zagonetka'},
    {id:'dopuna',label:'Završi citat'},
    {id:'anagram',label:'Anagram'},
    {id:'redosled',label:'Redosled'},
    {id:'audio',label:'Audio + opcije'},
    {id:'video',label:'YouTube + opcije'},
    {id:'piksel',label:'Piksel (slika + odgovor)'}
  ];
  var TYPE_LABEL={}; TYPES.forEach(function(t){ TYPE_LABEL[t.id]=t.label; });
  var TAGS=[{id:'easy',label:'Lako'},{id:'medium',label:'Srednje'},{id:'hard',label:'Teško'},{id:'nsfw',label:'NSFW'}];

  // state
  var questions=[];        // manifest question objects
  var assets={};           // filename -> Uint8Array
  var editIndex=null;      // index being edited, or null
  var pend={ imgName:null, audioName:null };
  var qTags=[];
  var assetSeq=1;

  // ---- type select ----
  var ts=$('q-type');
  TYPES.forEach(function(t){ var o=document.createElement('option'); o.value=t.id; o.textContent=t.label; ts.appendChild(o); });
  ts.onchange=function(){ applyType(this.value); };

  function applyType(t){
    var choice=(t==='obicno'||t==='uljez'||t==='audio'||t==='video');
    show('grp-text', t!=='piksel'); // piksel text is optional; keep but relabel
    show('grp-text', true);
    show('grp-choice', choice);
    show('grp-broj', t==='broj');
    show('grp-emoji', t==='emoji');
    show('grp-dopuna', t==='dopuna');
    show('grp-textans', t==='dopuna'||t==='anagram'||t==='piksel');
    show('grp-redosled', t==='redosled');
    show('grp-video', t==='video');
    show('grp-audio', t==='audio');
    show('grp-image', t==='obicno'||t==='broj'||t==='piksel'||t==='audio');
    $('lbl-choice').textContent=(t==='uljez')?'4 pojma · označi ULJEZA':'Odgovori · označi tačan';
    $('lbl-image').textContent=(t==='piksel')?'Slika (obavezno — to je pitanje)':'Slika (opciono)';
    var optional=(t==='emoji'||t==='dopuna'||t==='anagram'||t==='piksel'||t==='uljez');
    $('lbl-text').textContent=optional?'Tekst pitanja (opciono)':'Tekst pitanja';
  }
  function show(id,on){ $(id).className='grp'+(on?' on':''); }

  // ---- tags ----
  function renderTags(){
    var host=$('q-tags'); host.innerHTML='';
    TAGS.forEach(function(td){
      var on=qTags.indexOf(td.id)>=0;
      var b=document.createElement('button'); b.type='button'; b.className='tagchip'; b.textContent=td.label;
      if(on){ b.style.borderColor=var_gold(); b.style.background='rgba(194,155,71,.16)'; b.style.color='#8a6f2c'; }
      b.onclick=function(){ var i=qTags.indexOf(td.id); if(i>=0)qTags.splice(i,1); else qTags.push(td.id); renderTags(); };
      host.appendChild(b);
    });
  }
  function var_gold(){ return '#C29B47'; }

  // ---- media inputs ----
  function readFileBytes(file){ return file.arrayBuffer().then(function(ab){ return new Uint8Array(ab); }); }
  function extOf(name, fallback){ var m=/\\.([a-z0-9]+)$/i.exec(name||''); return m?m[1].toLowerCase():fallback; }

  $('q-img-file').onchange=function(e){
    var f=e.target.files&&e.target.files[0]; if(!f)return;
    if(f.type.indexOf('image/')!==0){ toast('Izaberi sliku.',true); return; }
    if(f.size>6000000){ toast('Slika je prevelika (max ~6 MB).',true); return; }
    readFileBytes(f).then(function(bytes){
      var ext=extOf(f.name,'jpg'); if(['jpg','jpeg','png','webp'].indexOf(ext)<0)ext='jpg';
      var fn='img_'+(assetSeq++)+'.'+ext; assets[fn]=bytes; pend.imgName=fn;
      var prev=$('q-img-prev'); prev.src=URL.createObjectURL(new Blob([bytes])); prev.style.display='block';
      $('q-img-name').textContent=fn;
    });
  };
  $('q-audio-file').onchange=function(e){
    var f=e.target.files&&e.target.files[0]; if(!f)return;
    if(f.type.indexOf('audio/')!==0){ toast('Izaberi audio fajl.',true); return; }
    if(f.size>11000000){ toast('Audio je prevelik (max ~10 MB).',true); return; }
    readFileBytes(f).then(function(bytes){
      var ext=extOf(f.name,'mp3'); if(['mp3','ogg','m4a'].indexOf(ext)<0)ext='mp3';
      var fn='audio_'+(assetSeq++)+'.'+ext; assets[fn]=bytes; pend.audioName=fn;
      $('q-audio-name').textContent=fn+' ✓';
    });
  };

  // ---- youtube id ----
  function ytId(v){ v=(v||'').trim(); if(/^[A-Za-z0-9_-]{11}$/.test(v))return v; var m=v.match(/(?:youtu[.]be[/]|[?&]v=|[/]embed[/]|[/]shorts[/]|[/]v[/])([A-Za-z0-9_-]{11})/); return m?m[1]:''; }

  // ---- build one question object from the form ----
  function collectChoice(q, needFour){
    var text=$('q-text').value.trim();
    var sel=document.querySelector('input[name=correct]:checked'); var slot=sel?parseInt(sel.value,10):0;
    var opts=[],ci=-1;
    for(var i=0;i<4;i++){ var v=$('q-opt'+i).value.trim(); if(!v)continue; if(i===slot)ci=opts.length; opts.push(v); }
    if(needFour){ if(opts.length!==4){ toast('Uljez mora imati tačno 4 pojma.',true); return null; } }
    else if(opts.length<2){ toast('Unesi bar 2 odgovora.',true); return null; }
    if(ci===-1){ toast('Označi tačan/uljez među popunjenim opcijama.',true); return null; }
    if(!needFour && !text){ toast('Unesi tekst pitanja.',true); return null; }
    if(text)q.text=text; q.options=opts; q.correctIndex=ci; return q;
  }
  function collectAccept(id){
    var raw=$(id).value.trim(); if(!raw)return null;
    var arr=raw.split(',').map(function(a){return a.trim();}).filter(function(a){return a.length>0;});
    return arr.length?arr.slice(0,8):null;
  }
  function build(){
    var t=$('q-type').value; var q={ type:t };
    if(t==='obicno'){ if(!collectChoice(q,false))return null; if(pend.imgName)q.imageFile=pend.imgName; }
    else if(t==='uljez'){ if(!collectChoice(q,true))return null; if(pend.imgName)q.imageFile=pend.imgName; }
    else if(t==='audio'){ if(!collectChoice(q,false))return null; if(!pend.audioName){ toast('Dodaj audio fajl.',true); return null; } q.audioFile=pend.audioName; if(pend.imgName)q.imageFile=pend.imgName; }
    else if(t==='video'){ if(!collectChoice(q,false))return null; var id=ytId($('q-v-id').value); if(!id){ toast('Unesi ispravan YouTube link/ID.',true); return null; } q.videoId=id; var s=$('q-v-start').value.trim(),e=$('q-v-end').value.trim(); if(s)q.startSeconds=parseInt(s,10); if(e)q.endSeconds=parseInt(e,10); }
    else if(t==='broj'){ var text=$('q-text').value.trim(); if(!text){ toast('Unesi tekst pitanja.',true); return null; } q.text=text;
      var a=parseFloat($('q-b-ans').value),mn=parseFloat($('q-b-min').value),mx=parseFloat($('q-b-max').value);
      if(isNaN(a)||isNaN(mn)||isNaN(mx)){ toast('Popuni odgovor, min i max.',true); return null; }
      if(mn>=mx){ toast('Min mora biti manji od max.',true); return null; }
      if(a<mn||a>mx){ toast('Odgovor mora biti između min i max.',true); return null; }
      q.answer=a;q.min=mn;q.max=mx; var u=$('q-b-unit').value.trim(); if(u)q.unit=u; if($('q-b-vt').value)q.valueType=$('q-b-vt').value; if(pend.imgName)q.imageFile=pend.imgName; }
    else if(t==='emoji'){ var et=$('q-text').value.trim(); if(et)q.text=et; var em=$('q-e-emojis').value.trim(); if(!em){ toast('Unesi emoji zagonetku.',true); return null; } q.emojis=em; var ea=$('q-e-ans').value.trim(); if(!ea){ toast('Unesi rešenje.',true); return null; } q.answer=ea; var acc=collectAccept('q-e-accept'); if(acc)q.accept=acc; }
    else if(t==='dopuna'){ var dt=$('q-text').value.trim(); if(dt)q.text=dt; var quote=$('q-d-quote').value.trim(); if(!quote){ toast('Unesi vidljivi deo citata.',true); return null; } q.quote=quote; var da=$('q-ta-ans').value.trim(); if(!da){ toast('Unesi rešenje.',true); return null; } q.answer=da; var dac=collectAccept('q-ta-accept'); if(dac)q.accept=dac; }
    else if(t==='anagram'){ var at=$('q-text').value.trim(); if(at)q.text=at; var aa=$('q-ta-ans').value.trim(); if(!aa){ toast('Unesi rešenje.',true); return null; } q.answer=aa; var aac=collectAccept('q-ta-accept'); if(aac)q.accept=aac; }
    else if(t==='piksel'){ var pt=$('q-text').value.trim(); if(pt)q.text=pt; if(!pend.imgName){ toast('Piksel pitanje mora imati sliku.',true); return null; } q.imageFile=pend.imgName; var pa=$('q-ta-ans').value.trim(); if(!pa){ toast('Unesi rešenje.',true); return null; } q.answer=pa; var pac=collectAccept('q-ta-accept'); if(pac)q.accept=pac; }
    else if(t==='redosled'){ var rt=$('q-text').value.trim(); if(!rt){ toast('Unesi tekst pitanja.',true); return null; } q.text=rt; var lines=$('q-items').value.split(String.fromCharCode(10)).map(function(l){return l.trim();}).filter(function(l){return l.length>0;}); if(lines.length<3||lines.length>10){ toast('Redosled mora imati 3–10 pojmova.',true); return null; } q.items=lines; }
    if(qTags.length)q.tags=qTags.slice();
    return q;
  }

  // ---- form reset / prefill ----
  function resetForm(){
    editIndex=null; pend={imgName:null,audioName:null}; qTags=[];
    $('q-text').value=''; for(var i=0;i<4;i++)$('q-opt'+i).value='';
    document.querySelector('input[name=correct][value="0"]').checked=true;
    $('q-b-ans').value='';$('q-b-min').value='';$('q-b-max').value='';$('q-b-unit').value='';$('q-b-vt').value='';
    $('q-e-emojis').value='';$('q-e-ans').value='';$('q-e-accept').value='';
    $('q-d-quote').value='';$('q-ta-ans').value='';$('q-ta-accept').value='';$('q-items').value='';
    $('q-v-id').value='';$('q-v-start').value='';$('q-v-end').value='';
    $('q-img-file').value='';$('q-audio-file').value='';$('q-img-name').textContent='';$('q-audio-name').textContent='';
    var pv=$('q-img-prev'); pv.style.display='none'; pv.removeAttribute('src');
    $('form-title').textContent='Novo pitanje'; $('q-add').textContent='Dodaj pitanje'; $('q-clear').style.display='none';
    renderTags();
  }
  function editQuestion(idx){
    var q=questions[idx]; if(!q)return; resetForm(); editIndex=idx;
    var t=q.type||'obicno'; $('q-type').value=t; applyType(t);
    qTags=Array.isArray(q.tags)?q.tags.slice():[]; renderTags();
    if(q.text)$('q-text').value=q.text;
    if(Array.isArray(q.options)){ for(var i=0;i<4;i++)$('q-opt'+i).value=q.options[i]||''; var rd=document.querySelector('input[name=correct][value="'+(q.correctIndex||0)+'"]'); if(rd)rd.checked=true; }
    if(t==='broj'){ $('q-b-ans').value=q.answer;$('q-b-min').value=q.min;$('q-b-max').value=q.max;$('q-b-unit').value=q.unit||'';$('q-b-vt').value=q.valueType||''; }
    if(t==='emoji'){ $('q-e-emojis').value=q.emojis||'';$('q-e-ans').value=q.answer||'';$('q-e-accept').value=(q.accept||[]).join(', '); }
    if(t==='dopuna'){ $('q-d-quote').value=q.quote||'';$('q-ta-ans').value=q.answer||'';$('q-ta-accept').value=(q.accept||[]).join(', '); }
    if(t==='anagram'||t==='piksel'){ $('q-ta-ans').value=q.answer||'';$('q-ta-accept').value=(q.accept||[]).join(', '); }
    if(t==='redosled'){ $('q-items').value=(q.items||[]).join(String.fromCharCode(10)); }
    if(t==='video'){ $('q-v-id').value=q.videoId||'';$('q-v-start').value=q.startSeconds!=null?q.startSeconds:'';$('q-v-end').value=q.endSeconds!=null?q.endSeconds:''; }
    if(q.imageFile){ pend.imgName=q.imageFile; var b=assets[q.imageFile]; if(b){ var pv=$('q-img-prev'); pv.src=URL.createObjectURL(new Blob([b])); pv.style.display='block'; } $('q-img-name').textContent=q.imageFile; }
    if(q.audioFile){ pend.audioName=q.audioFile; $('q-audio-name').textContent=q.audioFile+' ✓'; }
    $('form-title').textContent='Izmena pitanja'; $('q-add').textContent='Sačuvaj izmenu'; $('q-clear').style.display='';
    window.scrollTo({top:0,behavior:'smooth'});
  }

  // ---- list render ----
  function ansBrief(q){
    var t=q.type||'obicno';
    if(t==='broj') return '✔ '+esc(q.answer)+(q.unit?' '+esc(q.unit):'');
    if(t==='emoji') return esc(q.emojis)+' → ✔ '+esc(q.answer);
    if(t==='dopuna') return '„'+esc(q.quote)+' …" → ✔ '+esc(q.answer);
    if(t==='anagram'||t==='piksel') return '✔ '+esc(q.answer);
    if(t==='redosled') return (q.items||[]).map(esc).join(' · ');
    if(t==='video') return (q.options||[]).map(function(o,i){return (i===q.correctIndex?'✔ ':'')+esc(o);}).join(' · ')+' · ▶ '+esc(q.videoId);
    if(t==='audio') return (q.options||[]).map(function(o,i){return (i===q.correctIndex?'✔ ':'')+esc(o);}).join(' · ')+' · 🎵';
    return (q.options||[]).map(function(o,i){return (i===q.correctIndex?((t==='uljez'?'🕵️ ':'✔ ')):'')+esc(o);}).join(' · ');
  }
  var DEF={emoji:'Šta se krije iza emojija?',dopuna:'Završi citat!',anagram:'Reši anagram!',piksel:'Šta je na slici?',uljez:'Pronađi uljeza!'};
  function render(){
    var host=$('qlist');
    if(!questions.length){ host.innerHTML='<div class="empty">Još nema pitanja — dodaj prvo gore.</div>'; }
    else {
      var h='';
      questions.forEach(function(q,idx){
        var t=q.type||'obicno';
        h+='<div class="qrow"><span class="qnum">'+(idx+1)+'.</span><span class="qtype">'+esc(TYPE_LABEL[t]||t)+'</span>'
          +'<div class="qmain"><div class="qtext">'+esc(q.text||DEF[t]||'(bez teksta)')+'</div><div class="qans">'+ansBrief(q)+'</div></div>'
          +'<div class="qacts"><button class="iconbtn" data-edit="'+idx+'" title="Izmeni">✎</button><button class="iconbtn" data-del="'+idx+'" title="Obriši">🗑</button></div></div>';
      });
      host.innerHTML=h;
      var eb=host.querySelectorAll('[data-edit]'); for(var i=0;i<eb.length;i++)eb[i].onclick=function(){ editQuestion(parseInt(this.getAttribute('data-edit'),10)); };
      var db=host.querySelectorAll('[data-del]'); for(var j=0;j<db.length;j++)db[j].onclick=function(){ var k=parseInt(this.getAttribute('data-del'),10); if(window.confirm('Obrisati pitanje?')){ questions.splice(k,1); if(editIndex===k)resetForm(); render(); } };
    }
    var n=questions.length;
    $('q-count').textContent=n; $('bar-count').textContent=n;
    $('export-btn').disabled=!(n>0 && $('pk-name').value.trim().length>0);
  }

  // ---- add / update ----
  $('q-add').onclick=function(){
    var q=build(); if(!q)return;
    if(editIndex!=null)questions[editIndex]=q; else questions.push(q);
    resetForm(); render(); toast(editIndex!=null?'Pitanje sačuvano.':'Pitanje dodato.');
  };
  $('q-clear').onclick=function(){ resetForm(); };
  $('pk-name').oninput=function(){ render(); };

  // ---- ZIP (STORE method, no dependency) ----
  var CRC=(function(){ var t=[]; for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; } return t; })();
  function crc32(b){ var c=0xFFFFFFFF; for(var i=0;i<b.length;i++)c=CRC[(c^b[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
  function u16(n){ return [n&0xFF,(n>>>8)&0xFF]; }
  function u32(n){ return [n&0xFF,(n>>>8)&0xFF,(n>>>16)&0xFF,(n>>>24)&0xFF]; }
  function buildZip(files){
    var enc=new TextEncoder(); var parts=[]; var central=[]; var offset=0;
    files.forEach(function(f){
      var name=enc.encode(f.name); var data=f.data; var crc=crc32(data); var size=data.length;
      var local=[].concat(u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(size),u32(size),u16(name.length),u16(0));
      parts.push(new Uint8Array(local)); parts.push(name); parts.push(data);
      var cen=[].concat(u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(size),u32(size),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset));
      central.push(new Uint8Array(cen)); central.push(name);
      offset += local.length + name.length + size;
    });
    var cdSize=0; central.forEach(function(p){ cdSize+=p.length; });
    var eocd=[].concat(u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cdSize),u32(offset),u16(0));
    return new Blob(parts.concat(central).concat([new Uint8Array(eocd)]),{type:'application/zip'});
  }
  function slugify(s){ return String(s||'pack').toLowerCase().replace(/đ/g,'dj').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'pack'; }

  $('export-btn').onclick=function(){
    var name=$('pk-name').value.trim(); if(!name){ toast('Unesi naziv packa.',true); return; }
    if(!questions.length){ toast('Dodaj bar jedno pitanje.',true); return; }
    var manifest={ name:name }; var desc=$('pk-desc').value.trim(); if(desc)manifest.description=desc; var cat=$('pk-cat').value; if(cat)manifest.category=cat;
    manifest.questions=questions;
    var enc=new TextEncoder();
    var files=[{ name:'pack.json', data:enc.encode(JSON.stringify(manifest,null,2)) }];
    var used={};
    questions.forEach(function(q){ if(q.imageFile)used[q.imageFile]=1; if(q.audioFile)used[q.audioFile]=1; });
    for(var fn in used){ if(assets[fn])files.push({ name:'assets/'+fn, data:assets[fn] }); }
    var blob=buildZip(files);
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=slugify(name)+'.zip'; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1500);
    toast('Preuzimam '+slugify(name)+'.zip …');
  };

  // ---- import an existing pack (.zip or bare .json) ----
  function inflateRaw(bytes){
    if(typeof DecompressionStream==='undefined') return Promise.reject(new Error('Ovaj browser ne ume da otpakuje kompresovan .zip — koristi .zip iz ovog generatora.'));
    var ds=new DecompressionStream('deflate-raw');
    return new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer().then(function(ab){ return new Uint8Array(ab); });
  }
  function readZip(u8){
    var dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
    var eocd=-1, lo0=Math.max(0,u8.length-22-65535);
    for(var i=u8.length-22;i>=lo0;i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
    if(eocd<0) throw new Error('Fajl nije validan .zip.');
    var count=dv.getUint16(eocd+10,true); var cd=dv.getUint32(eocd+16,true);
    var tasks=[];
    for(var n=0;n<count;n++){
      if(dv.getUint32(cd,true)!==0x02014b50) throw new Error('Oštećen .zip (central directory).');
      var method=dv.getUint16(cd+10,true), csize=dv.getUint32(cd+20,true);
      var nlen=dv.getUint16(cd+28,true), elen=dv.getUint16(cd+30,true), clen=dv.getUint16(cd+32,true);
      var lo=dv.getUint32(cd+42,true);
      var name=new TextDecoder().decode(u8.subarray(cd+46,cd+46+nlen));
      cd+=46+nlen+elen+clen;
      if(name.charAt(name.length-1)==='/'){ continue; }
      var lnlen=dv.getUint16(lo+26,true), lelen=dv.getUint16(lo+28,true);
      var start=lo+30+lnlen+lelen; var raw=u8.subarray(start,start+csize);
      (function(nm,mt,r){ tasks.push((mt===0?Promise.resolve(new Uint8Array(r)):inflateRaw(r)).then(function(d){ return {name:nm,data:d}; })); })(name,method,raw);
    }
    return Promise.all(tasks);
  }
  function baseName(p){ var s=String(p).split('/'); return s[s.length-1]; }
  function loadManifest(manifest, newAssets){
    if(!manifest || typeof manifest!=='object' || !Array.isArray(manifest.questions)) throw new Error('pack.json nema listu pitanja.');
    $('pk-name').value=manifest.name||''; $('pk-desc').value=manifest.description||'';
    $('pk-cat').value=['opste','nauka','pop','sport','umetnost'].indexOf(manifest.category)>=0?manifest.category:'';
    questions=manifest.questions.slice(); assets=newAssets||{}; assetSeq=1;
    // Keep asset filenames unique going forward (avoid clobbering imported ones).
    for(var k in assets){ var m=/_(\\d+)\\./.exec(k); if(m){ var v=parseInt(m[1],10); if(v>=assetSeq)assetSeq=v+1; } }
    resetForm(); render();
    toast('Učitano: '+questions.length+' pitanja.');
  }
  function handleImport(file){
    var isJson=/\\.json$/i.test(file.name);
    file.arrayBuffer().then(function(ab){
      var u8=new Uint8Array(ab);
      // ZIP local-file signature "PK\\x03\\x04".
      var isZip=(u8.length>4 && u8[0]===0x50 && u8[1]===0x4B && u8[2]===0x03 && u8[3]===0x04);
      if(isJson && !isZip){
        var manifest=JSON.parse(new TextDecoder().decode(u8));
        loadManifest(Array.isArray(manifest)?{questions:manifest}:manifest, {});
        return;
      }
      return readZip(u8).then(function(entries){
        var packJson=null, newAssets={};
        entries.forEach(function(e){
          if(e.name==='pack.json' || baseName(e.name)==='pack.json'){ packJson=e.data; }
          else if(e.name.indexOf('assets/')===0){ newAssets[baseName(e.name)]=e.data; }
        });
        if(!packJson) throw new Error('U .zip-u nema pack.json.');
        var manifest=JSON.parse(new TextDecoder().decode(packJson));
        loadManifest(Array.isArray(manifest)?{questions:manifest}:manifest, newAssets);
      });
    }).catch(function(err){ toast('Uvoz nije uspeo: '+err.message, true); });
  }
  $('import-btn').onclick=function(){ if(questions.length && !window.confirm('Zameniti trenutni pack učitanim?')) return; $('import-file').click(); };
  $('import-file').onchange=function(e){ var f=e.target.files&&e.target.files[0]; e.target.value=''; if(f)handleImport(f); };

  // init
  applyType('obicno'); renderTags(); render();
})();
</script>
</body>
</html>`;
}
