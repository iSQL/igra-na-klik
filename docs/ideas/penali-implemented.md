# Penali — šta je izgradnja pokazala

Penali su implementirani (`penali`, 2–10 igrača, `supportsHostless: false`).
Ovaj fajl nije opis igre — pravila su na `/uputstva`, a arhitektura u
[CLAUDE.md](../../CLAUDE.md). Ovde stoji **ono što se saznalo tokom izrade**,
jer to direktno skraćuje posao za svaku sledeću akcionu/3D igru.

## Što je dokazano da radi

- **three.js se lepo izoluje.** Vanilla three (bez react-three-fiber) u
  [PitchScene.ts](../../packages/host/src/games/penali/PitchScene.ts), scena
  napravljena isključivo od primitiva — bez tekstura, loadera i asseta. Ceo
  three završi u lazy `penali` chunku (~524K raw / ~130K gzip), glavni bundle
  se ne menja. Isti recept važi za svaku sledeću 3D igru.
- **Scena se vozi sa tri poziva** iz React komponente: `reset()`, `playShot()`,
  `dispose()`. Nikakav React state ne ulazi u render petlju.
- **Slepa simultana odluka** (šuter nišani, golman bira ugao) staje u postojeći
  model: u fazi odluke u `hostData` idu samo boolean flagovi „ko je potvrdio",
  a izbori se objavljuju tek kad se pucanj razreši.
- **Diskretan unos po rundi** znači da latencija ne postoji kao problem —
  radi isto na LAN-u i na VPS-u.

## Zamke koje su se pojavile (i koje će se ponoviti)

- **`gameState` je nov objekat na svaki tick.** Efekti u host komponenti moraju
  da se vezuju za *ključ poteza* (`round:turnInRound`), a ne za identitet
  objekta — inače se `scene.reset()` poziva jednom u sekundi kroz celu fazu.
- **Balans se ne pogađa napamet.** Prve konstante su davale 16% odbrana —
  golman je bio čista lutrija 1/6. Simulacija od ~30k šuteva po skupu
  parametara je to pokazala i dovela do ~24% odbrana, gde šut po sredini vredi
  ~68 očekivanih poena naspram ~120 za šut uz stativu. **Za svaku igru sa
  slučajnošću: napiši skriptu koja odigra 30k poteza pre nego što proglasiš
  balans gotovim.**
- **Tajmaut je bio farmabilan.** Automatski šut igrača koji nije stigao da
  odigra padao je tačno u podrazumevani ugao golmana koji takođe nije odigrao —
  besplatnih 150 poena za nerad. Pravilo koje treba prekopirati: **ko nije
  odigrao, ne dobija poene**, a automatski potez mora biti nasumičan, ne fiksan.
- **Rotacija pri ispadanju igrača.** Kad se izbaci igrač na potezu, potez se
  pravi *ponovo na istom indeksu* — inkrementiranje preskače sledećeg igrača.

## Kako je testirano bez klikanja po UI-ju

Headless skripta preko `socket.io-client`: napravi sobu, ubaci tri igrača,
pokrene igru, odigra poteze i proveri faze, bodove i da igra završi. Ista
skripta je proverila i **anti-leak pravilo** — skenira svaki broadcast u fazi
odluke i traži `aim` / `keeperZone` / `landing`. Ovo je najbrži način da se
nova igra proveri i vredi ga ponoviti; kod stoji u istoriji sesije, ali se
lako napiše ponovo iz `events.ts`.

## Šest tačaka povezivanja

Potvrđeno na Penalima, redosled kojim je najlakše raditi: shared registry →
server modul → registracija u `setup.ts` → host komponenta + registry →
kontroler komponenta + registry → `GAME_RULES` u `uputstva-page.ts`.
Uz to, ako se dodaje nova `GameCategory`, TypeScript će sam naterati dopunu
`CATEGORY_COLOR` u oba game-select ekrana, a i18n traži **6 ključeva × 2 jezika**
(`name`, `description`, `blurb`, `rule1..3`) — bez njih kartica prikazuje
sirove ključeve.
