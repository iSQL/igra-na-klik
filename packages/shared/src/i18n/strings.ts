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
    'import.builtinPack': 'Ugrađeni paket',
    'import.builtinWords': 'Ugrađene reči',
    'import.loaded': 'Učitano',
    'import.questions': 'pitanja',
    'import.words': 'reči',
    'import.importQuestions': 'Uvezi pitanja',
    'import.importQuestionsFile': 'Uvezi pitanja iz fajla',
    'import.importWords': 'Uvezi reči',
    'import.importScenario': 'Uvezi scenario (.json)',
    'import.fromFile': 'Iz fajla',
    'import.questionPack': 'Paket pitanja',
    'import.scenarioFromServer': 'Scenario sa servera…',
    'import.saveCode': 'Sačuvaj kod',
    'import.codePlaceholder': 'kod',
    'import.active': 'Aktivan',
    'import.sourceFile': 'fajl',
    'import.sourceServer': 'server',
    'import.codePrefix': 'kod',
    'import.unknownCode': 'Nepoznat kod',
    'import.invalidScenario': 'Neispravan scenario "{code}": {error}',

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
    'config.gluvoMode': 'Mod (uloge)',
    'config.gluvoModeClassic': 'Klasik (ugrađeni balans)',
    'config.gluvoModeNote': 'Uloge dolaze iz izabranog moda — ostala pravila i dalje važe.',

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

    // --- slepi telefoni --------------------------------------------------
    'slepi.gameOver': 'Kraj igre',
    'slepi.thanks': 'Hvala što ste igrali Slepe telefone!',
    'slepi.enterPromptTitle': 'Napišite početnu frazu',
    'slepi.enterPromptDesc':
      'Svako unosi svoju frazu koju će sledeći igrač pokušati da nacrta.',
    'slepi.wroteCount': '{n}/{total} napisalo',
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
    'spotIt.pointsWon': '+{n} poena!',
    'spotIt.zeroPoints': '0 poena',
    'spotIt.winner': 'Pobedio: {name}',

    // --- game names / descriptions (all nine) ----------------------------
    'game.quiz.name': 'Kviz',
    'game.quiz.description':
      'Pitanja na vreme — najbrži tačan odgovor nosi najviše poena!',
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
    'game.pogodi-godinu.name': 'Pogodi broj',
    'game.pogodi-godinu.description':
      'Pogodi vrednost — cenu, godinu, težinu, dužinu… bliži pogodak, više poena!',
    'game.slepi-telefoni.name': 'Slepi telefoni',
    'game.slepi-telefoni.description':
      'Napiši frazu, sledeći je crta, zatim sledeći pogađa — pogledajte kako se rečenica izvitoperi!',
    'game.geo-pogodi.name': 'Pogodi gde je',
    'game.geo-pogodi.description':
      'Pogodi gde je u Srbiji slikana fotografija — bliža igla, više poena!',
    'game.foto-kviz.name': 'Foto kviz',
    'game.foto-kviz.description':
      'Pogledaj fotografiju i izaberi pravu lokaciju od 4 ponuđena odgovora!',
    'game.ko-sam-ja.name': 'Ko sam ja?',
    'game.ko-sam-ja.description':
      'Lična pitanja o igračima — koliko dobro poznajete jedni druge?',
    'game.spot-it.name': 'Pronađi par',
    'game.spot-it.description':
      'Tvoja karta i centralna karta dele tačno jedan simbol — pronađi ga prvi!',
    'game.tajni-agenti.name': 'Tajni agenti',
    'game.tajni-agenti.description':
      'Špijun daje šifru tima — saigrači pogađaju reči, ali pazi na ubicu!',
    'game.gluvo-doba.name': 'Gluvo doba',
    'game.gluvo-doba.description':
      'Vukodlaci noću haraju selom — otkrijte ih pre nego što vas nestane!',
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
    'import.builtinPack': 'Built-in pack',
    'import.builtinWords': 'Built-in words',
    'import.loaded': 'Loaded',
    'import.questions': 'questions',
    'import.words': 'words',
    'import.importQuestions': 'Import questions',
    'import.importQuestionsFile': 'Import questions from file',
    'import.importWords': 'Import words',
    'import.importScenario': 'Import scenario (.json)',
    'import.fromFile': 'From file',
    'import.questionPack': 'Question pack',
    'import.scenarioFromServer': 'Scenario from server…',
    'import.saveCode': 'Save code',
    'import.codePlaceholder': 'code',
    'import.active': 'Active',
    'import.sourceFile': 'file',
    'import.sourceServer': 'server',
    'import.codePrefix': 'code',
    'import.unknownCode': 'Unknown code',
    'import.invalidScenario': 'Invalid scenario "{code}": {error}',

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
    'config.gluvoMode': 'Mode (roles)',
    'config.gluvoModeClassic': 'Classic (built-in balance)',
    'config.gluvoModeNote': 'Roles come from the selected mode — other rules still apply.',

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

    // --- slepi telefoni --------------------------------------------------
    'slepi.gameOver': 'Game over',
    'slepi.thanks': 'Thanks for playing Blind Telephone!',
    'slepi.enterPromptTitle': 'Write a starting phrase',
    'slepi.enterPromptDesc':
      'Everyone writes a phrase that the next player will try to draw.',
    'slepi.wroteCount': '{n}/{total} wrote',
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
    'spotIt.pointsWon': '+{n} points!',
    'spotIt.zeroPoints': '0 points',
    'spotIt.winner': 'Winner: {name}',

    // --- game names / descriptions (all nine) ----------------------------
    'game.quiz.name': 'Quiz',
    'game.quiz.description':
      'Timed questions — the fastest correct answer scores the most!',
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
    'game.pogodi-godinu.name': 'Guess the Number',
    'game.pogodi-godinu.description':
      'Guess the value — a price, year, weight, distance… the closer you are, the more points!',
    'game.fibbage.name': 'Liar',
    'game.fibbage.description':
      'Write a fake answer, find the real one, fool everyone else!',
    'game.slepi-telefoni.name': 'Blind Telephone',
    'game.slepi-telefoni.description':
      'Write a phrase, the next person draws it, then someone guesses — watch the sentence mutate!',
    'game.geo-pogodi.name': 'Guess Where',
    'game.geo-pogodi.description':
      'Guess where in Serbia the photo was taken — the closer your pin, the more points!',
    'game.foto-kviz.name': 'Photo Quiz',
    'game.foto-kviz.description':
      'Look at the photo and pick the right location from 4 options!',
    'game.ko-sam-ja.name': 'Who Am I?',
    'game.ko-sam-ja.description':
      'Personal questions about the players — how well do you know each other?',
    'game.spot-it.name': 'Spot It',
    'game.spot-it.description':
      'Your card and the center card share exactly one symbol — spot it first!',
    'game.tajni-agenti.name': 'Secret Agents',
    'game.tajni-agenti.description':
      'The spy gives the team a clue — teammates guess the words, but watch out for the assassin!',
    'game.gluvo-doba.name': 'Dead of Night',
    'game.gluvo-doba.description':
      'Werewolves prowl the village at night — unmask them before no one is left!',
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
