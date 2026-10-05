/**
 * Game rules — single source for the public /uputstva hub (server) and the
 * in-app rules screens on the phone (controller). Serbian by design.
 *
 * `body` is trusted, author-written HTML. The optional structured fields
 * (`steps` / `points` / `notes`) render the phone detail screen as numbered
 * steps + point tiles; games without them fall back to `body`. `hint` is the
 * one-card tip shown the first time a device plays the game.
 */

export interface GameRuleEntry {
  emoji: string;
  /** Rules body as trusted, author-written HTML (Serbian). */
  body: string;
  requiresTv?: boolean;
  moreHref?: string;
  moreLabel?: string;
  /** Phone detail: the flow as numbered steps (plain text). */
  steps?: string[];
  /** Phone detail: point tiles — big value + what it is for. */
  points?: { value: string; label: string }[];
  /** Phone detail: special cases under the points. */
  notes?: string[];
  /** First-time tip: one headline + one sentence, shown once per device. */
  hint?: { title: string; text: string };
}

export const GAME_RULES: Record<string, GameRuleEntry> = {
  quiz: {
    hint: { title: 'Tapneš tačan što brže', text: 'Brži tačan odgovor nosi više poena. Svako pitanje vredi najviše 1000 poena.' },
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
    hint: { title: 'Otvori polje, pa pogađaj', text: 'Pogodak kolone nosi 300 i ostaješ na potezu; konačno rešenje nosi 1000.' },
    emoji: '🧩',
    body: `<p>TV „Slagalica" asocijacije: tabla ima <strong>4 kolone (A, B, C, D)</strong>, svaka sa 4 skrivena polja, i jedno <strong>konačno rešenje</strong> koje povezuje sva četiri rešenja kolona.</p>
<ul>
<li>Igrači se smenjuju na potezu. Na svom potezu <strong>otvoriš jedno polje</strong> (otkrije se pojam), pa možeš da <strong>pogodiš rešenje kolone</strong>, <strong>pokušaš konačno rešenje</strong> ili predaš potez.</li>
<li><strong>Tačno</strong> pogađanje nosi poene i <em>nastavljaš</em> potez; <strong>promašaj</strong> prepušta potez sledećem igraču. Svi vide šta je ukucano — i promašene odgovore, da se ne ponavljaju.</li>
<li>Kad su <strong>sva polja otvorena</strong>, svaki predat potez otkriva <strong>po jedno slovo</strong> konačnog rešenja. Ako bi se otkrilo i poslednje slovo, tabla se završava bez pobednika.</li>
<li>Poeni: rešenje kolone <strong>+300</strong>, konačno rešenje <strong>+1000</strong>.</li>
<li><strong>Klasik mod</strong>: polje se otvara tapom. <strong>Kviz mod</strong>: da otvoriš polje moraš tačno da odgovoriš na pitanje (a/b/c/d) — tačan odgovor je ujedno i pojam u polju.</li>
<li>Tabla se završava kad neko pogodi konačno rešenje; pobednik je igrač sa najviše poena.</li>
</ul>
<p class="tip">Domaćin bira mod (Klasik/Kviz) i paket slagalica na ekranu za izbor igre; paketi se prave u /admin editoru.</p>`,
  },
  'draw-guess': {
    hint: { title: 'Crtaj prstom, pogađaj kucanjem', text: 'Kad si na potezu, crtaš tajnu reč. Inače kucaš pogađanja — brže je više poena.' },
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
    hint: { title: 'Jedan od vas ne zna reč', text: 'Dodaj samo jedan potez na crtež — dovoljno da pokažeš da znaš, a da ne odaš reč.' },
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
    steps: [
      'TV pokaže pitanje sa nedostajućim odgovorom.',
      'Svako na telefonu upiše lažan, ali uverljiv odgovor.',
      'Prikažu se sve laži zajedno sa tačnim odgovorom; glasaš koji je pravi.',
    ],
    points: [
      { value: '500', label: 'ako pronađeš tačan odgovor' },
      { value: '100', label: 'za svakog ko nasedne na tvoju laž' },
    ],
    notes: [
      'Ako slučajno upišeš baš tačan odgovor — bonus je odmah tvoj i ne glasaš te runde.',
      'Ko ne napiše laž može da glasa, ali ne dobija poene za pogođenu istinu.',
    ],
    hint: { title: 'Laž mora da zvuči istinito', text: 'Upiši lažan odgovor u koji će drugi poverovati, pa pronađi pravi među ponuđenima.' },
    emoji: '🤥',
    body: `<p>Napiši uverljivu laž i prevari ostale.</p>
<ul>
<li>TV pokaže pitanje sa nedostajućim odgovorom.</li>
<li>Svako na telefonu upiše lažan, ali uverljiv odgovor.</li>
<li>Prikažu se sve laži zajedno sa tačnim odgovorom; glasaš koji je pravi.</li>
<li>500 poena ako pronađeš tačan odgovor, 100 za svakog ko nasedne na tvoju laž.</li>
<li>Ako slučajno upišeš baš tačan odgovor — bonus je odmah tvoj i ne glasaš te runde.</li>
<li>Ko ne napiše laž može da glasa, ali ne dobija poene za pogođenu istinu.</li>
</ul>`,
  },
  'ko-bi-pre': {
    hint: { title: 'Glasaj kao većina', text: 'Izaberi koga bi društvo izabralo — poeni idu onima koji pogode većinu.' },
    emoji: '🤔',
    body: `<p>Ko bi pre uradio nešto? Glasajte!</p>
<ul>
<li>TV postavi pitanje tipa „Ko bi pre…".</li>
<li>Svako glasa za jednog igrača iz društva.</li>
<li>Poeni onima koji pogode za koga je glasala većina.</li>
</ul>`,
  },
  'dve-istine-i-laz': {
    hint: { title: 'Sakrij laž među istinama', text: 'Upiši dve istine i jednu laž o sebi, pa pogađaj tuđe laži.' },
    emoji: '🎭',
    body: `<p>Dve istine i jedna laž o tebi.</p>
<ul>
<li>Svako upiše dve istinite i jednu lažnu tvrdnju o sebi.</li>
<li>Tvrdnje se pokažu izmešane; ostali pogađaju koja je laž.</li>
<li>Poeni za tačno pogađanje — i za uspešno obmanjivanje ostalih.</li>
</ul>`,
  },
  'slepi-telefoni': {
    hint: { title: 'Crtaj šta piše, piši šta vidiš', text: 'Fraza putuje od telefona do telefona — na kraju vidite kako se izvitoperila.' },
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
    hint: { title: 'Koliko ga poznaješ?', text: 'Pogodi šta je igrač iz runde odgovorio na lično pitanje.' },
    emoji: '🙋',
    body: `<p>Koliko dobro poznajete jedni druge?</p>
<ul>
<li>Svaka runda je o jednom igraču (subjektu).</li>
<li>Ostali pogađaju šta je taj igrač odgovorio na lično pitanje.</li>
<li>Poeni za pogađanje; subjekt dobija bonus kada ostali pogreše.</li>
</ul>`,
  },
  'spot-it': {
    hint: { title: 'Nađi isti simbol', text: 'Tvoja i centralna karta dele tačno jedan simbol — tapni ga prvi.' },
    emoji: '🔍',
    body: `<p>Pronađi zajednički simbol prvi.</p>
<ul>
<li>Tvoja karta i centralna karta dele tačno jedan isti simbol.</li>
<li>Prvi ko ga uoči i tapne osvaja kartu i otvara novu centralnu.</li>
<li>Pobednik je onaj ko sakupi najviše karata.</li>
</ul>`,
  },
  'bolji-zivot': {
    hint: { title: 'Pamti svoje karte', text: 'Na početku vidiš samo dve. Cilj je nositi što manje uroka — manji zbir pobeđuje.' },
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
    hint: { title: 'Šifra je jedna reč i broj', text: 'Špijun navodi tim na svoje reči — a ko dotakne ubicu, odmah gubi.' },
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
    hint: { title: 'Čuvaj svoju ulogu', text: 'Uloga je samo na tvom telefonu. Noću tiho biraš, danju pričate i glasate.' },
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
    hint: { title: 'Pitaj, ali ne odaj lokaciju', text: 'Svi znaju mesto osim špijuna. Kad posumnjaš, tapni „Sumnjiv mi je…".' },
    emoji: '🕵️',
    body: `<p>Svi znaju tajnu lokaciju — osim špijuna!</p>
<ul>
<li>Na telefonu svako vidi lokaciju i svoju ulogu; špijun vidi samo da je špijun.</li>
<li>Pričate uživo — postavljate jedni drugima pitanja o lokaciji. Špijun blefira, ostali paze da ne odaju previše.</li>
<li>Na telefonu pritisni „Sumnjiv mi je…" — kad se skupi dovoljno glasova, kreće odbrana pa tajno glasanje.</li>
<li>Istekne li vreme, špijun se otkriva i pogađa lokaciju sa javne liste.</li>
<li>Špijun sme i sam da prekine razgovor sa „Znam lokaciju!" — otkriva se svima i odmah pogađa.</li>
<li>Poeni: špijun pogodi lokaciju +300 (do +300 više ako je sam prekinuo razgovor, srazmerno preostalom vremenu) · ostali ga razotkriju +100 svima (pokretač optužbe +200) · promašen pogodak posle „Znam lokaciju!" nosi ostalima još +100 · pogrešna optužba: špijun +200.</li>
</ul>`,
  },
  'hot-potato': {
    hint: { title: 'Reci reč i prosledi', text: 'Tajmer je skriven — ko drži krompir kad pukne, ispada.' },
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
  slozilica: {
    hint: { title: 'Složi najdužu reč', text: 'Tapkaj pločice redom. Računa se samo tvoja najduža reč, pa slobodno probaj više.' },
    emoji: '🔤',
    body: `<p>Podeljena slova, do dva minuta — ko složi najdužu reč, nosi rundu.</p>
<ul>
<li>Svi igrači dobijaju <strong>ista slova</strong> i igraju istovremeno. Domaćin bira koliko ih je: <strong>7, 9 ili 11</strong> (podrazumevano 9 — tada je i najviši nivo bodova dostupan u većini rundi).</li>
<li>Reč se slaže <strong>tapkanjem pločica</strong> na telefonu, pa ne moraš da tražiš č, ć, š, ž na tastaturi. Svaka pločica se troši — ako je „a" podeljeno jednom, u reči sme biti samo jedno „a".</li>
<li>Šalji koliko god reči stigneš; <strong>računa se samo tvoja najduža</strong>, pa slobodno probaj.</li>
<li>Bodovi rastu strmo: 3 slova 30, 5 slova 110, 7 slova 300, 9 slova 650, a 11 slova čak 1200 poena.</li>
<li>Kad više nešto ne nalaziš, tapni <strong>„Gotov“</strong> — runda se zatvara čim to urade svi, pa se ne čeka pun tajmer. Možeš se i predomisliti dok runda traje.</li>
<li>Reč mora da postoji u srpskom rečniku — imena i skraćenice uglavnom ne prolaze.</li>
<li>Na kraju runde TV otkriva i <strong>najduže što je uopšte bilo moguće</strong> složiti.</li>
</ul>
<p class="tip">Igra ne zahteva TV — može i samo na telefonima.</p>`,
  },
  penali: {
    hint: { title: 'Drži, nišani, pusti', text: 'Šuter drži prst na golu i pušta kad je snaga prava; golman naslepo bira ugao.' },
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
  splav: {
    hint: { title: 'Levo voziš, desno NALET', text: 'Samo nalet može nekoga da izgura — i dok traje, ne možeš da skreneš.' },
    emoji: '🛶',
    requiresTv: true,
    body: `<p>Sumo na splavu: svi ste na istoj platformi, ona se stalno smanjuje i klizi, a poslednji koji ostane na njoj nosi rundu.</p>
<ul>
<li><strong>Telefon je džojstik:</strong> levom polovinom voziš (palac se osloni gde ti je zgodno), a desno je veliko dugme <strong>NALET</strong>.</li>
<li><strong>Nalet je jedini način da nekoga izguraš.</strong> Obično sudaranje samo odbija — pravi udarac ide samo iz naleta, koji se troši čim nekoga zakači i puni se oko <strong>2 sekunde</strong>. Prsten oko dugmeta pokazuje koliko je ostalo.</li>
<li>Dok si u naletu <strong>ne možeš da skreneš</strong> — zato je odluka <em>kada</em> ga potrošiti cela taktika.</li>
<li><strong>Splav se smanjuje i pomera</strong>, pa čekanje u sredini ne pomaže — sredina se seli, a ivica te stiže.</li>
<li><strong>Poeni:</strong> svako koga izguraš vredi <strong>120</strong>, plus poeni po plasmanu u rundi (svako preživljeno mesto <strong>40</strong>, a poslednji na splavu dobija još <strong>120</strong>).</li>
<li>Runda traje dok ne ostane jedan igrač — najviše oko 45 sekundi, jer se splav na kraju smanji do trunke.</li>
</ul>
<p class="tip">Broj rundi se bira pre početka. Igra traži TV — arena je na velikom ekranu, telefon je samo kontroler.</p>`,
  },
  puzla: {
    hint: { title: 'Prevuci komadić do suseda', text: 'Blizu pravog suseda sam se zalepi. Dva prsta zumiraju, tap okreće komadić.' },
    emoji: '🖼️',
    body: `<p>Slagalica od vaše slike: domaćin izabere fotografiju, igra je iseče na komadiće, a svi zajedno je slažete — svako sa svog telefona, istovremeno.</p>
<ul>
<li><strong>Slika:</strong> bira se pre početka, sa uređaja domaćina (TV-a ili telefona). Ne čuva se nigde — živi samo dok postoji soba.</li>
<li><strong>Komadići:</strong> 16, 36, 64 ili 100 (tačan broj zavisi od oblika slike). Na početku se nekoliko sekundi vidi cela slika, pa se komadići rasture po stolu oko rama.</li>
<li><strong>Na telefonu je ceo sto:</strong> prstom povuci komadić, jednim prstom po praznom stolu pomeraš pogled, a sa dva prsta zumiraš. Komadić koji neko drugi drži vidiš uokviren njegovom bojom i ne možeš ga uzeti.</li>
<li><strong>Spajanje:</strong> pusti komadić blizu njegovog suseda i sam će se zalepiti — grupa se dalje vuče kao celina. Ivični komadići (i sve što ih dodiruje) uglavljuju se u ram i više se ne pomeraju.</li>
<li><strong>Okrenuti komadići</strong> (ako ih domaćin uključi): komadići kreću okrenuti, a <strong>tap</strong> na komadić ga okreće za četvrt kruga. Spajaju se samo komadići okrenuti na istu stranu.</li>
<li><strong>Vreme:</strong> <em>na vreme</em> — sat odbrojava (od 4 minuta za 16 do 18 minuta za 100 komadića, duže sa okretanjem); <em>opušteno</em> — bez roka, sat samo meri koliko vam treba.</li>
<li><strong>Poeni:</strong> igra je timska, ali svaki spoj nosi poene onome ko ga je napravio — 5 po spojenoj ivici i još 10 za uglavljivanje u ram. Kad je slika gotova, svi dobijaju 100, a na vreme i do 200 za preostalo vreme.</li>
<li>Komadić koji niko ne pomera 10 sekundi, ili ga drži igrač kome se ugasio telefon, sam se spušta na sto.</li>
</ul>
<p class="tip">Radi i bez TV-a — ceo sto je ionako na svakom telefonu. Za 64 i 100 komadića zumirajte slobodno.</p>`,
  },
  osvajanje: {
    hint: { title: 'Tačan i brz bira prvi', text: 'Odgovorom osvajaš zemlju, a u duelu napadaš susede dok ne padne zamak.' },
    emoji: '🏰',
    body: `<p>Od dvoje do četvoro igrača, jedna mapa (za četvoro treba veća — bar dvanaest teritorija). Kroz pitanja se širi atar, a onda se navaljuje na susedne zamkove — dok ne ostane samo jedan.</p>
<ul>
<li><strong>Redosled:</strong> prvo ide pitanje sa brojem. Ko je najbliži, prvi bira mesto za svoj zamak.</li>
<li><strong>Zamak:</strong> bira se <strong>redom</strong> — prvi bira onaj sa najboljim uvodnim rezultatom. Svaki podignut zamak odmah vide svi, pa ko bira kasnije bira taktički: uz protivnika ili što dalje od njega.</li>
<li><strong>Osvajanje zemlje:</strong> svima stiže isto pitanje. Ko je tačan, uzima jednu slobodnu teritoriju — brži bira pre sporijeg. Ko promaši, u toj rundi ne dobija ništa.</li>
<li>Bira se <strong>samo uz svoju zemlju</strong>, da država raste u komadu. Ako ti je sve susedno već zauzeto, otvara se cela mapa.</li>
<li><strong>Duel:</strong> na potezu biraš susednu tuđu ili ničiju teritoriju. Ti i branilac dobijate isto pitanje, naslepo. Ako si jedini tačan — teritorija je tvoja; ako je samo branilac tačan — odbranio je i dobija <strong>100</strong> poena.</li>
<li><strong>Nerešeno</strong> (oba tačna ili oba netačna) rešava pitanje sa brojem: bliži pobeđuje, a na istom odstupanju odlučuje brzina. Ko ne odgovori, ne može dobiti.</li>
<li>Posle svakog pitanja se na istom ekranu vidi <strong>šta je ko odabrao</strong> i koji je odgovor bio tačan; tek onda se bira teritorija.</li>
<li><strong>Opsada:</strong> zamak ima <strong>tri zida</strong>. Svaki dobijen duel ruši jedan (+200 poena). Kad padne treći, napadač uzima zamak <em>i svu zemlju</em> branioca — a branilac ispada iz igre.</li>
<li><strong>Potez:</strong> napadi se smenjuju redom — svako napada jednom po rundi. Jedini izuzetak je <strong>opsada zamka</strong>: dok rušiš zidove, ostaješ na potezu i dobijaš novo pitanje na isti zamak, sve dok ne promašiš ili dok zamak ne padne. Svaka runda počinje od sledećeg igrača, pa isti ne napada prvi celu partiju. Pazi u dvoje: neprekinuta opsada (tri pogotka zaredom) obara zamak i završava partiju pre nego što protivnik uopšte dođe na potez.</li>
<li><strong>Trajanje:</strong> domaćin bira <em>do poslednjeg zamka</em> (rat ide dok jedan ne ostane sam) ili <em>6, 9 odnosno 12 rundi</em> — tada na kraju pobeđuje najveći zbir poena.</li>
<li><strong>Kraj:</strong> u modu „do poslednjeg zamka" igra traje dok ne ostane samo jedan zamak; ako se partija sasvim zaglavi, posle 25 rundi presuđuje zbir poena.</li>
<li><strong>Bodovi:</strong> zamak 1000, obična teritorija 200 (mapa nekoj može dati i više), uspešna odbrana 100, srušen zid 200.</li>
</ul>
<p class="tip">Mape se crtaju u administraciji, pa se pre početka bira koja se igra. Pitanja dolaze iz izabranih kviz paketa.</p>`,
  },
};
