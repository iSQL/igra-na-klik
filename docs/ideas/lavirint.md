# Lavirint — kooperativni nagib ⭐

**Tip:** akcija, kooperativna · **Igrači:** 2–10 · **Trajanje:** ~8 min
**Hostless:** ne (TV *je* igra) · **Tier:** 3 (traži brzi tick)

## Ideja

Jedna kuglica, jedan lavirint sa rupama, i **svi igrači naginju istu ploču
istovremeno**. Ulaz svakog telefona se usrednjava u jedan vektor nagiba. Niko
ne kontroliše ploču sam, pa je svaka runda pregovaranje i vika preko sobe.

Ovo je najbolji odnos „haos po redu koda" na listi: mehanika je trivijalna,
a društvena dinamika radi sav posao.

## TV

3D ploča viđena odozgo pod blagim uglom, kuglica, rupe, cilj. Ploča se
vizuelno naginje tačno onoliko koliko je prosek ulaza — igrači vide da ih ima
previše i to je poenta. Tajmer po nivou, brojač preostalih života.

Dodatni sloj koji mnogo daje za malo: **male strelice po obodu ploče u boji
avatara**, jedna po igraču, koje pokazuju ko trenutno gura na koju stranu.
Odmah se vidi ko je „krivac".

## Telefon

Dodirni džojstik (palac na pola ekrana). Nagib telefona kao *dodatak* gde
postoji dozvola — nikad kao jedini ulaz, vidi ograničenje o iOS-u u
[README](README.md). Šalje se normalizovan vektor `{x, y}` u opsegu [-1, 1],
grupisan na ~20/s kao kod crtanja.

Nema privatnog stanja — sve je javno, pa nema ni anti-leak brige.

## Faze

```
intro → igra → (pao-u-rupu → igra)* → nivo-gotov → sledeći nivo … → kraj
```

`igra` je jedina brza faza. Ostale su pauze i idu u `GAME_TIMING_DEFS`.

## Bodovanje

Kooperativno, ali sa individualnim doprinosom da rang lista ima smisla:
- Ceo tim dobija poene za završen nivo (brže = više).
- Individualno: **koliko je čiji ulaz bio usklađen sa smerom kojim je kuglica
  stvarno trebalo da ide** u trenutku pre uspeha. Nagrađuje one koji su vukli
  ispravno, kažnjava one koji su se inatili.
- Diplome se same pišu: „Sabotažer" (najviše suprotan proseku), „Kormilar"
  (najusklađeniji), „Posmatrač" (najmanje pomerao prst).

## Rizici

- **Prosek može da paralizuje.** Sa 8 igrača koji vuku nasumično, ploča stoji.
  Rešenje: ne prost prosek nego prosek sa pojačanjem (`vector * gain`, gain
  raste sa brojem igrača), ili odbaci ekstreme. Traži simulaciju/probu.
- Fizika mora na server ako se boduje usklađenost — inače je TV autoritet i
  server samo prosleđuje. Preporuka: **server drži poziciju kuglice** (jednostavna
  integracija, bez sudara sa zidovima na klijentu), TV interpolira.
