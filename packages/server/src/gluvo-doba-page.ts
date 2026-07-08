import {
  GLUVO_DOBA_ROLES,
  GLUVO_DOBA_HINT_GROUPS,
  GLUVO_DOBA_TEAM_NAMES,
} from '@igra/shared';
import type { GluvoDobaRoleId, GluvoDobaTeam } from '@igra/shared';

/**
 * Static rules page for Gluvo doba, served at GET /gluvo-doba. Same
 * inline-HTML approach as the landing page (cream canvas, Google Fonts).
 * The current-roles section is generated from GLUVO_DOBA_ROLES so the page
 * can never drift from the game's actual role card texts.
 */

const ROLE_EMOJI: Record<GluvoDobaRoleId, string> = {
  vukodlak: '🐺',
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

const TEAM_COLORS: Record<GluvoDobaTeam, string> = {
  vukodlaci: '#a13c32',
  selo: '#1D3557',
  neutralci: '#8a6a23',
};

function roleCards(team: GluvoDobaTeam): string {
  return Object.values(GLUVO_DOBA_ROLES)
    .filter((def) => def.team === team)
    .map(
      (def) =>
        '<div class="role"><div class="role-name" style="color:' +
        TEAM_COLORS[team] +
        '">' +
        ROLE_EMOJI[def.id] +
        ' ' +
        def.name +
        '</div><p>' +
        def.description +
        '</p></div>'
    )
    .join('\n');
}

const PLANNED_ROLES: { name: string; team: string; desc: string }[] = [
  {
    name: '🧛 Vampir',
    team: 'Sile Mraka',
    desc: 'Zajedno sa Vukodlakom bira žrtvu svake noći. Ako Vukodlak pogine, on preuzima vođstvo čopora.',
  },
  {
    name: '🐈‍⬛ Karakondžula',
    team: 'Sile Mraka',
    desc: 'Noću „zajaše" jednog igrača — ne ubija, ali saznaje koga je taj igrač ciljao te noći (npr. koga je Vračara proveravala).',
  },
  {
    name: '🌫️ Mora',
    team: 'Sile Mraka',
    desc: 'Seda ljudima na grudi dok spavaju. Igrač kojeg Mora poseti ne može da priča tokom sutrašnjeg dana — glasa samo znakovima.',
  },
  {
    name: '🏚️ Čuvar doma (Senak)',
    team: 'Selo',
    desc: 'Duh pretka koji čuva kuću. Ako igrač koga čuva bude napadnut, ne može da ga spase — ali saznaje ko je tačno bio u napadačkoj ekipi.',
  },
  {
    name: '🌿 Biljarica',
    team: 'Selo',
    desc: 'Travarka sa dva napitka za celu igru: jedan leči od napada, jedan truje igrača za koga sumnja da je demon.',
  },
  {
    name: '🌊 Rusalka',
    team: 'Posebno',
    desc: 'Ako bude izglasana tokom dana, u reku povlači poslednju osobu koja je glasala za nju.',
  },
  {
    name: '🕊️ Suđenica Lada',
    team: 'Selo',
    desc: 'Boginja ljubavi i sloge. Jednom u igri može da prekine glasanje i proglasi primirje — tog dana niko ne biva obešen.',
  },
];

function plannedCards(): string {
  return PLANNED_ROLES.map(
    (r) =>
      '<div class="role planned"><div class="role-name">' +
      r.name +
      ' <span class="tag">' +
      r.team +
      '</span></div><p>' +
      r.desc +
      '</p></div>'
  ).join('\n');
}

function hintList(): string {
  return Object.values(GLUVO_DOBA_HINT_GROUPS)
    .map((g) => '<li>„' + g.text + '"</li>')
    .join('\n');
}

export const GLUVO_DOBA_PAGE_HTML: string = `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#F5EBE0">
<title>Gluvo doba — pravila igre</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Manrope','Segoe UI',system-ui,sans-serif;background:#F5EBE0;background-image:radial-gradient(760px 460px at 50% -8%,rgba(194,155,71,.18),transparent 62%);color:#2B2B2B;line-height:1.55;padding:2rem 1.25rem 4rem}
main{max-width:46rem;margin:0 auto;display:flex;flex-direction:column;gap:2rem}
h1{font-family:'Fredoka',sans-serif;font-weight:500;font-size:2.2rem;color:#1D3557}
h2{font-family:'Fredoka',sans-serif;font-weight:500;font-size:1.4rem;color:#1D3557;border-bottom:2px solid #C29B47;padding-bottom:0.3rem;margin-bottom:0.8rem}
h3{font-family:'Fredoka',sans-serif;font-weight:500;font-size:1.1rem;color:#8a6a23;margin:1rem 0 0.5rem}
p{margin-bottom:0.5rem}
.back{font-weight:700;color:#B89040;text-decoration:none}
.back:hover{color:#1D3557}
.eyebrow{font-family:'Fredoka',sans-serif;font-size:0.72rem;letter-spacing:0.28em;color:#B89040;text-transform:uppercase}
ol,ul{padding-left:1.4rem;margin-bottom:0.5rem}
li{margin-bottom:0.35rem}
table{width:100%;border-collapse:collapse;font-size:0.92rem}
th,td{text-align:left;padding:0.5rem 0.6rem;border:1px solid rgba(29,53,87,.18);vertical-align:top}
th{background:#EDE2D2;font-family:'Fredoka',sans-serif;font-weight:500;color:#1D3557}
.role{background:#FAF6F0;border:1px solid rgba(29,53,87,.14);border-radius:0.8rem;padding:0.8rem 1rem;margin-bottom:0.6rem}
.role p{margin:0.25rem 0 0;font-size:0.92rem;color:#4A4438}
.role-name{font-family:'Fredoka',sans-serif;font-weight:600;font-size:1.05rem}
.role.planned{opacity:0.85;border-style:dashed}
.tag{font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;background:#E6DCD2;border-radius:0.4rem;padding:0.1rem 0.45rem;color:#4A4438;vertical-align:middle}
.note{background:#EDE2D2;border-left:4px solid #C29B47;border-radius:0 0.6rem 0.6rem 0;padding:0.7rem 1rem;font-size:0.92rem}
.phase{font-weight:800;color:#1D3557}
</style>
</head>
<body>
<main>
<div>
<a class="back" href="/">← Igra Na Klik</a>
<div class="eyebrow" style="margin-top:1rem">Društvena dedukcija · 6–15 igrača</div>
<h1>🌙 Gluvo doba</h1>
<p>Slovenska varijanta igre „Mafija / Vukodlaci": TV je narator, telefoni nose tajne uloge.
Među seljanima se kriju <strong>Sile Mraka</strong> — noću haraju, danju glume nevine.
Selo pobeđuje kad razotkrije sav Mrak; Mrak pobeđuje kad ih bude koliko i ostalih.</p>
</div>

<section>
<h2>Tok igre</h2>
<ol>
<li><span class="phase">Podela uloga</span> — svaki telefon prikazuje tajnu ulogu. Sile Mraka se međusobno znaju.</li>
<li><span class="phase">Noć</span> — SVI igrači biraju metu na telefonu (ekrani izgledaju identično, pa niko sa strane ne zna ko ima moć).
Uloge rade prave radnje, a obični Domaćini šalju anoniman „šapat sumnje".
Noć se završava kad svi odigraju ili kad istekne vreme.</li>
<li><span class="phase">Zora</span> — TV objavljuje ko je stradao, zbir šapata i noćne događaje.</li>
<li><span class="phase">Rasprava</span> — priča se UŽIVO, naglas. TV drži tajmer (podesivo: 2–4 min).</li>
<li><span class="phase">Glasanje</span> — na telefonima: svi živi ili „Preskoči". Vešanje samo pri jasnoj većini
(jedinstven vrh sa više glasova od preskoka).</li>
<li><span class="phase">Presuda</span> — javni rezultat glasanja, pa nova noć — dok jedna strana ne pobedi.</li>
</ol>
<div class="note">💀 Eliminisani igrači ne sede besposleni: njihov telefon postaje duh-posmatrač koji vidi
<strong>sve uloge</strong> do kraja partije.</div>
</section>

<section>
<h2>Sastav po broju igrača</h2>
<table>
<tr><th>Grupa</th><th>Sile Mraka</th><th>Selo</th></tr>
<tr><td><strong>6–8</strong><br>Mala družina</td><td>2 Vukodlaka</td><td>Vračara, Zmaj + Domaćini<br><em>Čist duel — bez treće strane.</em></td></tr>
<tr><td><strong>9–12</strong><br>Srednja ekipa</td><td>2 Vukodlaka + Todorac <em>ili</em> Bauk</td><td>Vračara, Zmaj, Suđaja, Knez + Domaćini</td></tr>
<tr><td><strong>13–15</strong><br>Veliko selo</td><td>2 Vukodlaka + Todorac + Drekavac</td><td>Vračara, Zmaj, Suđaja, Knez, Zduhać, Raskovnik + Domaćini</td></tr>
</table>
<h3>Opciona pravila (bira domaćin igre pre početka)</h3>
<ul>
<li><strong>🕊️ Mirna prva noć</strong> — prve noći se Sile Mraka samo upoznaju, ne ubijaju.
Ostale uloge normalno koriste moći. Niko ne ispada pre nego što progovori!</li>
<li><strong>Otkrivanje pri smrti</strong> — šta selo saznaje o mrtvom igraču: punu <em>ulogu</em>,
samo <em>stranu</em> (Mrak / Selo / Neutralan) ili <em>ništa</em>.</li>
<li><strong>🌲 Neutralac</strong> — dodaje Lesnika (9–12) ili Moranu (13–15) umesto jednog Domaćina.</li>
<li><strong>🧚 Vila</strong> — zbunjivačica ulazi u igru umesto jednog Domaćina (9+).</li>
</ul>
</section>

<section>
<h2>Trenutne uloge</h2>
<h3 style="color:${TEAM_COLORS.vukodlaci}">${GLUVO_DOBA_TEAM_NAMES.vukodlaci}</h3>
${roleCards('vukodlaci')}
<h3 style="color:${TEAM_COLORS.selo}">${GLUVO_DOBA_TEAM_NAMES.selo}</h3>
${roleCards('selo')}
<h3 style="color:${TEAM_COLORS.neutralci}">Neutralni (igraju sami za sebe)</h3>
${roleCards('neutralci')}
<div class="note">🔮 <strong>Vračarine vizije su maglovite</strong> — svaka istraga vraća jednu od
ovih rečenica, a svaka pokriva više uloga (i Mrak i Selo):
<ul style="margin-top:0.4rem">${hintList()}</ul>
Pazite: Drekavac se namerno prikazuje kao miran seljanin.</div>
</section>

<section>
<h2>Planirane buduće uloge</h2>
<p>Ideje koje čekaju svoj red — još nisu u igri:</p>
${plannedCards()}
</section>

<p style="text-align:center"><a class="back" href="/">← Nazad na Igra Na Klik</a></p>
</main>
</body>
</html>`;
