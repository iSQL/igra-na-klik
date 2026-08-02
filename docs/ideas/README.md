# Ideje za nove igre

Kandidati za sledeće igre. **Penali su odavde već implementirani** (vidi
[penali-implemented.md](penali-implemented.md) za ono što je izgradnja
pokazala).

Sve u ovom folderu su predlozi, ne obaveze. Svaki unos je dovoljno konkretan da
se od njega krene u implementaciju: šta ide na TV, šta na telefon, koje su faze,
kako se boduje i gde su rizici.

Dva dela:
- **[Akcija i 3D](#kandidati)** — prva grupa, nastala uz Penale.
- **[Popunjavanje praznina](#druga-grupa--popunjavanje-praznina)** — 15 igara
  iz žanrova koje platforma uopšte nema.

## Gde su rupe u ponudi

Postojećih 17 igara po kategorijama:

| Kategorija | Igre |
|---|---|
| kviz | Kviz, Asocijacije |
| crtanje | Crtaj i pogodi, Slepi telefoni, Lažni umetnik |
| blef | Lažov, Špijun |
| društvena | Ko bi pre?, Dve istine i laž, Ko sam ja? |
| brzina | Pronađi par, Vruć krompir |
| timska | Gluvo doba, Tajni agenti |
| kartaška | Zavet |
| akcija | Penali, Splav |
| reč igra | Složilica |

Ponuda je **zasićena u blefu, crtanju i kvizu**. Od tri žanra kojih nije bilo,
**reč igre** su otvorene Složilicom (rečnik je rešen, pa je svaka sledeća reč
igra sada jeftina), dok **fizičke igre** (soba umesto ekrana) i
**ekonomija/rizik** (resurs kojim se upravlja, ulog koji se gubi) i dalje ne
postoje. Druga grupa ispod cilja tačno te praznine.

## Šta platforma već daje, a šta akciona igra traži

| Postoji danas | Akciona igra traži |
|---|---|
| Tick na servseru svake 1s ([GameManager.ts:119](../../packages/server/src/game/GameManager.ts#L119)) | ~20–33ms simulacija, ili fizika na TV-u |
| `game:player-action` ograničen na 60/s po socketu | Isti budžet — grupiši inpute kao crtanje (~20/s) |
| Pun state broadcast po akciji | Delta broadcast — presedan postoji: `getPendingOpsAppend` |
| Framer Motion / Howler na hostu | three.js **samo na hostu**, kontroler ostaje lagan |

**Minimalno proširenje** za igre iz Tier 3: opcioni `tickIntervalMs` na
[IGameModule](../../packages/server/src/game/IGameModule.ts), da akcioni modul
uđe u brzu petlju bez diranja ostalih 16 igara. `onTick` već prima `deltaMs`.

> ✅ **Ovo je urađeno** uz Splav: `tickIntervalMs` postoji, brzi modul dobija
> *stvarno* proteklo vreme kao `deltaMs` (sekundna petlja i dalje dobija tačno
> `1000`), a delta broadcast ide kroz `getPendingFrame` → `game:frame`.

## Dva ograničenja koja diktiraju dizajn

- **iOS nagib traži HTTPS + gest za dozvolu.** `DeviceOrientationEvent.requestPermission()`
  postoji samo u secure kontekstu, pa na LAN-u preko `http://192.168.x.x`
  iPhone ne daje ništa. Nagib sme biti samo *dodatak* preko dodirnog džojstika,
  nikad jedini ulaz — osim ako se ne pređe na HTTPS na LAN-u.
- **Latencija zavisi od deploya.** LAN je ~5–15ms (dovoljno za twitch), Coolify
  dodaje 20–60ms RTT. Zato favorizuj dizajne gde kašnjenje ne boli: nišani-pa-
  potvrdi, ili fizika na TV-u sa serverom kao relejom.

## Kandidati

### Tier 1 — bez nove infrastrukture
Rade na današnjem event modelu, mogu se napraviti u jednom sedenju.
Sve tri su u [brzi-dodaci.md](brzi-dodaci.md): **Uže** (potezanje konopca),
**Refleks duel** (ko pre tapne), **Ritam** (tapkanje u taktu).

### Tier 2 — three.js na TV-u, diskretan unos sa telefona
Prava 3D scena, ali telefon šalje jedan potez po rundi, pa latencija ne igra ulogu.
Ista šema koju su Penali dokazali.

- [pikado.md](pikado.md) — Pikado / gađanje, povuci-i-pusti nišan
- [rupa-u-zidu.md](rupa-u-zidu.md) — Zid sa siluetom nailazi, biraš pozu
- [bombarderi.md](bombarderi.md) — Artiljerija preko razrušivog terena

### Tier 3 — kontinualni unos, traži brzi tick
Tu platforma stvarno dobija novu sposobnost.

- [kotrljanje.md](kotrljanje.md) — Trka kuglica niz stazu ⭐
- [lavirint.md](lavirint.md) — Kooperativni lavirint, svi naginju istu ploču ⭐
- ~~[splav.md](splav.md)~~ (✅ implementirano kao **Splav**) — sumo arena koja se
  smanjuje. Time je i uvedena infrastruktura za ceo Tier 3: `tickIntervalMs` na
  [IGameModule](../../packages/server/src/game/IGameModule.ts) i delta broadcast
  preko `getPendingFrame` → `game:frame`. Sledeća kontinualna igra ih zatiče gotove.
- [trka-do-vrha.md](trka-do-vrha.md) — Endless runner sa trakama

## Druga grupa — popunjavanje praznina

15 igara iz žanrova kojih nema. Nijedna ne traži 3D ni brzi tick — sve rade na
današnjem modelu, pa je rizik tehnički mali, a u nekoliko slučajeva sadržaj
već postoji.

- [rec-igre.md](rec-igre.md) — **Imena, gradovi, države** ⭐⭐, ~~Reči od slova~~
  (✅ implementirano kao **Složilica**), Vešala, Krokodil
- [fizicke-igre.md](fizicke-igre.md) — **Pantomima** ⭐, **Foto izazov** ⭐⭐,
  Pogodi pesmu, Statue
- [ekonomija-i-rizik.md](ekonomija-i-rizik.md) — **Licitacija** ⭐,
  **Opklada na sebe** ⭐, Kladionica
- [logika-i-kreativa.md](logika-i-kreativa.md) — **Skočko** ⭐, Moj broj,
  Pamti niz, Ko je ovo napisao, Prodaj mi ovo

## Predloženi redosled

Ako je cilj **najviše nove zabave po uloženom trudu**, ide se u drugu grupu:

1. **Imena, gradovi, države** — nula tehničkog rizika, svima poznata, a
   bodovanje po jedinstvenosti odgovora samo pravi napetost.
2. **Opklada na sebe** — nov žanr (ulog), a koristi postojeće kviz packove bez
   ijedne izmene sadržaja.
3. **Pantomima** — Crtaj i pogodi sa sobom umesto platna; modul se skoro
   prepisuje.
4. **Foto izazov** — najveći skok u osećaju; kamera i `exifr` su već tu.

Ako je cilj **tehnički napredak platforme**, ide se u prvu grupu:

1. **Lavirint** — najviše haosa po redu koda, i uvodi brzi tick.
2. **Kotrljanje** — ono što će ljudi tražiti; tu se gradi delta broadcast.

Tier 2 igre (Pikado, Rupa u zidu, Bombarderi) su jeftine i sigurne, ali Penali
već pokrivaju taj oblik — druga igra istog oblika donosi manje nego prva prava
kontinualna igra ili prva igra iz praznog žanra.
