import { GAME_DEFINITIONS } from '@igra/shared';

/**
 * Instructions hub, served at GET /uputstva. Lists every game as a card;
 * clicking one reveals that game's short rules below (client-side toggle,
 * linkable via #<game-id>). Gluvo doba links out to its own detailed page.
 *
 * Serbian-only static content (same doctrine as the gluvo-doba rules page).
 * Headings use the display font Baloo 2 (full Serbian Latin coverage — the
 * previous Fredoka lacked č/ć/đ and those letters "jumped"). The inline
 * <script> is inside a TS template literal, so it must avoid backticks and ${ }.
 */

interface GameRuleEntry {
  emoji: string;
  /** Rules body as trusted, author-written HTML (Serbian). */
  body: string;
  requiresTv?: boolean;
  moreHref?: string;
  moreLabel?: string;
}

const GAME_RULES: Record<string, GameRuleEntry> = {
  quiz: {
    emoji: '🧠',
    body: `<p>Kviz sa više vrsta pitanja — svi igraju istovremeno sa telefona.</p>
<ul>
<li><strong>Obična pitanja</strong> (i sa slikom, pesmom 🎵 ili snimkom 🎬): 2–4 ponuđena odgovora, tapneš tačan što brže — brži tačan odgovor nosi više poena.</li>
<li><strong>Geo pitanja</strong> 🗺️: TV pokaže fotografiju, a ti na mapi na telefonu postaviš iglu gde misliš da je slikana — bliža igla, više poena.</li>
<li><strong>Broj pitanja</strong> 🔢: klizačem pogađaš vrednost (cenu, godinu, težinu…) — bliži i brži pogodak nosi više.</li>
<li><strong>Emoji zagonetke</strong> 😀: niz emojija krije film, izreku ili pojam — kucaš odgovor (može više pokušaja), a slova se postepeno otkrivaju kao hint.</li>
<li><strong>Pronađi uljeza</strong> 🕵️: 4 pojma — 3 spadaju zajedno, 1 je uljez; tapni uljeza što brže.</li>
<li><strong>Završi citat</strong> ✍️: poznati citat, stih ili izreka bez poslednje reči — kucaš reč koja nedostaje (sitni tipfeleri se tolerišu).</li>
<li><strong>Piksel slika</strong> 🧩: slika kreće skroz pikselizovana i polako se izoštrava — ko pre prepozna, više poena.</li>
<li><strong>Anagram</strong> 🔀: izmešana slova se polako preslažu u tačan redosled — kucaš reč pre nego što se sama otkrije.</li>
<li><strong>Redosled</strong> ↕️: poređaj 3–10 pojmova (hronološki, po veličini…) — poeni po tačnosti redosleda.</li>
<li><strong>Domino</strong> ⏳: stavke izlaze jedna po jedna — za svaku kažeš da li je „pre/posle" (ili manje/više) od prethodne. Ideš dok ne pogrešiš; više tačnih redom nosi više poena.</li>
<li><strong>Matrica</strong> 🔗: mreža 3×3 pojmova — tapni 3 polja koja imaju zajedničku vezu (isti film, isti tim…). Poeni po broju pogođenih i brzini.</li>
<li>Svako pitanje vredi najviše 1000 poena; pobednik je igrač sa najviše poena na kraju.</li>
</ul>
<p class="tip">Domaćin štiklira jedan ili više packova pitanja (i vrste pitanja) na ekranu za izbor igre, ili uveze svoja pitanja (JSON); packovi se prave u /admin editoru.</p>`,
  },
  asocijacije: {
    emoji: '🧩',
    body: `<p>TV „Slagalica" asocijacije: tabla ima <strong>4 kolone (A, B, C, D)</strong>, svaka sa 4 skrivena polja, i jedno <strong>konačno rešenje</strong> koje povezuje sva četiri rešenja kolona.</p>
<ul>
<li>Igrači se smenjuju na potezu. Na svom potezu <strong>otvoriš jedno polje</strong> (otkrije se pojam), pa možeš da <strong>pogodiš rešenje kolone</strong>, <strong>pokušaš konačno rešenje</strong> ili predaš potez.</li>
<li><strong>Tačno</strong> pogađanje nosi poene i <em>nastavljaš</em> potez; <strong>promašaj</strong> prepušta potez sledećem igraču.</li>
<li>Poeni: rešenje kolone <strong>+300</strong>, konačno rešenje <strong>+1000</strong>.</li>
<li><strong>Klasik mod</strong>: polje se otvara tapom. <strong>Kviz mod</strong>: da otvoriš polje moraš tačno da odgovoriš na pitanje (a/b/c/d) — tačan odgovor je ujedno i pojam u polju.</li>
<li>Tabla se završava kad neko pogodi konačno rešenje; pobednik je igrač sa najviše poena.</li>
</ul>
<p class="tip">Domaćin bira mod (Klasik/Kviz) i paket slagalica na ekranu za izbor igre; paketi se prave u /admin editoru.</p>`,
  },
  'draw-guess': {
    emoji: '🎨',
    body: `<p>Jedan crta, ostali pogađaju.</p>
<ul>
<li>Igrač na potezu dobije tajnu reč i crta je prstom po telefonu — crtež se uživo prikazuje na TV-u.</li>
<li>Ostali kucaju pogađanja; brže tačno pogađanje nosi više poena.</li>
<li>I crtač dobija poene kada ga neko pogodi.</li>
<li>Potez se rotira dok svi ne dođu na red.</li>
</ul>`,
  },
  'fake-artist': {
    emoji: '🖌️',
    body: `<p>Svi crtaju istu reč — osim uljeza koji je ne zna.</p>
<ul>
<li>Svi umetnici vide tajnu reč; jedan igrač je lažni umetnik i ne zna je.</li>
<li>Redom svako doda po jedan potez na zajednički crtež — lažnjak mora da blefira.</li>
<li>Posle crtanja svi glasaju ko je lažni umetnik.</li>
<li>Ako ga uhvate, lažnjak može da se spasi tako što pogodi koja je bila reč.</li>
</ul>`,
  },
  fibbage: {
    emoji: '🤥',
    body: `<p>Napiši uverljivu laž i prevari ostale.</p>
<ul>
<li>TV pokaže pitanje sa nedostajućim odgovorom.</li>
<li>Svako na telefonu upiše lažan, ali uverljiv odgovor.</li>
<li>Prikažu se sve laži zajedno sa tačnim odgovorom; glasaš koji je pravi.</li>
<li>Poeni ako pronađeš tačan odgovor — i ako neko nasedne na tvoju laž.</li>
</ul>`,
  },
  'ko-bi-pre': {
    emoji: '🤔',
    body: `<p>Ko bi pre uradio nešto? Glasajte!</p>
<ul>
<li>TV postavi pitanje tipa „Ko bi pre…".</li>
<li>Svako glasa za jednog igrača iz društva.</li>
<li>Poeni onima koji pogode za koga je glasala većina.</li>
</ul>`,
  },
  'dve-istine-i-laz': {
    emoji: '🎭',
    body: `<p>Dve istine i jedna laž o tebi.</p>
<ul>
<li>Svako upiše dve istinite i jednu lažnu tvrdnju o sebi.</li>
<li>Tvrdnje se pokažu izmešane; ostali pogađaju koja je laž.</li>
<li>Poeni za tačno pogađanje — i za uspešno obmanjivanje ostalih.</li>
</ul>`,
  },
  'slepi-telefoni': {
    emoji: '🔁',
    body: `<p>Pokvareni telefoni sa crtežima.</p>
<ul>
<li>Svako upiše početnu frazu.</li>
<li>Telefon prosledi tvoju frazu sledećem igraču — on je crta.</li>
<li>Sledeći vidi samo crtež i pogađa šta je nacrtano, pa dalje…</li>
<li>Na kraju se prikaže kako se rečenica izvitoperila kroz lanac.</li>
</ul>
<p class="tip">Nema pobednika — igra se zbog smeha.</p>`,
  },
  'ko-sam-ja': {
    emoji: '🙋',
    body: `<p>Koliko dobro poznajete jedni druge?</p>
<ul>
<li>Svaka runda je o jednom igraču (subjektu).</li>
<li>Ostali pogađaju šta je taj igrač odgovorio na lično pitanje.</li>
<li>Poeni za pogađanje; subjekt dobija bonus kada ostali pogreše.</li>
</ul>`,
  },
  'spot-it': {
    emoji: '🔍',
    body: `<p>Pronađi zajednički simbol prvi.</p>
<ul>
<li>Tvoja karta i centralna karta dele tačno jedan isti simbol.</li>
<li>Prvi ko ga uoči i tapne osvaja kartu i otvara novu centralnu.</li>
<li>Pobednik je onaj ko sakupi najviše karata.</li>
</ul>`,
  },
  'bolji-zivot': {
    emoji: '🧿',
    body: `<p>Kartaška igra pamćenja sa bićima iz slovenske mitologije. Bodovi su „uroci" — cilj je nositi ih <strong>što manje</strong>.</p>
<ul>
<li>Svako ima 4 karte okrenute naopačke na svom telefonu — na početku runde proviriš samo 2 i pamtiš ih.</li>
<li>Na potezu: vučeš kartu sa špila (tajno) ili uzmeš vrh otpada (javno), pa je zameniš jednom svojom ili je baciš.</li>
<li>Karte 5–9 imaju moći <em>samo</em> kad ih izvučeš sa špila i odmah baciš: Suđaja — pogledaj svoju (5), Vračara — pogledaj tuđu (6), Podmenak — slepa zamena (7), Gromovnik — grom, svima se otkriva po jedna karta (8), Veštica — pogledaj tuđu i po želji je zameni svojom (9).</li>
<li><strong>Presek („!"):</strong> kada igrač odbaci kartu (0–9) na otpad, a vi imate istu takvu među svojim kartama, tapnite „!" — viknite „Presek!" — i preklopite je preko nje. Pogodak smanjuje porodicu, promašaj donosi kaznenu kartu. Prilika traje dok sledeći igrač ne povuče kartu; prvi pogodak je zatvara.</li>
<li>Specijalne karte: Vesna (10) + Morana (11) zajedno u tvojim kartama vrede 0 — proleće pobeđuje zimu; Zduhać (12) presreće akciju usmerenu na tebe i poništava je (imaš ~3 sekunde da tapneš „!" i označiš ga); Drekavac (13) vrišti posle poziva i daje vlasniku dodatni potez da ga se reši.</li>
<li>Kad misliš da nosiš najmanje uroka, na početku poteza tapni „!" i pozovi <strong>„Zavet!"</strong> — svi ostali odigraju još po jedan potez pa se karte otkrivaju. Ako si strogo najniži, runda ti nosi 0; ako nisi — svoj zbir + 20 kazne!</li>
</ul>
<p class="tip">Pamti pozicije: karte se nikad same ne mešaju, ali tuđa zamena tvoje karte poništava ono što si znao.</p>`,
  },
  'tajni-agenti': {
    emoji: '🕵️',
    body: `<p>Igra šifara na tabli 5×5 — pazi na ubicu. Tri moda, može i sa samo 2 igrača.</p>
<p><strong>Klasik</strong> (4+ igrača, dva tima):</p>
<ul>
<li>Svaki tim ima špijuna koji vidi čije su reči na tabli.</li>
<li>Špijun daje šifru — jedna reč + broj — da navede saigrače na svoje reči.</li>
<li>Ko prvi pogodi sve svoje reči pobeđuje — ali ko dotakne ubicu, odmah gubi.</li>
</ul>
<p><strong>Duet</strong> (2+ igrača, zajednička igra):</p>
<ul>
<li>Nema špijuna — svaka strana vidi svoj tajni ključ i daje šifre drugoj.</li>
<li>Zajedno tražite svih 15 agenata u najviše 9 poteza.</li>
<li>Ubica na strani onoga ko je dao šifru = trenutni poraz za oboje.</li>
</ul>
<p><strong>Kooperativni</strong> (2+ igrača, protiv table):</p>
<ul>
<li>Jedan igrač je špijun, ostali pogađaju — svi ste isti tim.</li>
<li>Nađite 9 agenata pre nego što potrošite 9 poena.</li>
<li>Svaki potez troši poen; pogrešna boja košta dodatni poen.</li>
</ul>`,
  },
  'gluvo-doba': {
    emoji: '🌙',
    moreHref: '/gluvo-doba',
    moreLabel: 'Detaljna pravila, sastavi i sve uloge →',
    body: `<p>Društvena dedukcija sa tajnim ulogama — Sile Mraka protiv sela.</p>
<ul>
<li>TV je narator (noć/dan ciklus), a telefoni nose tajne uloge.</li>
<li>Noću Sile Mraka biraju žrtvu, a posebne uloge koriste svoje moći.</li>
<li>Danju selo raspravlja uživo i glasa koga da obesi.</li>
<li>Selo pobeđuje kad razotkrije sav Mrak; Mrak kad ih bude koliko i ostalih.</li>
</ul>`,
  },
  spijun: {
    emoji: '🕵️',
    body: `<p>Svi znaju tajnu lokaciju — osim špijuna!</p>
<ul>
<li>Na telefonu svako vidi lokaciju i svoju ulogu; špijun vidi samo da je špijun.</li>
<li>Pričate uživo — postavljate jedni drugima pitanja o lokaciji. Špijun blefira, ostali paze da ne odaju previše.</li>
<li>Na telefonu pritisni „Sumnjiv mi je…" — kad se skupi dovoljno glasova, kreće odbrana pa tajno glasanje.</li>
<li>Istekne li vreme, špijun se otkriva i pogađa lokaciju sa javne liste.</li>
<li>Poeni: špijun pogodi lokaciju +300 · ostali ga razotkriju +100 svima (pokretač optužbe +200) · pogrešna optužba: špijun +200.</li>
</ul>`,
  },
  'hot-potato': {
    emoji: '🥔',
    body: `<p>Bomba sa skrivenim tajmerom kruži — brzo je se rešite!</p>
<ul>
<li>Kad ti je krompir, kaži naglas jednu reč iz zadate kategorije i prosledi ga dalje.</li>
<li>Tajmer je skriven i nasumičan — niko ne zna kada će puknuti.</li>
<li>Igrač koji drži krompir kad eksplodira — ispada iz igre.</li>
<li>Prosleđivanje bira domaćin: sledećem po redu ili slobodan izbor kome.</li>
<li><strong>Kviz mod:</strong> umesto kategorije, pitanje iz kviz packova sleće nasumičnom igraču — 5 sekundi za odgovor. Tačno = vidiš sledeće pitanje i biraš kome ga bacaš; netačno ili isteklo vreme = 💥 ispadaš.</li>
<li>Poslednji preživeli pobeđuje.</li>
</ul>`,
  },
  penali: {
    emoji: '⚽',
    requiresTv: true,
    body: `<p>Penal dvoboj: u svakom udarcu jedan igrač šutira, a drugi brani. Rotacija ide u krug, pa svako dođe na red i kao šuter i kao golman.</p>
<ul>
<li><strong>Šuter</strong> drži prst na golu na telefonu i pomera nišan gde želi da pogodi. Dok drži prst, traka snage ide gore-dole — <strong>pusti prst</strong> kad je snaga prava.</li>
<li><strong>Jači udarac</strong> je teže odbraniti, ali je manje precizan — najjači šutevi umeju da odu preko gola.</li>
<li><strong>Golman</strong> naslepo bira jedan od šest uglova (levo/sredina/desno × gore/dole). Ne vidi gde šuter nišani, kao ni šuter njega. Strane su iste kao na TV-u.</li>
<li>Ceo udarac se gleda na TV-u — lopta leti, golman se baca, sudi se odmah.</li>
<li><strong>Poeni:</strong> gol 100 (a pravo u ćošak 150), odbrana 150. Preko gola ili u stativu — niko ništa.</li>
<li>Ako neko ne stigne da odigra: šuteru se računa slab, ofarban udarac, a golman koji nije izabrao ugao ostaje da stoji i ne dobija poene ni ako lopta dođe pravo na njega.</li>
</ul>
<p class="tip">Broj rundi se bira pre početka — jedna runda znači da svako šutira i brani po jednom.</p>`,
  },
};

function playerRange(def: { minPlayers: number; maxPlayers: number }): string {
  return def.minPlayers + '–' + def.maxPlayers + ' igrača';
}

function orderedGames() {
  return Object.values(GAME_DEFINITIONS).filter((def) => GAME_RULES[def.id]);
}

function cardsHtml(): string {
  return orderedGames()
    .map((def) => {
      const r = GAME_RULES[def.id];
      return (
        '<button class="card" type="button" data-game="' +
        def.id +
        '"><span class="emoji">' +
        r.emoji +
        '</span><span class="cn">' +
        def.name +
        '</span><span class="cp">' +
        playerRange(def) +
        '</span></button>'
      );
    })
    .join('\n');
}

function sectionsHtml(): string {
  return orderedGames()
    .map((def) => {
      const r = GAME_RULES[def.id];
      const tv = r.requiresTv
        ? '<div class="tvreq">📺 Zahteva TV ekran (ne može sa samog telefona)</div>'
        : '';
      const more = r.moreHref
        ? '<a class="more" href="' +
          r.moreHref +
          '">' +
          (r.moreLabel || 'Više →') +
          '</a>'
        : '';
      return (
        '<section class="rules-section" id="rules-' +
        def.id +
        '" hidden><h2>' +
        r.emoji +
        ' ' +
        def.name +
        ' <span class="pc">' +
        playerRange(def) +
        '</span></h2><p class="desc">' +
        def.description +
        '</p>' +
        tv +
        '<div class="body">' +
        r.body +
        '</div>' +
        more +
        '</section>'
      );
    })
    .join('\n');
}

export const UPUTSTVA_PAGE_HTML: string = `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#F5EBE0">
<title>Uputstva za igre · Igra Na Klik</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Manrope','Segoe UI',system-ui,sans-serif;background:#F5EBE0;background-image:radial-gradient(760px 460px at 50% -8%,rgba(194,155,71,.18),transparent 62%);color:#2B2B2B;line-height:1.55;padding:2rem 1.25rem 4rem}
main{max-width:46rem;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem}
.back{font-weight:700;color:#B89040;text-decoration:none}
.back:hover{color:#1D3557}
.eyebrow{font-family:'Manrope',system-ui,sans-serif;font-weight:700;font-size:0.72rem;letter-spacing:0.28em;color:#B89040;text-transform:uppercase;margin-top:1rem}
h1{font-family:'Baloo 2','Manrope',system-ui,sans-serif;font-weight:800;font-size:2.1rem;letter-spacing:-0.01em;color:#1D3557}
.lead{color:#5A5348}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:0.7rem}
.card{display:flex;flex-direction:column;align-items:center;gap:0.25rem;text-align:center;padding:0.9rem 0.6rem;background:#FAF6F0;border:1.5px solid rgba(29,53,87,.14);border-radius:14px;cursor:pointer;font:inherit;transition:border-color .15s,background .15s,transform .1s}
.card:hover{border-color:#C29B47;background:#FFFDF9}
.card.active{border-color:#C29B47;background:#FFF7E8;box-shadow:0 6px 18px rgba(194,155,71,.22)}
.card .emoji{font-size:1.8rem;line-height:1}
.card .cn{font-weight:800;font-size:0.98rem;color:#1D3557}
.card .cp{font-size:0.72rem;color:#8B8578}
#detail{scroll-margin-top:1rem}
.placeholder{text-align:center;color:#8B8578;font-size:0.95rem;padding:1.5rem 0}
.rules-section{background:#FAF6F0;border:1px solid rgba(29,53,87,.14);border-radius:16px;padding:1.2rem 1.3rem}
h2{font-family:'Baloo 2','Manrope',system-ui,sans-serif;font-weight:700;font-size:1.4rem;color:#1D3557;display:flex;align-items:baseline;gap:0.5rem;flex-wrap:wrap}
h2 .pc{font-size:0.8rem;font-weight:700;color:#8B8578;letter-spacing:0.02em}
.desc{font-style:italic;color:#5A5348;margin:0.4rem 0 0.8rem}
.tvreq{display:inline-block;background:#EDE2D2;border-left:3px solid #C29B47;border-radius:0 0.5rem 0.5rem 0;padding:0.35rem 0.7rem;font-size:0.85rem;font-weight:700;margin-bottom:0.7rem}
.body p{margin-bottom:0.5rem}
.body ul{padding-left:1.3rem;margin-bottom:0.5rem}
.body li{margin-bottom:0.3rem}
.body .tip{font-size:0.9rem;color:#6E6A5E}
.more{display:inline-block;margin-top:0.6rem;font-weight:700;color:#B89040;text-decoration:none}
.more:hover{color:#1D3557}
</style>
</head>
<body>
<main>
<div>
<a class="back" href="/">← Igra Na Klik</a>
<div class="eyebrow">Uputstva</div>
<h1>📖 Kako se igra?</h1>
<p class="lead">Izaberi igru da vidiš kratka pravila i broj igrača.</p>
</div>

<div class="grid" id="grid">
${cardsHtml()}
</div>

<div id="detail">
<div class="placeholder" id="placeholder">👆 Izaberi igru gore da vidiš uputstvo.</div>
${sectionsHtml()}
</div>
</main>

<script>
(function(){
  var cards = document.querySelectorAll('.card');
  var sections = document.querySelectorAll('.rules-section');
  var placeholder = document.getElementById('placeholder');
  function show(id, doScroll){
    var found = false;
    for (var i = 0; i < sections.length; i++){
      var on = sections[i].id === 'rules-' + id;
      sections[i].hidden = !on;
      if (on) found = true;
    }
    for (var j = 0; j < cards.length; j++){
      var active = cards[j].getAttribute('data-game') === id;
      if (active) cards[j].className = 'card active';
      else cards[j].className = 'card';
    }
    placeholder.style.display = found ? 'none' : 'block';
    if (found){
      if (history.replaceState) history.replaceState(null, '', '#' + id);
      if (doScroll){
        var el = document.getElementById('rules-' + id);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
  for (var k = 0; k < cards.length; k++){
    (function(c){
      c.addEventListener('click', function(){ show(c.getAttribute('data-game'), true); });
    })(cards[k]);
  }
  var initial = (location.hash || '').replace('#', '');
  if (initial) show(initial, false);
})();
</script>
</body>
</html>`;
