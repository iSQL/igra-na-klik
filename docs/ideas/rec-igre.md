# Reč igre — najveća praznina u ponudi

**Platforma trenutno nema nijednu igru sa rečima.** Asocijacije su najbliže, ali
tamo se pogađa rešenje, ne gradi reč. Ovo je žanr sa najboljim odnosom
uloženog i dobijenog: nula nove infrastrukture, sve radi na postojećem
event modelu, a igračima je svaka od ovih igara već poznata iz detinjstva.

---

## 1. Imena, gradovi, države ⭐⭐

**Igrači:** 2–10 · **Trajanje:** ~8 min · **Hostless:** može · **Trud:** mali

Školska klasika. Izvuče se slovo, svi istovremeno kucaju ime / grad / državu /
životinju / stvar na to slovo. Bodovanje je ono što igru čini:
**jedinstven odgovor 10 poena, isti kao još neko 5, prazno 0.**

- **TV:** slovo ogromno na ekranu, tajmer, pa tabela svih odgovora po kolonama
  sa obojenim duplikatima — to otkrivanje je pola zabave.
- **Telefon:** 5 polja za unos, jedno „GOTOVO" dugme koje zaustavlja rundu za
  sve (klasično pravilo) ili samo za tebe (blaža varijanta).
- **Rizik:** validacija. Da li je „Zvezdan" ime? Najbolje rešenje je **da se ne
  validira automatski** — posle runde svi vide sve odgovore i mogu da ospore
  jedan tapom; ako većina ospori, poništava se. Društvo je validator.
- Zahteva rečnik samo za proveru početnog slova, ne za postojanje reči.

## 2. Reči od slova — ✅ IMPLEMENTIRANO kao **Složilica**

**Igrači:** 2–10 · **Trajanje:** ~8 min · **Hostless:** da

> Ime nije „Slagalica“ namerno — to je naziv RTS-ovog kviza od 1993, a ovo je
> isti tip proizvoda. Rečnik je rešen (252k reči, vidi LICENSE.md), unos je
> tapkanje pločica umesto kucanja. Ostatak teksta ispod je originalni predlog.

Sedam nasumičnih slova (sa razumnim odnosom samoglasnika), svako pravi
najdužu reč. Slagaličin „Reči" u društvenom obliku.

- **Bodovanje:** dužina na kvadrat, ili 10 poena po slovu + bonus za sva slova.
- **Rizik:** ovde **treba rečnik** — bez njega ljudi izmišljaju reči. Srpski
  rečnik oblika (ne lema) je 100k+ reči; kao pack u `DATA_DIR`, učitan jednom
  u memoriju. To je jedini pravi trošak ove igre.
- Alternativa bez rečnika: ista logika osporavanja kao gore.

## 3. Vešala

**Igrači:** 2–10 · **Trajanje:** ~5 min · **Hostless:** može · **Trud:** mali

Ekipno pogađanje slova. Da ne bude čekanja, **svi biraju slovo istovremeno**,
a bira se ono koje je dobilo najviše glasova — pa je igra o tome da ubediš
ostale, a ne da čekaš red.

- **TV:** crtice, pogođena slova, promašaji kao delovi vešala.
- **Bodovanje:** poeni onome ko je predložio slovo koje je prošlo i pogodilo;
  bonus onome ko pogodi celu reč (piše se u polje, rizik: pogrešno = preskačeš
  rundu).
- Sadržaj: postojeći packovi reči za Tajne agente se mogu ponovo iskoristiti.

## 4. Krokodil (zabranjene reči)

**Igrači:** 4–10 · **Trajanje:** ~8 min · **Hostless:** ne (potreban TV za tim)

Taboo: opisuješ pojam naglas dok tim pogađa, ali pet zabranjenih reči ne smeš
da izgovoriš. Protivnički tim gleda na svom telefonu listu zabranjenih i tapće
„PREKRŠAJ".

- **Telefon (opisivač):** pojam + zabranjene reči, dugme „POGODILI".
- **Telefon (protivnik):** iste reči + veliko crveno dugme za prekršaj.
- **TV:** tajmer, rezultat, i posle runde spisak pogodaka/prekršaja.
- **Zašto radi:** govor uživo je najjači deo društvene igre, a telefon služi
  samo kao tajni ekran i zvonce. Isti princip kao Gluvo doba.
- **Sadržaj:** novi pack format `{pojam, zabranjene[]}` — lak za admin editor.

---

**Preporuka iz ove grupe:** *Imena, gradovi, države* prvo — nula tehničkog
rizika, maksimalno prepoznavanje, i bodovanje po jedinstvenosti automatski
pravi napetost. Zatim *Krokodil*, jer donosi govor uživo koji nijedna
postojeća igra osim Gluvog doba ne koristi.
