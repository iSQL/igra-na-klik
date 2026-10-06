# Tok igre — preostale izmene na TV-u

Redizajn „Tok igre” (Claude Design projekat *Igra na Klik redesign*, stranica
`Igra Na Klik - Tok igre.dc.html`, ekrani 1a–3d) urađen je na telefonu i na
serveru. TV (`packages/host`) je namerno ostavljen za kraj. Ovde je spisak
onoga što TV još nema, sa mestima u kodu gde se to radi.

Server za sve ovo već postoji — potrebne su samo izmene u `packages/host`.

## Već urađeno na TV-u

- Dugme **Pauza / Nastavi** pored „Završi igru” i overlay pauze sa 3-2-1
  ([GameScreen.tsx](../../packages/host/src/screens/GameScreen.tsx),
  `store/flowStore.ts`, događaj `game:flow`).
- „Bez rezultata” se poštuje: na `game:ended.skipResults` TV ide pravo u lobi
  ([App.tsx](../../packages/host/src/App.tsx)).
- Klijentski satovi stoje tokom pauze: tik-tak u Vrućem krompiru i sat u Puzli
  (`usePaused()`).
- Kraj probe u Gluvo doba bez pobednika piše „Kraj probe — uloge na sto!”
  umesto „Selo je pobedilo!”.

## Ostalo

### 1. Završi igru — izbor kao na telefonu (1e)
TV-ovo „Završi igru” uvek šalje `host:stop-game { showResults: true }`.
Treba potvrda sa tekstom „Igrano je {round} od {totalRounds}” (iz
`useFlowStore().flow`) i izborom **Pokaži tabelu / Bez rezultata**. Telefon:
[EndGameSheet.tsx](../../packages/controller/src/components/EndGameSheet.tsx).
Kad je igra prekinuta (`game:ended.stoppedEarly`), diplome/tabela na TV-u
treba da nose oznaku „Prekinuto posle 4/10” (`gameEnd.stoppedAfter`).

### 2. Proba — izbor pri pokretanju (3a)
TV-ov izbor igre i dalje ima stare prekidače `config.gluvoTutorial` /
`config.bzTutorial` / `config.spijunTutorial`
([host GameSelectScreen.tsx](../../packages/host/src/screens/GameSelectScreen.tsx)
~860/925/953, stanje u `store/newGamesConfigStore.ts`). Zameniti ih karticama
„🎓 Proba / ▶ Prava igra” za svaku igru sa `GAME_DEFINITIONS[id].tutorial`
(blurb + `~N min`), sa oznakom **PREPORUKA** i proba kao podrazumevanim
izborom kad većina povezanih igrača nema igru u `player.playedGames`. Logika i
izgled: [ProbaPicker.tsx](../../packages/controller/src/components/ProbaPicker.tsx)
(`probaRecommended`, `notPlayedCount`). Proveriti da TV-ov room store čuva
`playedGames` iz `player:joined` / `room:player-joined` i da ga dopisuje na
`game:ended` (telefon to radi u svom `App.tsx`).

### 3. Proba — domaćinovo dugme na TV-u (3c)
TV ima svoja tutorial dugmad: `TutorialNextButton` u
[GluvoDobaHost.tsx](../../packages/host/src/games/gluvo-doba/GluvoDobaHost.tsx)
(~175, labele ~233), [BoljiZivotHost.tsx](../../packages/host/src/games/bolji-zivot/BoljiZivotHost.tsx)
(~287, ~333, „Završi igru ▸” ~652) i Špijunov host. Dati im ime faze u koju
vode (`TUTORIAL_FLOW[gameId].nextLabel[phase]`, „Sledeća faza: Zora ▸”) i broj
„Odigralo je X od Y” iz `flow.collection` (samo broj — `doneIds` namerno ne
postoji za noć i glasanje). Rečenica za naglas (`readAloud`) može i na TV.

### 4. Proba — kraj na TV-u (3d)
U poslednjoj fazi probe `*:next-phase` više ne gasi igru nego postavlja
`data.tutorialDone = true`. Telefoni tada pokazuju „Spremni ste!”, a TV ostaje
na poslednjoj fazi (Gluvo `kraj`, Špijun `results`, Zavet `final-leaderboard`)
sa dugmetom koje više ništa vidljivo ne radi. Treba:
- kad je `tutorialDone`, TV prikazuje „Spremni ste!” sa rezimeom
  (`TUTORIAL_FLOW[gameId].recap`) — telefon:
  [kit/Tutorial.tsx](../../packages/controller/src/components/kit/Tutorial.tsx) `TutorialDone`;
- TV dugmad **▶ Igraj pravu partiju** / **Još jedna proba** →
  `host:restart-game { tutorial: false | true }` (server dozvoljava TV hostu);
- sakriti staro „Sledeća faza ▸” kad je `tutorialDone`.

### 5. Karta runde i na TV-u (2b)
Dizajn: zlatni međuekran „Runda 3 od 5” stoji 1,2 s **dok TV pokazuje isto**.
Telefon: [kit/RoundCard.tsx](../../packages/controller/src/components/kit/RoundCard.tsx),
uključen u Lažovu, Ko bi pre?, Špijunu, Složilici i Penalima. Na TV-u bez lične
linije, framer-motion (broj uskače 1.4 → 1), poštovati reduced motion.

### 6. Predaja vođenja sa TV-a (1b)
`host:transfer-remote-host { playerId }` već prihvata i TV host socket. TV
nema UI za to — npr. u spisku igrača u lobiju ili u meniju tokom igre.

### 7. (Opciono) „Čekamo…” na TV-u (1c)
TV već ima `WaitingChips` u Kvizu i Lažovu. Moglo bi generički iz
`flow.collection` za sve igre koje ga šalju, uz TV-ovo „Nastavi ▸”
(`host:flow-action { action: 'skip' }`) kad postoji `flow.skipLabel`.

## Provera

`npx tsx scripts/test-flow.mts` pokriva serverski deo (pauza, skip, ne čekaj,
predaja, prekid, proba → restart). TV delove proveriti ručno: TV tab
`:3001/host/` + 2–6 telefona `:3001/play/`, proba Gluvo doba (6 igrača) od
izbora do „Igraj pravu partiju”.
