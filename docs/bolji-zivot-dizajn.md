# Zavet — dizajn igre (Omerta/Cabo varijanta na temu slovenske mitologije)

> Status: IMPLEMENTIRANO (v1) + RETEMA (v2). Id igre ostaje `bolji-zivot`
> (presedan: `pogodi-godinu` → „Pogodi broj"). Poziv za kraj runde: **„Zavet!"**.
> Špil je 45 karata (ranija verzija dokumenta je pogrešno sabrala 46 — sa
> 1 Drekavcem zbir je 2+16+20+7 = 45).

## Retema (v2): „Bolji život" → „Zavet"

Prva verzija je bila tematizovana na likove iz serije „Srećni ljudi"; igra je
retematizovana na slovensku/srpsku mitologiju — **gameplay je nepromenjen**,
menjana su samo imena, emoji i tekstovi. Bića se namerno preklapaju sa Gluvim
dobom (zajednički univerzum platforme). Interni identifikatori (faza `riska`,
akcije `bz:riska-*`, konstante `BZ_MALINA_V`/`BZ_OZREN_V`/`BZ_POPARA_V`/
`BZ_RISKA_V`, promenljive `riskaHolder`…) namerno nose stara imena.

| Vr. | Staro (v1) | Novo (v2) |
|---|---|---|
| 0 | Beban / Neca i Žiki | Petao 🐓 / Zora 🌅 |
| 1 | Guza | Domaćin 🏠 |
| 2 | Vukašin | Vila 🧚 |
| 3 | Emilija | Rusalka 🌊 |
| 4 | Lola | Karakondžula 🐐 |
| 5 | Kustudić | Suđaja 🔮 |
| 6 | Ilija Pandurović | Vračara 👁️ |
| 7 | Aranđel Golubović | Podmenak 🔄 |
| 8 | Inspektor Naumović | Gromovnik ⚡ (racija → „Grom") |
| 9 | Direktor Kurčubić | Veštica 🧙 |
| 10 | Malina Vojvodić | Vesna 🌸 |
| 11 | Ozren Soldatović | Morana ❄️ (Vesna+Morana par = 0) |
| 12 | Radomir Popara | Zduhać 🛡️ (odbijenica → „presreće napad") |
| 13 | Riska Golubović | Drekavac 😱 („Drekavac vrišti!") |

Poeni „orasi u džepu" → **„uroci"**; motiv na poleđini karata 🌰 → 🧿.
Tekst ispod je originalni dizajn dokument (v1 imena) — mehanike i balans
napomene i dalje važe, samo imena čitaj kroz tabelu iznad.

## „!" dugme — brze akcije (v2 izmena mehanike)

Plutajuće **„!" dugme** na telefonu objedinjuje tri brze akcije: klik otvara
tihi popup (ostali ne vide pritisak) sa onim što je trenutno dostupno:

- **Slap**: prozor **više nema vremenski rok** (v1: ~4s za sve). Otvara se kad
  karta 0–9 padne na otpad i traje **dok sledeći igrač ne povuče/uzme kartu**
  ili dok se vrh otpada ne promeni; prvi pogodak ga zatvara za ostale. Jedan
  pokušaj po prozoru; promašaj = javno otkrivanje + kaznena karta
  (nepromenjeno). `data.slap.id` raste sa svakim prozorom da klijenti resetuju
  lokalno „!" stanje.
- **Zduhać reakcija**: prozor je skraćen na **~3s** (v1: 7s) — meta tapne „!"
  pa označi kartu za koju veruje da je Zduhać; ako vreme istekne, akcija se
  finalizira sama. Ovim potez sa moći više ne čeka da meta izjavi „nemam".
- **„Zavet!" poziv**: premešten sa zasebnog dugmeta u „!" popup (sa korakom
  potvrde), dostupan na početku svog poteza.

## Koncept

Memorijska kartaška igra tipa Cabo/Omerta. Svaki igrač ima **porodicu od 4 karte
okrenute naopačke** (2×2 mreža na svom telefonu). Bodovi na kartama su **„orasi
u džepu"** — nivo korupcije/dugova (0 najbolje, 13 najgore). Cilj runde: imati
najmanje oraha kad neko vikne „Bolji život!".

Napomena o poreklu: iako je polazna inspiracija bila Omerta (bghub.org/r/omerta.pdf),
usvojena struktura moći je bliža Cabu (pogledaj svoju / pogledaj tuđu / slepa
zamena / pogledaj-i-zameni). Iz originalne Omerte zadržavamo **slap mehaniku**
(trka bacanja identične karte). Izbačeni: 5 gangster karata (redosled poteza
određuje server), sef u sredini.

## Špil (45 karata)

| Vrednost | Lik | Kom | Moć (pri direktnom bacanju sa špila) |
|---|---|---|---|
| 0 | Beban | 1 | — |
| 0 | Neca i Žiki | 1 | — |
| 1 | Guza | 4 | — |
| 2 | Vukašin | 4 | — |
| 3 | Emilija | 4 | — |
| 4 | Lola | 4 | — |
| 5 | Kustudić | 4 | Pogledaj jednu **svoju** kartu |
| 6 | Ilija Pandurović | 4 | Pogledaj jednu **tuđu** kartu |
| 7 | Aranđel Golubović | 4 | **Slepa zamena**: zameni svoju sa tuđom, bez gledanja |
| 8 | Inspektor Naumović | 4 | **Racija**: svakom igraču se okreće po jedna **nasumična** karta, svi je vide, vraća se naopačke |
| 9 | Direktor Kurčubić | 4 | **Pogledaj i zameni**: pogledaj tuđu; ako hoćeš, zameni je sa svojom |
| 10 | Malina Vojvodić | 2 | Bez moći. **Par sa Ozrenom u tvoje 4 karte pri otkrivanju → oba vrede 0** |
| 11 | Ozren Soldatović | 2 | Bez moći. Druga polovina para (1 Ozren pokriva 1 Malinu) |
| 12 | Radomir Popara | 2 | **Odbijenica** (reakcija, vidi dole) |
| 13 | Riska Golubović | 1 | **Ne odlazi tiho** (reakcija na poziv, vidi dole) |

Balans napomene:
- „Pogledaj i zameni" je najjača ciljana moć → namerno sedi na 9 (najskuplja
  obična karta), a racija na 8. Ne vraćati na originalni raspored (racija=9).
- Racija okreće **nasumičnu** kartu svakog igrača — igrač ne bira (birali bi
  uvek svoju poznatu nulu i moć bi bila ćorak).

## Pozicije i pamćenje

Svoje 4 karte igrač stalno vidi kao **poleđine na fiksnim pozicijama** (2×2 na
telefonu). Pozicije se nikad same ne mešaju — nema „shuffle" efekta u igri
(originalna The Lady je izbačena). Pamćenje je poziciono:

- peek (početna 2, Kustudić, racija) prikaže lice ~5s pa se karta vrati na
  poleđinu — igrač pamti „dole-levo je 0";
- svoja zamena: novu kartu je upravo video → tu poziciju zna sigurno, a
  izbačena se javno okrene na otpadu;
- **tuđa akcija na tvoju kartu (7, 9) se javno objavljuje po poziciji** — svi
  vide KOJA pozicija je zamenjena, niko (osim učesnika koji su gledali) ne vidi
  ŠTA je sad tamo. Server ovo mora emitovati (TV animacija + oznaka na
  telefonu vlasnika), inače igrač veruje zastarelom pamćenju bez šanse da zna.

Slap i Popara se oslanjaju upravo na ovo poziciono pamćenje (tapneš poziciju
za koju veruješ da znaš šta je).

## Tok runde

**Priprema:** promešan špil, svakom 4 karte naopačke (2×2), ostatak je špil za
izvlačenje; jedna karta se odmah okreće kao početak otpada. Pre prvog poteza
svaki igrač na telefonu **provirи 2 svoje karte po izboru** (prozor ~10s,
posle toga nasumične 2 ako nije izabrao). Redosled poteza: nasumičan, server ga
prikazuje na TV-u.

**Potez:**
1. (Opciono, samo na početku svog poteza) vikni **„Bolji život!"** → kraj runde
   (vidi dole).
2. Izvuci kartu: **sa špila** (tajno, vidi je samo na svom telefonu) ili
   **vrh otpada** (javno).
3. Zatim:
   - **Zameni** je sa jednom od svoje 4 karte (ne gledajući koju izbacuješ) —
     izbačena ide na otpad licem nagore; **moć izbačene karte se NE aktivira**;
   - ili **baci** izvučenu direktno na otpad (dozvoljeno samo ako je sa špila) —
     ako je karta 5–9, **moć se aktivira**.

Pravilo aktivacije (ključno, iz Caba): moć se aktivira **isključivo** kad kartu
izvučeš sa špila i direktno je baciš. Uzeta sa otpada ili izbačena zamenom —
bez moći.

Prazan špil → promešaj otpad (bez vrha) u novi špil.

**Slap („Uleti!"):** kad na otpad padne karta vrednosti **0–9** (bilo kojim
putem), otvara se prozor ~3–4s: **svaki** igrač sme da tapne jednu svoju kartu
za koju veruje da je iste vrednosti. Najbrži tačan pogodak: karta mu odlazi na
otpad (porodica mu se smanjuje — može ispod 4!). Promašaj: karta se svima
pokaže, vrati naopačke, i igrač **vuče kaznenu kartu** (naopačke, bez gledanja).
Sporiji tačni: ništa, karta ostaje. Moć slapovane 5–9 karte se ne aktivira.
Specijalke 10–13 ne učestvuju u slapu. Server presuđuje po timestamp-u
(postojeći obrazac iz Pronađi par).

## Reakcione karte

**Popara (12) — „Gospođice Lela, pišite odbijenicu!"**
Kad te neko cilja moći (6, 7, 9 usmerena na tvoju kartu; racija NE — pogađa sve),
tvoj telefon dobija prozor **~5s**: tapni svoju kartu za koju veruješ da je
Popara. Pogodak: akcija napadača propada, **obe** karte (Popara + napadačeva
bačena moć već je na otpadu) — Popara ide na otpad, porodica ti se smanjuje.
Promašaj: karta se svima pokaže, vrati se, vučeš kaznenu kartu. Popara reaguje
**samo na akcije usmerene na tebe** — nema globalnog prekida posle svake moći.

**Riska (13) — „Riska ne odlazi tiho"**
Kad neko vikne „Bolji život!", posle završnog kruga a **pre otkrivanja**, TV
objavljuje: **„Riska se oglašava!"** — vlasnik Riske (server zna gde je) dobija
jedan dodatni potez u kom Risku sme samo da **zameni** (izvuče kartu i ubaci je
na Riskino mesto → Riska na otpad, ili je slepom zamenom uvali drugom — dodatni
potez se igra po normalnim pravilima ali izbačena karta MORA biti Riska).
Ne sme prosto da je odbaci bez izvlačenja. Samo 1 Riska u špilu — nema lanca.
Ako je Riska u otpadu/špilu u trenutku poziva, ništa se ne dešava.

## Kraj runde i bodovanje

- Poziv **„Bolji život!"** — bilo kad na početku svog poteza (Cabo stil, bez
  praga). Pozivač više ne igra; **svi ostali odigraju još tačno po jedan potez**,
  zatim Riska-momenat, pa otkrivanje svih porodica na TV-u.
- Pozivač ima **strogo najmanje** oraha → dobija **0 poena** za rundu, ostali
  zbir svojih karata (uz Malina+Ozren=0 pravilo).
- Pozivač NIJE strogo najniži → pozivač dobija **svoj zbir + 20 kazne**,
  najniži igrač dobija 0, ostali svoj zbir. (Nerešeno između pozivača i drugog:
  pozivač gubi — mora biti strogo najniži.)
- Partija: **4 runde**, najmanje oraha ukupno pobeđuje.

## Ciljani opseg igrača

**3–6** (registry `minPlayers: 3`, `maxPlayers: 6`). Špil od 45 karata za 6
igrača: 24 podeljene + 22 u špilu — taman uz reshuffle otpada.

## Plan implementacije (5 tačaka framework-a)

1. **Registry** (`packages/shared/src/games/registry.ts`): `bolji-zivot`,
   min 3 / max 6, `supportsHostless: true`. Igra je prirodno phone-native:
   sve tajno (svoje karte, peek, izvučena karta, slap, Popara) je na telefonu
   i u TV režimu. Hostless dodaci na kontroleru (ključ `room.hostless`):
   - mini sto iznad svoje mreže: protivnici kao poleđine (broj karata!),
     indikator poteza, veličina špila;
   - vrh otpada na telefonu (u TV režimu takođe — dugme „uzmi sa otpada"
     ionako mora da pokaže šta se uzima);
   - racija: otkrivene karte svih na svakom telefonu;
   - otkrivanje kraja runde: sve porodice + Malina/Ozren efekat + tabela na
     svakom telefonu (obrazac Slepi telefoni / Pogodi gde je), dugme za
     sledeću rundu kod nosioca kontrole.
   TV režim ostaje primaran; gubi se samo teatralnost (Riska momenat,
   animacija otkrivanja), ništa mehanički.
2. **Server modul** `packages/server/src/game/games/bolji-zivot/`:
   - Faze: `peeking → turn → [slap-window] → [reaction-window] → calling-final-round → riska-turn → reveal → leaderboard` × 4 runde → `ended`.
   - **Anti-leak**: raspored karata živi samo na serveru. `hostData` nosi samo
     javno stanje (broj karata po igraču, vrh otpada, veličina špila, na potezu,
     otkrivene karte tokom racije/slapa/otkrivanja). `playerData` nosi privatno:
     izvučenu kartu, rezultate svojih provirivanja (5/6/9), memorisane pozicije
     NE — pamćenje je na igraču (namerno: peek prikaz traje ~5s pa se sklanja).
   - Slap i Popara/Riska prozori: server timeout + najbrži timestamp.
   - Reconnect: postojeći snapshot obrazac; peek rezultati se NE reemituju
     posle isteka prikaza (memorija je deo igre) — reemituje se samo trenutna
     faza i javno stanje.
   - Timinzi: prozori (slap, reakcija, prikaz peeka, otkrivanje) idu u
     `GAME_TIMING_DEFS` (wait faze); dužina samog poteza je gameplay i ostaje
     hardkodovana.
3. **Registracija** u `packages/server/src/socket/setup.ts`.
4. **Host komponenta** `packages/host/src/games/bolji-zivot/`: sto sa
   porodicama (poleđine karata), otpad + špil, animacije zamena, racija
   momenat, „Riska se oglašava!", otkrivanje sa Malina+Ozren efektom.
5. **Controller komponenta** `packages/controller/src/games/bolji-zivot/`:
   2×2 mreža svojih karata, dugmad izvuci/uzmi-sa-otpada, tajni prikaz
   izvučene karte, slap tap, Popara prozor, „Bolji život!" dugme.

Socket događaji (svi kroz `events.ts`): predlog prefiksa `omerta:`… ne —
prefiks `bz:` ili `boljizivot:`; game-specific: `draw`, `swap`, `discard`,
`slap`, `reaction`, `peek-ack`, `call`.

Jezik: in-game ekrani **samo srpski** (kao Kviz/Lažov klasa igara); kartica na
game-select ekranu dobija `game.bolji-zivot.name/description` u oba jezika.

## Otvorena pitanja (za sledeću iteraciju)

- Ime igre na game-select kartici: „Bolji život!" (favorit), „Orasi u džepu",
  „Srećni ljudi"?
- Vizuelni identitet karata: ilustracije likova? (možda generisane, u brand
  paleti — navy/gold/cream poleđina sa orahom kao motivom).
- Da li racija (8) treba tjunovanje posle testiranja — nasumično okretanje može
  biti frustrirajuće; fallback opcija: igrač bira u 5s ili nasumično.
- Admin editor / packovi nisu potrebni (fiksan špil), ali `/admin/timinzi`
  unos za prozore jeste.
