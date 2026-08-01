# Trka do vrha — runner sa trakama

**Tip:** akcija, trka · **Igrači:** 2–12 · **Trajanje:** ~5 min
**Hostless:** ne · **Tier:** 3 (brzi tick, ali najjeftiniji od svih)

## Ideja

Svaki igrač ima svoju traku i trči automatski. Dva dugmeta: **skok** i
**čučanj**. Prepreke nailaze sve brže. Ko izdrži najduže / stigne najdalje,
pobeđuje.

Najlakša igra iz Tier 3 jer nema slobodno kretanje — samo dva diskretna
događaja u vremenu, pa je i mrežni deo trivijalan (šalje se „skočio u t",
ne kontinualna pozicija).

## TV

Trake jedna do druge, kamera prati najboljeg. Lik u boji avatara po traci,
ime iznad. Kad neko pogreši — kratka animacija pada, traka posiveli, igrač
gleda ostatak trke (kratko, jer runde su kratke).

## Telefon

Dva velika dugmeta preko celog ekrana: gornja polovina = skok, donja = čučanj.
Bez džojstika, bez preciznosti — radi i na najgorem telefonu.

Haptika na svaki uspešan preskok daje iznenađujuće mnogo osećaja.

## Faze

```
intro → trka → kraj-trke → rang lista → … → kraj
```

## Bodovanje

Poeni po pređenoj razdaljini + bonus po plasmanu. Pošto igrači ispadaju,
razdaljina je prirodna mera i nema potrebe za komplikovanjem.

## Rizici

- **Fer prepreke.** Ako svaka traka ima drugačiji raspored, neko dobije lakšu
  trku. Rešenje: **isti raspored za sve trake**, samo pomeren u vremenu tako da
  se svi suoče sa istim izazovima. Determinističan seed po rundi.
- Kašnjenje mreže menja koliko je „prekasno" za skok. Ublažavanje: server
  prihvata skok sa malim prozorom tolerancije (npr. ±120ms) i sudi po
  vremenu koje je klijent poslao, ograničenom na razumno.
- Skaliranje do 12 igrača je ovde besplatno — trake se samo sužavaju.
