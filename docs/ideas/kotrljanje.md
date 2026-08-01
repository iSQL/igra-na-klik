# Kotrljanje — trka kuglica ⭐

**Tip:** akcija, trka · **Igrači:** 2–10 · **Trajanje:** ~8 min
**Hostless:** ne · **Tier:** 3 (traži brzi tick + delta broadcast)

## Ideja

Svaki igrač je kuglica na stazi koja se spušta nizbrdo. Skreće se palcem,
staza ima skretanja, skokove i rupe. Prvi do cilja nosi najviše. Klasik koji
će ljudi tražiti čim vide da platforma ume 3D.

## TV

Kamera prati grupu (chase cam koja uokviruje sve žive kuglice — zoom se
prilagođava rasponu). Svaka kuglica u boji avatara sa imenom iznad. Pozicije
1., 2., 3. u uglu, tajmer, i „poslednji krug" naglašeno.

Staza od primitiva: nagnute ravni, rampe, prepreke — bez modela, isti recept
kao [PitchScene](../../packages/host/src/games/penali/PitchScene.ts).

## Telefon

Dodirni džojstik levo-desno (skretanje) + dugme za skok. Opciono nagib kao
dodatak. Ulaz se grupiše na ~20/s.

Bitno: **telefon ne simulira ništa** — samo šalje nameru. Server drži poziciju,
TV interpolira između state paketa. Time se izbegava neslaganje između ekrana.

## Faze

```
intro → trka → cilj → rang lista → (sledeća staza) → kraj
```

## Bodovanje

Poeni po plasmanu (npr. 100 / 70 / 50 / 30 …), plus mali bonus za najbrži krug.
Ispadanje (pad sa staze) vraća na poslednju kontrolnu tačku uz gubitak vremena,
ne uz eliminaciju — eliminacija u trci sa 8 ljudi znači da polovina sobe gleda.

## Rizici i šta rešiti prvo

- **Ovo je igra na kojoj se gradi delta broadcast.** Slanje punog state-a 20×/s
  za 10 igrača je previše; treba mali paket (id, pozicija, brzina) po tiku.
  Presedan: `getPendingOpsAppend` u [IGameModule](../../packages/server/src/game/IGameModule.ts).
- **Latencija na VPS-u.** Sa 40ms RTT skretanje deluje mlako. Ublažava se
  interpolacijom na TV-u i time što staza ne traži precizne poteze u zadnji čas
  (široke krivine, nema uskih skokova).
- Sudari između kuglica su zabavni ali udvostručuju posao oko fizike — prvo
  verzija bez sudara (kuglice prolaze jedna kroz drugu), pa dodati ako valja.
