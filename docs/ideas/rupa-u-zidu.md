# Rupa u zidu — pogodi pozu

**Tip:** akcija, brzina · **Igrači:** 2–12 · **Trajanje:** ~6 min
**Hostless:** ne · **Tier:** 2 (3D spektakl, mehanika kao brzo pitanje)

## Ideja

Po TV-u nailazi zid sa izrezanom siluetom. Svaki igrač bira **pozu** koja
odgovara silueti, pre nego što zid stigne. Ko pogodi — prolazi. Ko ne —
zid ga pokupi.

Trik: mehanički je ovo pitanje sa 4 ponuđena odgovora pod pritiskom vremena,
što platforma već ume savršeno. Ali izgleda kao potpuno nova igra, jer je
prezentacija 3D i svi igraju istovremeno.

## TV

Zid koji se približava iz dubine (jasan osećaj vremena koje ističe), silueta
kao rupa u njemu. Iza zida red figurica u bojama avatara. Kad zid stigne —
oni sa tačnom pozom prođu kroz rupu, ostali se sudare i odlete.

Poze su primitivne figure (kapsule + sfere), iste kao golman u Penalima, samo
u različitim položajima ruku i nogu.

## Telefon

2–4 dugmeta sa **skicom poze** (ne tekstom — silueta u malom). Tap = izbor,
može se menjati dok zid ne stigne. Poslednji izbor važi.

## Faze

```
intro → zid dolazi (izbor) → sudar/prolaz → rang lista → … → kraj
```

`zid dolazi` je jedina aktivna faza — traje 5–8s i skraćuje se kroz rundu.

## Bodovanje

Poeni za prolaz + bonus za brzinu izbora (isti obrazac kao kviz:
`1000 × preostalo/ukupno`). Eliminacije **nema** — svi igraju svaku rundu,
samo se poeni gube. Sa 12 igrača eliminacija bi značila dugo gledanje.

## Rizici

- **Čitljivost poza na malom ekranu.** Ako se dve poze razlikuju samo po
  jednoj ruci, na telefonu se ne vidi. Drži razlike krupnim (ruke gore / u
  stranu / čučanj / raskorak) i najviše 4 opcije.
- Zid mora da stigne **tačno kad istekne tajmer** — vizuelna sinhronizacija
  sa serverskim vremenom. Najlakše: TV animira po `timeRemaining` iz state-a,
  a ne po sopstvenom satu.
