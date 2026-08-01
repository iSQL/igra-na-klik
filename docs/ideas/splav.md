# Splav — sumo arena

**Tip:** akcija, borba · **Igrači:** 3–8 · **Trajanje:** ~6 min
**Hostless:** ne · **Tier:** 3 (traži brzi tick)

## Ideja

Svi su na platformi koja se polako smanjuje. Guraš druge napolje, poslednji
preživeli nosi rundu. Kratke runde, više njih.

## TV

Arena odozgo pod uglom, igrači kao kapsule u boji avatara. Ivica platforme
svetli i vidno se povlači. Kad neko ispadne — kratak zvuk i ime na ekranu.

## Telefon

Dodirni džojstik za kretanje + **dugme za nalet** (dash) sa hlađenjem ~2s.
Nalet je jedini način da se neko izgura, pa je odluka *kada* ga potrošiti
cela taktika. Hlađenje se prikazuje kao prsten oko dugmeta.

## Faze

```
intro → borba → runda-gotova → rang lista → … → kraj
```

## Bodovanje

- Preživljavanje: poeni po plasmanu u rundi.
- **Izbacivanje: poeni onome ko je poslednji gurnuo** — inače se svi samo
  kriju po sredini i čekaju da se arena smanji.
- Diplome: „Bager" (najviše izbacivanja), „Kamikaza" (najviše puta ispao prvi).

## Rizici

- **Kampovanje u sredini** je dominantna strategija ako se ne kazni. Arena koja
  se smanjuje to rešava samo delom — dodaj poene za izbacivanje (gore) i
  eventualno da centar pulsira/klizi.
- Sudari između igrača su ovde **obavezni** (za razliku od Kotrljanja), pa je
  fizika skuplja: server mora da drži sve pozicije i rešava odbijanja.
  Jednostavan model: kružnici, elastično odbijanje, impuls naleta × masa.
- Sa 8 igrača na maloj platformi rundа traje 20s — dobro, ali znači da treba
  6–10 rundi da se rang lista slegne.
