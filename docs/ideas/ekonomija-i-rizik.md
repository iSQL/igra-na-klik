# Ekonomija i rizik — treća prazna kategorija

Nijedna postojeća igra nema **resurs kojim se upravlja** niti **ulog**. Sve su
„odgovori tačno / prevari ostale". Igre sa budžetom i opkladom donose potpuno
drugu vrstu napetosti: gubitak boli, a odluka je tvoja.

Sve tri su tehnički jednostavne — nema 3D, nema brzog tika. Rizik je isključivo
u balansu, pa za svaku važi pravilo iz
[penali-implemented.md](penali-implemented.md): **odigraj 30k rundi u skripti
pre nego što proglasiš da valja.**

---

## 9. Licitacija ⭐

**Igrači:** 3–8 · **Trajanje:** ~10 min · **Hostless:** može · **Trud:** srednji

Svako dobije isti budžet. Redom izlaze lotovi — apsurdni predmeti, sposobnosti,
zvanja („doživotna zaliha ajvara", „pravo da jednom poništiš tuđi odgovor").
Nadmetanje je **slepo i istovremeno**: svi zadaju ponudu, najveća uzima lot i
plaća. Na kraju se otkriva koliko je koji lot zaista vredeo.

- **Ključ zabave:** vrednosti lotova su skrivene do kraja, a neki su zamke
  (koštaju te poena). Igra je o čitanju drugih, ne o računu.
- **Anti-leak:** ponude ne smeju u broadcast dok se runda ne zatvori — isto
  pravilo kao slepi izbor u Penalima.
- **Bodovanje:** finalni poeni = vrednost osvojenih lotova + neutrošeni budžet.
- **Rizik:** izjednačene ponude. Pravilo mora biti unapred jasno — prednost
  onome ko je ranije poslao (server već zna redosled).

## 10. Opklada na sebe (blef kviz) ⭐

**Igrači:** 2–10 · **Trajanje:** ~8 min · **Hostless:** može · **Trud:** mali

Pitanje se pokaže, ali **pre odgovora svako uloži** koliko je siguran u sebe
(10–100% trenutnih poena). Tačno = dobijaš ulog, netačno = gubiš ga.

- **Zašto je dobra:** koristi **postojeće kviz packove bez ikakve izmene** —
  ceo sadržaj već postoji. Najjeftinija igra na celoj listi po odnosu
  sadržaj/trud.
- Preokreće dinamiku kviza: onaj ko zaostaje mora da rizikuje sve, pa se
  rang lista prevrće do poslednjeg pitanja.
- **Rizik:** igrač na nuli ne može da uloži ništa i ispada iz igre mrtav.
  Rešenje: minimalni „džeparac" svake runde, ili ulog kao procenat sa podom.

## 11. Kladionica

**Igrači:** 4–10 · **Trajanje:** ~10 min · **Hostless:** ne · **Trud:** veći

Meta-igra: klade se **na druge igrače**. „Ko će od njih dvoje pogoditi?",
„Hoće li Marko dati gol iz penala?" Deo sobe igra izazov, ostatak se klade
sa kvotama koje server računa iz dosadašnjeg učinka.

- **Zanimljivo:** može se nakalemiti na postojeće igre kao sloj — npr. tokom
  Penala oni koji čekaju red se klade na ishod udarca. To bi rešilo jedini
  slab deo Penala (čekanje) bez nove igre.
- **Rizik:** složenost. Kvote koje nemaju smisla ubijaju igru brže od bilo čega.
  Prva verzija: fiksne kvote (2×), bez računanja forme.
- Zbog toga ide **posle** ostale dve, ili kao eksperiment nad Penalima.

---

**Preporuka iz ove grupe:** *Opklada na sebe* je očigledan prvi korak — nov
žanr, a sadržaj već postoji u `question-packs/`. *Licitacija* je najbolja
„prava" nova igra, ali traži pisanje lotova od nule.
