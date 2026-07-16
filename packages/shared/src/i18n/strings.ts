import type { Language } from './types.js';
import { DEFAULT_LANGUAGE } from './types.js';

/**
 * Central translation dictionary. Flat dotted keys, one entry per language.
 *
 * Only the platform chrome and the three fully-translated games
 * (draw-guess, slepi-telefoni, spot-it) live here. The other six games'
 * in-game screens remain Serbian by design — but every game's
 * game-select card (`game.<id>.name` / `game.<id>.description`) is
 * translated so the lobby grid stays coherent in English.
 *
 * Interpolation: `{name}` / `{round}` placeholders are replaced by the
 * `params` passed to `translate()`.
 */
export const STRINGS: Record<Language, Record<string, string>> = {
  sr: {
    // --- common ----------------------------------------------------------
    'common.appName': 'Igra Na Klik',
    'common.back': 'Nazad',
    'common.cancel': 'Otkaži',
    'common.close': 'Zatvori',
    'common.remove': 'Ukloni',
    'common.send': 'Pošalji',
    'common.loading': 'Učitavanje...',
    'common.points': 'poena',
    'common.waitingForOthers': 'Čekamo ostale...',
    'common.returningToGameSelect': 'Vraćanje na izbor igre…',
    'common.finalPlace': 'Konačno mesto',
    'common.colorAria': 'Boja {color}',
    'common.player.one': 'igrač',
    'common.player.many': 'igrača',

    // --- host app status -------------------------------------------------
    'app.connecting': 'Povezivanje...',
    'app.creatingRoom': 'Pravim sobu...',

    // --- lobby -----------------------------------------------------------
    'lobby.players': 'Igrači',
    'lobby.you': 'TI',
    'lobby.waitingForPlayers': 'Čekamo igrače da se pridruže...',
    'lobby.holdsControlFromPhone': 'drži kontrolu sa telefona',
    'lobby.chooseGame': 'Izaberi igru',
    'lobby.needAtLeast': 'Treba najmanje {n} {noun}',
    'lobby.kickConfirm': 'Izbaci {name}?',
    'lobby.kick': 'Izbaci {name}',
    // controller lobby
    'lobby.changeAvatar': 'Promeni avatar',
    'lobby.kickAction': 'Izbaci',
    'lobby.room': 'Soba',
    'lobby.chooseGameArrow': 'Izaberi igru →',
    'lobby.playAgain': '🔁 Igraj ponovo: {name}',
    'lobby.releaseControl': 'Otpusti kontrolu',
    'lobby.claimControl': 'Preuzmi kontrolu',
    'lobby.holdsControl': 'drži kontrolu',
    'lobby.canStartFromPhone': 'Možeš pokrenuti igru sa telefona.',
    'lobby.waitingForHost': 'Čekamo da domaćin pokrene igru...',

    // --- avatar picker ---------------------------------------------------
    'avatar.color': 'Boja',
    'avatar.symbol': 'Simbol',
    'avatar.editProfile': 'Uredi profil',
    'avatar.name': 'Ime',
    'avatar.saveName': 'Sačuvaj',

    // --- game select -----------------------------------------------------
    'gameSelect.title': 'Izaberi igru',
    'gameSelect.backToLobby': 'Nazad u lobi',
    'gameSelect.backArrow': '← Nazad',
    'gameSelect.start': 'Pokreni',
    'gameSelect.needMore': 'Treba još {n} {noun}',
    'gameSelect.playerRange': '{min}-{max} igrača',
    'gameSelect.needsTv': 'Zahteva TV ekran',

    // --- in-game overlays ------------------------------------------------
    'overlay.endGame': 'Završi igru',
    'playerMenu.open': 'Meni igrača',
    'playerMenu.language': 'Jezik',
    'overlay.endingGame': 'Završavam…',
    'overlay.endingGameFull': 'Završavam igru…',
    'overlay.endGameConfirmTitle': 'Završiti igru?',
    'overlay.endGameConfirmBody':
      'Trenutna runda će biti prekinuta za sve igrače i vratićete se u lobi.',
    'overlay.end': 'Završi',

    // --- reconnect / kicked (controller) ---------------------------------
    'reconnect.reconnecting': 'Ponovno povezivanje...',
    'reconnect.wait': 'Sačekaj',
    'reconnect.gameEnded': 'Igra je završena',
    'reconnect.returningToLobby': 'Vraćamo se u lobi...',
    'gameEnd.placement': '{rank}. mesto · {points} poena',
    'kicked.ok': 'U redu',

    // --- leave room ------------------------------------------------------
    'leave.leaveRoom': 'Napusti sobu',
    'leave.confirmTitle': 'Napustiti sobu?',
    'leave.confirmBodyRemoteHost':
      'Ti držiš kontrolu — ako izađeš, soba će biti zatvorena i svi ostali igrači će biti izbačeni.',
    'leave.confirmBodyHostlessHost':
      'Ti držiš kontrolu — ako izađeš, kontrola prelazi na sledećeg igrača. Ako želiš da zatvoriš sobu za sve, koristi „Zatvori sobu".',
    'leave.confirmBody':
      'Ako izađeš tokom igre, prekinućeš trenutnu rundu za ostale igrače.',
    'leave.exit': 'Izađi',

    // --- lobby chat ------------------------------------------------------
    'chat.title': 'Ćaskanje',
    'chat.placeholder': 'Napiši poruku...',
    'chat.empty': 'Još nema poruka',
    'chat.send': 'Pošalji',

    // --- close room ------------------------------------------------------
    'closeRoom.button': 'Zatvori sobu',
    'closeRoom.confirmTitle': 'Zatvoriti sobu?',
    'closeRoom.confirmBody':
      'Soba će biti obrisana i svi igrači će biti izbačeni.',
    'closeRoom.confirm': 'Zatvori',

    // --- join screen -----------------------------------------------------
    'join.roomCode': 'Kod sobe',
    'join.yourName': 'Tvoje ime',
    'join.roomNotOpen': 'Soba još nije otvorena. Pričekaj host.',
    'join.enterName': 'Upiši svoje ime',
    'join.joining': 'Spajanje...',
    'join.enterGame': 'Uđi u igru',
    'join.home': '← Početna',
    'join.codeLabel': 'kod',
    'room.copyLink': '🔗 Kopiraj link',
    'room.copied': '✓ Kopirano',
    'join.or': 'ili',
    'join.createRoom': 'Napravi sobu',
    'join.creating': 'Kreiranje...',
    'join.activeRooms': 'Aktivne sobe',
    'join.inGame': 'Igra u toku',
    'join.full': 'Puna',
    'join.createRoomHint': 'Igra samo na telefonima — bez TV ekrana',
    'join.gameInProgress':
      'Igra je u toku — sačekaj da se završi, pa pokušaj ponovo.',
    'join.roomNotFound': 'Soba nije pronađena. Proveri kod.',
    'join.nameTaken': 'To ime je već zauzeto u ovoj sobi.',
    'join.roomFull': 'Soba je puna.',

    // --- leaderboard (shared host) ---------------------------------------
    'leaderboard.final': 'Konačni poredak',
    'leaderboard.standings': 'Rang lista',

    // --- import / config chrome ------------------------------------------
    'import.fileReadError': 'Greška pri čitanju fajla.',
    'import.invalidJson': 'Nevažeći JSON.',
    'import.choosePack': 'Izaberi paket…',
    'quizConfig.packs': 'Packovi pitanja',
    'quizConfig.types': 'Vrste pitanja',
    'quizConfig.selectAll': 'Sve',
    'quizConfig.selectNone': 'Ništa',
    'quizConfig.available': '{n} pitanja u izboru',
    'quizConfig.emptySelection': 'Izaberi bar jedan pack i jednu vrstu pitanja.',
    'quizType.obicno': 'Obično',
    'quizType.audio': 'Audio',
    'quizType.video': 'Video',
    'quizType.geo': 'Geo',
    'quizType.broj': 'Broj',
    'quizType.emoji': 'Emoji',
    'import.builtinPack': 'Ugrađeni paket',
    'import.builtinWords': 'Ugrađene reči',
    'import.loaded': 'Učitano',
    'import.questions': 'pitanja',
    'import.words': 'reči',
    'import.importQuestions': 'Uvezi pitanja',
    'import.importQuestionsFile': 'Uvezi pitanja iz fajla',
    'import.importWords': 'Uvezi reči',
    'import.fromFile': 'Iz fajla',
    'import.questionPack': 'Paket pitanja',

    // --- geo / slepi config ----------------------------------------------
    'config.predefined': 'Predefinisano',
    'config.playerPhotos': 'Slike igrača',
    'config.noPacks': 'Nema dostupnih paketa',
    'config.loadingPacks': 'Učitavanje paketa…',
    'config.photosPerPlayer': 'Slika po igraču',
    'config.rounds': 'Broj rundi',
    'config.questionPack': 'Paket pitanja',
    'config.builtInBank': 'Ugrađena pitanja',
    'config.drawTime': 'Vreme za crtanje',
    'config.minutes': '{n} min',
    'config.strokes': 'Poteza po igraču',
    'config.discussionSeconds': 'Rasprava (sekunde)',
    'config.gluvoDeathReveal': 'Otkrivanje pri smrti',
    'config.gluvoDeathReveal.role': 'Uloga',
    'config.gluvoDeathReveal.team': 'Strana',
    'config.gluvoDeathReveal.none': 'Ništa',
    'config.gluvoFirstNight': 'Mirna prva noć',
    'config.gluvoBajacica': 'Bajačica u igri',
    'config.bzTutorial': 'Tutorial mod',
    'config.bzTutorialHint':
      'Vođena partija za učenje: saveti i podsetnik pravila na telefonima, a faze pomera voditelj dugmetom umesto tajmera.',
    'config.gluvoTutorial': 'Tutorial mod',
    'config.gluvoTutorialHint':
      'Vođena partija za učenje: saveti, „?“ podsetnik uloga i objašnjenja na ekranima, a faze pomera voditelj dugmetom umesto tajmera.',
    'config.spijunPack': 'Lokacije',
    'config.spijunTutorial': 'Tutorial mod',
    'config.spijunTutorialHint':
      'Vođena partija za učenje: objašnjenja na ekranima, a faze pomera voditelj dugmetom umesto tajmera.',
    'config.gluvoMode': 'Mod (uloge)',
    'config.gluvoModeClassic': 'Klasik (ugrađeni balans)',
    'config.gluvoModeNote': 'Uloge dolaze iz izabranog moda — ostala pravila i dalje važe.',
    'config.tajniMode': 'Mod igre',
    'config.tajniMode.classic': 'Klasik',
    'config.tajniMode.duet': 'Duet',
    'config.tajniMode.coop': 'Kooperativni',
    'config.tajniModeHint.classic': 'Dva tima sa špijunima — najmanje 4 igrača.',
    'config.tajniModeHint.duet': 'Zajedno: svaka strana vidi svoj ključ, nađite 15 agenata za 9 poteza. Od 2 igrača.',
    'config.tajniModeHint.coop': 'Špijun + tim protiv table: nađite 9 agenata pre nego što potrošite 9 poena. Od 2 igrača.',
    'config.hotPotatoMode': 'Prosleđivanje',
    'config.hotPotatoMode.sequential': 'Sledeći po redu',
    'config.hotPotatoMode.choose': 'Biraš kome',
    'config.hotPotatoModeHint.sequential': 'Tap „Prosledi →" šalje bombu sledećem živom igraču u krugu.',
    'config.hotPotatoModeHint.choose': 'Sam biraš kom živom igraču dodaješ bombu.',
    // --- draw-guess ------------------------------------------------------
    'drawGuess.round': 'Runda {round}/{total}',
    'drawGuess.choosingWord': '{name} bira reč...',
    'drawGuess.turn': 'Potez {n}/{total}',
    'drawGuess.drawing': '{name} crta',
    'drawGuess.guessedCount': '{n}/{total} pogodilo',
    'drawGuess.letters': '{n} slova',
    'drawGuess.attempts': 'Pokušaji',
    'drawGuess.noAttempts': 'Još nema pokušaja...',
    'drawGuess.guessedIt': 'Pogodio/la!',
    'drawGuess.wordWas': 'Reč je bila',
    'drawGuess.yourPlace': 'Tvoje mesto',
    'drawGuess.chooseWord': 'Izaberi reč za crtanje',
    'drawGuess.correct': 'Tačno!',
    'drawGuess.guessPlaceholder': 'Upiši pokušaj...',
    'drawGuess.guess': 'Pogodi',
    'drawGuess.pencil': 'Olovka',
    'drawGuess.fill': 'Kanta',
    'drawGuess.thickness': 'Debljina {n}',
    'drawGuess.resetZoom': 'Reset zuma',
    'drawGuess.undo': 'Korak nazad',
    'drawGuess.clearAll': 'Obriši sve',
    'drawGuess.pickColor': 'Izaberi boju',
    'drawGuess.customColor': 'Prilagođena boja',

    // --- slepi telefoni --------------------------------------------------
    'slepi.gameOver': 'Kraj igre',
    'slepi.thanks': 'Hvala što ste igrali Slepe telefone!',
    'slepi.enterPromptTitle': 'Napišite početnu frazu',
    'slepi.enterPromptDesc':
      'Svako unosi svoju frazu koju će sledeći igrač pokušati da nacrta.',
    'slepi.wroteCount': '{n}/{total} napisalo',
    'slepi.roundsWarning':
      '⚠️ Sa {n} igrača ovoliko rundi znači da isti igrači obrađuju tvoj lanac više puta i sadržaj ti se vraća. Preporuka: 1 runda.',
    'slepi.step': 'Korak {n}/{total}',
    'slepi.everyoneDraws': 'Svi crtaju',
    'slepi.everyoneGuesses': 'Svi pogađaju',
    'slepi.drawDesc':
      'Svako dobije tuđu frazu i pokušava da je nacrta — bez pogleda u druge lance!',
    'slepi.guessDesc':
      'Svako dobije tuđi crtež i piše šta misli da je prikazano.',
    'slepi.finishedCount': '{n}/{total} završilo',
    'slepi.chain': 'Lanac {n}/{total}',
    'slepi.drew': 'nacrtao',
    'slepi.wrote': 'napisao',
    'slepi.guessed': 'pogodio',
    'slepi.finishGame': 'Završi igru →',
    'slepi.nextChain': 'Sledeći lanac →',
    'slepi.seeBigScreen': 'Pogledaj veliki ekran za rezultate',
    'slepi.revealingOnScreen': 'Otkriva se na velikom ekranu!',
    'slepi.drawingSent': 'Crtež poslat — čekamo ostale...',
    'slepi.guessSent': 'Pogodak poslat — čekamo ostale...',
    'slepi.spectating': 'Samo posmatraš...',
    'slepi.yourControl': '🎮 Tvoja kontrola',
    'slepi.revealOnScreen': 'Otkrivanje na velikom ekranu',
    'slepi.writePrompt': 'Napiši frazu',
    'slepi.nextPlayerDraws': 'Sledeći igrač će pokušati da je nacrta!',
    'slepi.promptPlaceholder': 'npr. Pingvin jede sladoled',
    'slepi.draw': 'Nacrtaj',
    'slepi.done': 'Gotovo',
    'slepi.whatDoYouSee': 'Šta vidiš?',
    'slepi.guessPlaceholder': 'Upiši šta misliš da je...',

    // --- spot it ---------------------------------------------------------
    'spotIt.round': 'Runda {n} / {total}',
    'spotIt.roundShort': 'Runda {n}',
    'spotIt.getReady': 'Spremi se…',
    'spotIt.findSymbol': 'Pronađi simbol koji se ponavlja na tvojoj karti!',
    'spotIt.triedCount': '{n} / {total} pokušalo',
    'spotIt.nobodyFound': 'Niko nije pronašao! ⏱️',
    'spotIt.wellDone': 'Bravo!',
    'spotIt.waitForOthers': 'Čekaj druge…',
    'spotIt.findPair': 'Pronađi par',
    'spotIt.yourCard': 'Tvoja karta',
    'spotIt.pointsWon': '+{n} poena!',
    'spotIt.zeroPoints': '0 poena',
    'spotIt.winner': 'Pobedio: {name}',
    'spotIt.standings': 'Trenutni poredak',

    // --- game names / descriptions (all nine) ----------------------------
    'game.quiz.name': 'Kviz',
    'game.quiz.description':
      'Pitanja na vreme — obična, sa slikom, mapom, brojevima, pesmom, snimkom ili emoji zagonetkom. Najbliži i najbrži nosi poene!',
    'game.draw-guess.name': 'Crtaj i pogodi',
    'game.draw-guess.description': 'Crtajte redom — ostali pogađaju reč!',
    'game.fake-artist.name': 'Lažni umetnik',
    'game.fake-artist.description':
      'Svi crtaju istu reč po jedan potez — osim uljeza koji je ne zna. Pronađite lažnjaka!',
    'game.fibbage.name': 'Lažov',
    'game.fibbage.description':
      'Napiši lažan odgovor, pronađi pravi, prevari ostale!',
    'game.ko-bi-pre.name': 'Ko bi pre?',
    'game.ko-bi-pre.description':
      'Glasajte ko bi pre uradio nešto — poeni onima koji pogode većinu!',
    'game.dve-istine-i-laz.name': 'Dve istine i laž',
    'game.dve-istine-i-laz.description':
      'Svako napiše dve istine i jednu laž o sebi — ostali pogađaju šta je laž!',
    'game.slepi-telefoni.name': 'Slepi telefoni',
    'game.slepi-telefoni.description':
      'Napiši frazu, sledeći je crta, zatim sledeći pogađa — pogledajte kako se rečenica izvitoperi!',
    'game.ko-sam-ja.name': 'Ko sam ja?',
    'game.ko-sam-ja.description':
      'Lična pitanja o igračima — koliko dobro poznajete jedni druge?',
    'game.spot-it.name': 'Pronađi par',
    'game.spot-it.description':
      'Tvoja karta i centralna karta dele tačno jedan simbol — pronađi ga prvi!',
    'game.tajni-agenti.name': 'Tajni agenti',
    'game.tajni-agenti.description':
      'Špijun daje šifru — pogađaj reči, ali pazi na ubicu! Klasik, Duet ili kooperativni mod — može i sa 2 igrača.',
    'game.gluvo-doba.name': 'Gluvo doba',
    'game.gluvo-doba.description':
      'Vukodlaci noću haraju selom — otkrijte ih pre nego što vas nestane!',
    'game.bolji-zivot.name': 'Zavet',
    'game.bolji-zivot.description':
      'Kartaška igra pamćenja — 4 skrivene karte, menjaj ih, špijuniraj i vikni "Zavet!" kad nosiš najmanje uroka!',
    'game.spijun.name': 'Špijun',
    'game.spijun.description':
      'Svi znaju tajnu lokaciju — osim špijuna! Ispitujte se, otkrijte uljeza pre nego što on pogodi gde ste.',
    'game.hot-potato.name': 'Vruć krompir',
    'game.hot-potato.description':
      'Bomba sa skrivenim tajmerom kruži — kaži reč iz kategorije i prosledi. Kod koga pukne, ispada!',
    // --- game-select cards: tags, short blurbs, "how to play" -------------
    'gameSelect.howToPlay': 'Kako se igra →',
    'gameSelect.howToPlayLabel': 'Kako se igra',
    'gameSelect.noConfig': 'Nema dodatnih podešavanja — samo pokreni ✨',
    'gameSelect.filterAll': 'Sve',
    'gameSelect.noGamesForFilter': 'Nema igara za izabrane filtere.',
    'gameTag.quiz': 'Kviz',
    'gameTag.drawing': 'Crtanje',
    'gameTag.drawing-bluff': 'Crtanje · Blef',
    'gameTag.bluff': 'Blef',
    'gameTag.party': 'Društvena',
    'gameTag.speed': 'Brzina',
    'gameTag.team': 'Timska',
    'gameTag.cards': 'Kartaška',

    'game.quiz.blurb': 'Pitanja na vreme — najbrži nosi poene.',
    'game.quiz.rule1':
      'Pitanja se prikazuju na vreme — brži tačan odgovor nosi više poena.',
    'game.quiz.rule2': 'Tipovi: obična, sa slikom, mapa, broj, pesma i video.',
    'game.quiz.rule3': 'Posle svake runde ide animirana tabela rezultata.',
    'game.draw-guess.blurb': 'Crtaj reč — ostali je pogađaju.',
    'game.draw-guess.rule1':
      'Igrači redom crtaju zadatu reč, ostali kucaju pogađanja.',
    'game.draw-guess.rule2':
      'Brže pogađanje = više poena; crtač dobija poene po svakom pogotku.',
    'game.draw-guess.rule3': 'Vremenom se otkrivaju slova kao pomoć.',
    'game.fake-artist.blurb': 'Nađi uljeza koji ne zna reč.',
    'game.fake-artist.rule1':
      'Svi crtaju istu reč po jedan potez — osim uljeza.',
    'game.fake-artist.rule2': 'Posle crtanja glasate ko je lažni umetnik.',
    'game.fake-artist.rule3':
      'Uljez pobeđuje ako ostane neotkriven ili pogodi reč.',
    'game.fibbage.blurb': 'Napiši lažan odgovor, prevari ekipu.',
    'game.fibbage.rule1': 'Napišite ubedljiv lažan odgovor na pitanje.',
    'game.fibbage.rule2':
      '+500 za pronalazak istine, +100 za svakog koga prevarite.',
    'game.fibbage.rule3': 'Ne možete glasati za sopstveni odgovor.',
    'game.ko-bi-pre.blurb': 'Ko bi pre uradio nešto?',
    'game.ko-bi-pre.rule1': 'Za svako pitanje glasate ko bi pre nešto uradio.',
    'game.ko-bi-pre.rule2': 'Poeni onima koji pogode odgovor većine.',
    'game.ko-bi-pre.rule3': 'Brza, lagana društvena igra.',
    'game.dve-istine-i-laz.blurb': 'Dve istine i jedna laž.',
    'game.dve-istine-i-laz.rule1': 'Svako napiše dve istine i jednu laž o sebi.',
    'game.dve-istine-i-laz.rule2': 'Ostali pogađaju koja tvrdnja je laž.',
    'game.dve-istine-i-laz.rule3': 'Poeni za tačno pogađanje i za dobru laž.',
    'game.slepi-telefoni.blurb': 'Fraza koja se izvitoperi.',
    'game.slepi-telefoni.rule1':
      'Napišete frazu; sledeći je crta; naredni pogađa nacrtano.',
    'game.slepi-telefoni.rule2': 'Lanac se okreće u krug kroz sve igrače.',
    'game.slepi-telefoni.rule3':
      'Na kraju gledate sve lance i glasate za najsmešniji.',
    'game.ko-sam-ja.blurb': 'Koliko se dobro poznajete?',
    'game.ko-sam-ja.rule1':
      'Lično pitanje o jednom igraču — on tajno odgovara.',
    'game.ko-sam-ja.rule2': 'Ostali pogađaju šta je izabrao.',
    'game.ko-sam-ja.rule3': 'Igrač dobija poene kad ga niko ne pogodi.',
    'game.spot-it.blurb': 'Nađi isti simbol prvi.',
    'game.spot-it.rule1':
      'Tvoja i centralna karta dele tačno jedan isti simbol.',
    'game.spot-it.rule2': 'Prvi ko ga pronađe i tapne osvaja kartu.',
    'game.spot-it.rule3': 'Najviše skupljenih karata na kraju pobeđuje.',
    'game.gluvo-doba.blurb': 'Otkrij vukodlake pre zore.',
    'game.gluvo-doba.rule1':
      'Vukodlaci noću biraju žrtvu; selo danju glasa koga da protera.',
    'game.gluvo-doba.rule2': 'Posebne uloge imaju moći (vidar, vidovnjak…).',
    'game.gluvo-doba.rule3': 'Selo pobeđuje kad otkrije sve vukove.',
    'game.bolji-zivot.blurb': 'Kartaška igra pamćenja.',
    'game.bolji-zivot.rule1':
      'Imaš 4 skrivene karte — cilj je najmanji zbir uroka.',
    'game.bolji-zivot.rule2':
      'Menjaj karte, špijuniraj protivnike, pamti šta je gde.',
    'game.bolji-zivot.rule3': 'Vikni „Zavet!" kad misliš da si najniži.',
    'game.tajni-agenti.blurb': 'Špijun daje šifru, čuvaj se ubice.',
    'game.tajni-agenti.rule1': 'Špijun daje šifru: jedna reč + broj.',
    'game.tajni-agenti.rule2':
      'Tim pogađa svoje reči na tabli, ali pazi na ubicu.',
    'game.tajni-agenti.rule3': 'Modovi: Klasik (2 tima), Duet i kooperativni.',
    'game.spijun.blurb': 'Otkrij uljeza među vama.',
    'game.spijun.rule1': 'Svi znaju tajnu lokaciju — osim špijuna.',
    'game.spijun.rule2':
      'Ispitujte se da otkrijete uljeza; špijun pokušava da pogodi lokaciju.',
    'game.spijun.rule3': 'Glasanjem otkrivate ko je špijun.',
    'game.hot-potato.blurb': 'Prosledi bombu pre eksplozije.',
    'game.hot-potato.rule1': 'Bomba sa skrivenim tajmerom kruži među igračima.',
    'game.hot-potato.rule2': 'Kaži reč iz zadate kategorije i prosledi dalje.',
    'game.hot-potato.rule3': 'Kod koga „pukne" — ispada iz igre.',
  },

  en: {
    // --- common ----------------------------------------------------------
    'common.appName': 'Igra Na Klik',
    'common.back': 'Back',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.remove': 'Remove',
    'common.send': 'Send',
    'common.loading': 'Loading...',
    'common.points': 'points',
    'common.waitingForOthers': 'Waiting for others...',
    'common.returningToGameSelect': 'Returning to game selection…',
    'common.finalPlace': 'Final place',
    'common.colorAria': 'Color {color}',
    'common.player.one': 'player',
    'common.player.many': 'players',

    // --- host app status -------------------------------------------------
    'app.connecting': 'Connecting...',
    'app.creatingRoom': 'Creating room...',

    // --- lobby -----------------------------------------------------------
    'lobby.players': 'Players',
    'lobby.you': 'YOU',
    'lobby.waitingForPlayers': 'Waiting for players to join...',
    'lobby.holdsControlFromPhone': 'is in control from their phone',
    'lobby.chooseGame': 'Choose a game',
    'lobby.needAtLeast': 'Need at least {n} {noun}',
    'lobby.kickConfirm': 'Kick {name}?',
    'lobby.kick': 'Kick {name}',
    // controller lobby
    'lobby.changeAvatar': 'Change avatar',
    'lobby.kickAction': 'Kick',
    'lobby.room': 'Room',
    'lobby.chooseGameArrow': 'Choose a game →',
    'lobby.playAgain': '🔁 Play again: {name}',
    'lobby.releaseControl': 'Release control',
    'lobby.claimControl': 'Take control',
    'lobby.holdsControl': 'is in control',
    'lobby.canStartFromPhone': 'You can start a game from your phone.',
    'lobby.waitingForHost': 'Waiting for the host to start a game...',

    // --- avatar picker ---------------------------------------------------
    'avatar.color': 'Color',
    'avatar.symbol': 'Symbol',
    'avatar.editProfile': 'Edit profile',
    'avatar.name': 'Name',
    'avatar.saveName': 'Save',

    // --- game select -----------------------------------------------------
    'gameSelect.title': 'Choose a game',
    'gameSelect.backToLobby': 'Back to lobby',
    'gameSelect.backArrow': '← Back',
    'gameSelect.start': 'Start',
    'gameSelect.needMore': 'Need {n} more {noun}',
    'gameSelect.playerRange': '{min}-{max} players',
    'gameSelect.needsTv': 'Requires a TV screen',

    // --- in-game overlays ------------------------------------------------
    'overlay.endGame': 'End game',
    'playerMenu.open': 'Player menu',
    'playerMenu.language': 'Language',
    'overlay.endingGame': 'Ending…',
    'overlay.endingGameFull': 'Ending game…',
    'overlay.endGameConfirmTitle': 'End the game?',
    'overlay.endGameConfirmBody':
      'The current round will be cut short for all players and you will return to the lobby.',
    'overlay.end': 'End',

    // --- reconnect / kicked (controller) ---------------------------------
    'reconnect.reconnecting': 'Reconnecting...',
    'reconnect.wait': 'Please wait',
    'reconnect.gameEnded': 'The game has ended',
    'reconnect.returningToLobby': 'Returning to the lobby...',
    'gameEnd.placement': 'Place {rank} · {points} points',
    'kicked.ok': 'OK',

    // --- leave room ------------------------------------------------------
    'leave.leaveRoom': 'Leave room',
    'leave.confirmTitle': 'Leave the room?',
    'leave.confirmBodyRemoteHost':
      'You are in control — if you leave, the room will be closed and all other players will be removed.',
    'leave.confirmBodyHostlessHost':
      'You are in control — if you leave, control passes to the next player. To close the room for everyone, use "Close room".',
    'leave.confirmBody':
      'If you leave during a game, you will cut the current round short for the other players.',
    'leave.exit': 'Leave',

    // --- lobby chat ------------------------------------------------------
    'chat.title': 'Chat',
    'chat.placeholder': 'Type a message...',
    'chat.empty': 'No messages yet',
    'chat.send': 'Send',

    // --- close room ------------------------------------------------------
    'closeRoom.button': 'Close room',
    'closeRoom.confirmTitle': 'Close the room?',
    'closeRoom.confirmBody':
      'The room will be deleted and all players will be removed.',
    'closeRoom.confirm': 'Close',

    // --- join screen -----------------------------------------------------
    'join.roomCode': 'Room code',
    'join.yourName': 'Your name',
    'join.roomNotOpen': 'The room is not open yet. Wait for the host.',
    'join.enterName': 'Enter your name',
    'join.joining': 'Joining...',
    'join.enterGame': 'Join the game',
    'join.home': '← Home',
    'join.codeLabel': 'code',
    'room.copyLink': '🔗 Copy link',
    'room.copied': '✓ Copied',
    'join.or': 'or',
    'join.createRoom': 'Create a room',
    'join.creating': 'Creating...',
    'join.activeRooms': 'Active rooms',
    'join.inGame': 'Game in progress',
    'join.full': 'Full',
    'join.createRoomHint': 'Play on phones only — no TV screen',
    'join.gameInProgress':
      'A game is in progress — wait for it to finish, then try again.',
    'join.roomNotFound': 'Room not found. Check the code.',
    'join.nameTaken': 'That name is already taken in this room.',
    'join.roomFull': 'The room is full.',

    // --- leaderboard (shared host) ---------------------------------------
    'leaderboard.final': 'Final standings',
    'leaderboard.standings': 'Standings',

    // --- import / config chrome ------------------------------------------
    'import.fileReadError': 'Error reading file.',
    'import.invalidJson': 'Invalid JSON.',
    'import.choosePack': 'Choose a pack…',
    'quizConfig.packs': 'Question packs',
    'quizConfig.types': 'Question types',
    'quizConfig.selectAll': 'All',
    'quizConfig.selectNone': 'None',
    'quizConfig.available': '{n} questions selected',
    'quizConfig.emptySelection': 'Pick at least one pack and one question type.',
    'quizType.obicno': 'Classic',
    'quizType.audio': 'Audio',
    'quizType.video': 'Video',
    'quizType.geo': 'Geo',
    'quizType.broj': 'Number',
    'quizType.emoji': 'Emoji',
    'import.builtinPack': 'Built-in pack',
    'import.builtinWords': 'Built-in words',
    'import.loaded': 'Loaded',
    'import.questions': 'questions',
    'import.words': 'words',
    'import.importQuestions': 'Import questions',
    'import.importQuestionsFile': 'Import questions from file',
    'import.importWords': 'Import words',
    'import.fromFile': 'From file',
    'import.questionPack': 'Question pack',

    // --- geo / slepi config ----------------------------------------------
    'config.predefined': 'Predefined',
    'config.playerPhotos': 'Player photos',
    'config.noPacks': 'No packs available',
    'config.loadingPacks': 'Loading packs…',
    'config.photosPerPlayer': 'Photos per player',
    'config.rounds': 'Number of rounds',
    'config.questionPack': 'Question pack',
    'config.builtInBank': 'Built-in questions',
    'config.drawTime': 'Drawing time',
    'config.minutes': '{n} min',
    'config.strokes': 'Strokes per player',
    'config.discussionSeconds': 'Discussion (seconds)',
    'config.gluvoDeathReveal': 'Death reveal',
    'config.gluvoDeathReveal.role': 'Role',
    'config.gluvoDeathReveal.team': 'Side',
    'config.gluvoDeathReveal.none': 'Nothing',
    'config.gluvoFirstNight': 'Peaceful first night',
    'config.gluvoBajacica': 'Bajačica in play',
    'config.bzTutorial': 'Tutorial mode',
    'config.bzTutorialHint':
      'Guided game for learning: tips and a rules sheet on the phones, and the moderator advances phases with a button instead of timers.',
    'config.gluvoTutorial': 'Tutorial mode',
    'config.gluvoTutorialHint':
      'Guided game for learning: tips, the "?" roles sheet and on-screen explainers, and the moderator advances phases with a button instead of timers.',
    'config.spijunPack': 'Locations',
    'config.spijunTutorial': 'Tutorial mode',
    'config.spijunTutorialHint':
      'Guided game for learning: on-screen explainers, and the moderator advances phases with a button instead of timers.',
    'config.gluvoMode': 'Mode (roles)',
    'config.gluvoModeClassic': 'Classic (built-in balance)',
    'config.gluvoModeNote': 'Roles come from the selected mode — other rules still apply.',
    'config.tajniMode': 'Game mode',
    'config.tajniMode.classic': 'Classic',
    'config.tajniMode.duet': 'Duet',
    'config.tajniMode.coop': 'Co-op',
    'config.tajniModeHint.classic': 'Two teams with spymasters — at least 4 players.',
    'config.tajniModeHint.duet': 'Together: each side sees its own key — find 15 agents in 9 turns. From 2 players.',
    'config.tajniModeHint.coop': 'Spymaster + team vs the board: find 9 agents before 9 points run out. From 2 players.',
    'config.hotPotatoMode': 'Passing',
    'config.hotPotatoMode.sequential': 'Next in order',
    'config.hotPotatoMode.choose': 'Pick who',
    'config.hotPotatoModeHint.sequential': 'Tap "Pass →" to send the bomb to the next living player in the circle.',
    'config.hotPotatoModeHint.choose': 'You choose which living player gets the bomb.',
    // --- draw-guess ------------------------------------------------------
    'drawGuess.round': 'Round {round}/{total}',
    'drawGuess.choosingWord': '{name} is choosing a word...',
    'drawGuess.turn': 'Turn {n}/{total}',
    'drawGuess.drawing': '{name} is drawing',
    'drawGuess.guessedCount': '{n}/{total} guessed',
    'drawGuess.letters': '{n} letters',
    'drawGuess.attempts': 'Guesses',
    'drawGuess.noAttempts': 'No guesses yet...',
    'drawGuess.guessedIt': 'Guessed it!',
    'drawGuess.wordWas': 'The word was',
    'drawGuess.yourPlace': 'Your place',
    'drawGuess.chooseWord': 'Choose a word to draw',
    'drawGuess.correct': 'Correct!',
    'drawGuess.guessPlaceholder': 'Type your guess...',
    'drawGuess.guess': 'Guess',
    'drawGuess.pencil': 'Pencil',
    'drawGuess.fill': 'Fill',
    'drawGuess.thickness': 'Thickness {n}',
    'drawGuess.resetZoom': 'Reset zoom',
    'drawGuess.undo': 'Undo',
    'drawGuess.clearAll': 'Clear all',
    'drawGuess.pickColor': 'Pick colour',
    'drawGuess.customColor': 'Custom colour',

    // --- slepi telefoni --------------------------------------------------
    'slepi.gameOver': 'Game over',
    'slepi.thanks': 'Thanks for playing Blind Telephone!',
    'slepi.enterPromptTitle': 'Write a starting phrase',
    'slepi.enterPromptDesc':
      'Everyone writes a phrase that the next player will try to draw.',
    'slepi.wroteCount': '{n}/{total} wrote',
    'slepi.roundsWarning':
      '⚠️ With {n} players this many rounds means the same players work your chain more than once and your content loops back. Recommended: 1 round.',
    'slepi.step': 'Step {n}/{total}',
    'slepi.everyoneDraws': 'Everyone draws',
    'slepi.everyoneGuesses': 'Everyone guesses',
    'slepi.drawDesc':
      'Everyone gets someone else’s phrase and tries to draw it — no peeking at the other chains!',
    'slepi.guessDesc':
      'Everyone gets someone else’s drawing and writes down what they think it shows.',
    'slepi.finishedCount': '{n}/{total} finished',
    'slepi.chain': 'Chain {n}/{total}',
    'slepi.drew': 'drew',
    'slepi.wrote': 'wrote',
    'slepi.guessed': 'guessed',
    'slepi.finishGame': 'Finish game →',
    'slepi.nextChain': 'Next chain →',
    'slepi.seeBigScreen': 'Look at the big screen for the results',
    'slepi.revealingOnScreen': 'Revealing on the big screen!',
    'slepi.drawingSent': 'Drawing sent — waiting for others...',
    'slepi.guessSent': 'Guess sent — waiting for others...',
    'slepi.spectating': 'Just spectating...',
    'slepi.yourControl': '🎮 Your control',
    'slepi.revealOnScreen': 'Revealing on the big screen',
    'slepi.writePrompt': 'Write a phrase',
    'slepi.nextPlayerDraws': 'The next player will try to draw it!',
    'slepi.promptPlaceholder': 'e.g. A penguin eating ice cream',
    'slepi.draw': 'Draw',
    'slepi.done': 'Done',
    'slepi.whatDoYouSee': 'What do you see?',
    'slepi.guessPlaceholder': 'Write what you think it is...',

    // --- spot it ---------------------------------------------------------
    'spotIt.round': 'Round {n} / {total}',
    'spotIt.roundShort': 'Round {n}',
    'spotIt.getReady': 'Get ready…',
    'spotIt.findSymbol': 'Find the symbol that also appears on your card!',
    'spotIt.triedCount': '{n} / {total} tried',
    'spotIt.nobodyFound': 'Nobody found it! ⏱️',
    'spotIt.wellDone': 'Well done!',
    'spotIt.waitForOthers': 'Wait for the others…',
    'spotIt.findPair': 'Find the pair',
    'spotIt.yourCard': 'Your card',
    'spotIt.pointsWon': '+{n} points!',
    'spotIt.zeroPoints': '0 points',
    'spotIt.winner': 'Winner: {name}',
    'spotIt.standings': 'Standings',

    // --- game names / descriptions (all nine) ----------------------------
    'game.quiz.name': 'Quiz',
    'game.quiz.description':
      'Timed questions — classic, picture, map-pin, number, song, video clip or emoji riddle. Closest and fastest scores the most!',
    'game.fake-artist.name': 'Fake Artist',
    'game.fake-artist.description':
      'Everyone draws the same word one stroke at a time — except the impostor who does not know it. Find the fake!',
    'game.draw-guess.name': 'Draw & Guess',
    'game.draw-guess.description':
      'Take turns drawing — everyone else guesses the word!',
    'game.ko-bi-pre.name': 'Who Would...?',
    'game.ko-bi-pre.description':
      'Vote for who would do something — points for matching the crowd!',
    'game.dve-istine-i-laz.name': 'Two Truths & a Lie',
    'game.dve-istine-i-laz.description':
      'Everyone writes two truths and one lie about themselves — the rest guess the lie!',
    'game.fibbage.name': 'Liar',
    'game.fibbage.description':
      'Write a fake answer, find the real one, fool everyone else!',
    'game.slepi-telefoni.name': 'Blind Telephone',
    'game.slepi-telefoni.description':
      'Write a phrase, the next person draws it, then someone guesses — watch the sentence mutate!',
    'game.ko-sam-ja.name': 'Who Am I?',
    'game.ko-sam-ja.description':
      'Personal questions about the players — how well do you know each other?',
    'game.spot-it.name': 'Spot It',
    'game.spot-it.description':
      'Your card and the center card share exactly one symbol — spot it first!',
    'game.tajni-agenti.name': 'Secret Agents',
    'game.tajni-agenti.description':
      'The spy gives a clue — guess the words, but watch out for the assassin! Classic, Duet or co-op mode — playable with just 2 players.',
    'game.gluvo-doba.name': 'Dead of Night',
    'game.gluvo-doba.description':
      'Werewolves prowl the village at night — unmask them before no one is left!',
    'game.bolji-zivot.name': 'Zavet',
    'game.bolji-zivot.description':
      'Memory card game of Slavic spirits — 4 hidden cards, swap them, spy on others and call "Zavet!" when you carry the fewest curses!',
    'game.spijun.name': 'The Spy',
    'game.spijun.description':
      'Everyone knows the secret location — except the spy! Question each other and unmask the impostor before they guess where you are.',
    'game.hot-potato.name': 'Hot Potato',
    'game.hot-potato.description':
      'A bomb with a hidden timer goes around — say a word from the category and pass it on. Whoever holds it when it blows is out!',
    // --- game-select cards: tags, short blurbs, "how to play" -------------
    'gameSelect.howToPlay': 'How to play →',
    'gameSelect.howToPlayLabel': 'How to play',
    'gameSelect.noConfig': 'No extra settings — just start ✨',
    'gameSelect.filterAll': 'All',
    'gameSelect.noGamesForFilter': 'No games for the selected filters.',
    'gameTag.quiz': 'Quiz',
    'gameTag.drawing': 'Drawing',
    'gameTag.drawing-bluff': 'Drawing · Bluff',
    'gameTag.bluff': 'Bluff',
    'gameTag.party': 'Party',
    'gameTag.speed': 'Speed',
    'gameTag.team': 'Team',
    'gameTag.cards': 'Cards',

    'game.quiz.blurb': 'Timed questions — fastest scores the most.',
    'game.quiz.rule1':
      'Questions are shown on a timer — a faster correct answer scores more.',
    'game.quiz.rule2': 'Types: classic, picture, map, number, song and video.',
    'game.quiz.rule3': 'An animated scoreboard follows every round.',
    'game.draw-guess.blurb': 'Draw the word — everyone else guesses it.',
    'game.draw-guess.rule1':
      'Players take turns drawing the given word; the rest type guesses.',
    'game.draw-guess.rule2':
      'Faster guessing = more points; the drawer scores on every hit.',
    'game.draw-guess.rule3': 'Letters are revealed over time as a hint.',
    'game.fake-artist.blurb': 'Find the impostor who does not know the word.',
    'game.fake-artist.rule1':
      'Everyone draws the same word one stroke at a time — except the impostor.',
    'game.fake-artist.rule2': 'After drawing you vote on who the fake artist is.',
    'game.fake-artist.rule3':
      'The impostor wins if they stay hidden or guess the word.',
    'game.fibbage.blurb': 'Write a fake answer, fool the crew.',
    'game.fibbage.rule1': 'Write a convincing fake answer to the question.',
    'game.fibbage.rule2':
      '+500 for finding the truth, +100 for everyone you fool.',
    'game.fibbage.rule3': 'You cannot vote for your own answer.',
    'game.ko-bi-pre.blurb': 'Who would do it first?',
    'game.ko-bi-pre.rule1': 'For each question you vote who would do it first.',
    'game.ko-bi-pre.rule2': 'Points for those who match the majority answer.',
    'game.ko-bi-pre.rule3': 'A quick, light party game.',
    'game.dve-istine-i-laz.blurb': 'Two truths and one lie.',
    'game.dve-istine-i-laz.rule1':
      'Everyone writes two truths and one lie about themselves.',
    'game.dve-istine-i-laz.rule2': 'The rest guess which statement is the lie.',
    'game.dve-istine-i-laz.rule3':
      'Points for guessing right and for a good lie.',
    'game.slepi-telefoni.blurb': 'A phrase that mutates.',
    'game.slepi-telefoni.rule1':
      'You write a phrase; the next draws it; the next guesses the drawing.',
    'game.slepi-telefoni.rule2': 'The chain loops around through all players.',
    'game.slepi-telefoni.rule3':
      'At the end you view all chains and vote for the funniest.',
    'game.ko-sam-ja.blurb': 'How well do you know each other?',
    'game.ko-sam-ja.rule1':
      'A personal question about one player — they answer secretly.',
    'game.ko-sam-ja.rule2': 'The rest guess what they picked.',
    'game.ko-sam-ja.rule3': 'The player scores when no one guesses right.',
    'game.spot-it.blurb': 'Spot the matching symbol first.',
    'game.spot-it.rule1':
      'Your card and the center card share exactly one symbol.',
    'game.spot-it.rule2': 'The first to find and tap it wins the card.',
    'game.spot-it.rule3': 'Most cards collected at the end wins.',
    'game.gluvo-doba.blurb': 'Unmask the werewolves before dawn.',
    'game.gluvo-doba.rule1':
      'Werewolves pick a victim at night; by day the village votes to banish.',
    'game.gluvo-doba.rule2': 'Special roles have powers (healer, seer…).',
    'game.gluvo-doba.rule3': 'The village wins by unmasking all the wolves.',
    'game.bolji-zivot.blurb': 'A memory card game.',
    'game.bolji-zivot.rule1':
      'You have 4 hidden cards — the goal is the lowest curse sum.',
    'game.bolji-zivot.rule2':
      'Swap cards, spy on opponents, remember what is where.',
    'game.bolji-zivot.rule3':
      'Call "Zavet!" when you think you are the lowest.',
    'game.tajni-agenti.blurb': 'The spy gives a clue, beware the assassin.',
    'game.tajni-agenti.rule1': 'The spy gives a clue: one word + a number.',
    'game.tajni-agenti.rule2':
      'The team guesses its words on the board, but beware the assassin.',
    'game.tajni-agenti.rule3': 'Modes: Classic (2 teams), Duet and co-op.',
    'game.spijun.blurb': 'Unmask the impostor among you.',
    'game.spijun.rule1': 'Everyone knows the secret location — except the spy.',
    'game.spijun.rule2':
      'Question each other to unmask the impostor; the spy tries to guess the location.',
    'game.spijun.rule3': 'A vote reveals who the spy is.',
    'game.hot-potato.blurb': 'Pass the bomb before it blows.',
    'game.hot-potato.rule1':
      'A bomb with a hidden timer passes among the players.',
    'game.hot-potato.rule2': 'Say a word from the given category and pass it on.',
    'game.hot-potato.rule3': 'Whoever it "blows" on — is out of the game.',
  },
};

/**
 * Look up a translation for `key` in `lang`, falling back to Serbian
 * (the default language) and finally to the raw key. `{placeholder}`
 * tokens are replaced by `params`.
 */
export function translate(
  lang: Language,
  key: string,
  params?: Record<string, string | number>
): string {
  let s = STRINGS[lang]?.[key] ?? STRINGS[DEFAULT_LANGUAGE][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}
