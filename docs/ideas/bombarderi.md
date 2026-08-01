# Bombarderi — artiljerija

**Tip:** akcija, taktika · **Igrači:** 2–8 · **Trajanje:** ~10 min
**Hostless:** ne · **Tier:** 2 (3D na TV-u, potez po potez)

## Ideja

Svaki igrač ima top na svom delu terena. Redom se bira ugao i jačina, granata
leti po paraboli, teren se **razara** na mestu pogotka. Pogodak = šteta
protivniku. Poslednji čitav pobeđuje.

Potez po potez, pa je latencija nebitna — ali za razliku od Penala postoji
**učenje kroz rundu**: promašio si za malo, sledeći put korigujеš. To drži
ljude uključenim i dok čekaju red.

## TV

Teren iz profila (2.5D — 3D geometrija, kamera sa strane), topovi u bojama
avatara, trag granate ostaje kratko na ekranu da se vidi korekcija.
Vetar prikazan strelicom gore (ista vrednost za sve u potezu).

Razarivi teren: heightmap niz + `PlaneGeometry` čiji se temeni pomeraju.
Bez modela.

## Telefon

Dva klizača — **ugao** i **jačina** — sa velikim „PALI" dugmetom.
Prikaz poslednjeg sopstvenog poteza („prošli put: 42° / 70%") da korekcija
bude moguća bez pamćenja.

## Faze

```
intro → potez igrača (izbor) → let granate → šteta → sledeći igrač … → kraj
```

## Bodovanje

- Direktan pogodak: poeni po nanetoj šteti.
- Eliminacija protivnika: bonus.
- **Sopstveni top pogođen sopstvenom granatom**: diploma „Kamikaza" (već
  postoji u katalogu) i minus poeni.

## Rizici

- **Tempo.** Sa 8 igrača i 15s po potezu, jedan krug je 2 minuta. Ograniči na
  3–4 kruga, ili uvedi da svi biraju *istovremeno* pa granate lete zajedno —
  brže i haotičnije, ali gubi se korekcija.
- Vetar mora biti javan i isti za sve u tom potezu, inače deluje nepravedno.
- Razaranje terena je stanje koje raste kroz partiju — pazi da heightmap ide u
  broadcast kao delta (izmenjeni segmenti), ne ceo niz na svaki potez.
