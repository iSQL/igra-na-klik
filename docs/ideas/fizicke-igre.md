# Fizičke igre — soba kao deo igre

Druga potpuno prazna kategorija. Sve postojeće igre se dešavaju **na ekranima**;
ovde se dešavaju **u sobi**, a telefon je samo tajni ekran, tajmer i sudija.
Zato su tehnički najjeftinije igre na celoj listi, a po utisku najjače —
isti princip zbog kog Gluvo doba radi.

---

## 5. Pantomima ⭐

**Igrači:** 3–10 · **Trajanje:** ~8 min · **Hostless:** može · **Trud:** mali

Jedan glumi pojam bez reči i zvuka, ostali kucaju/tapću pogađanje na telefonu.
Rotacija kao kod Crtaj i pogodi — modul se praktično prepisuje, samo se
zameni platno sobom.

- **Telefon (glumac):** pojam + „PREDAJEM" dugme.
- **Telefon (ostali):** polje za pogađanje sa istim fuzzy poređenjem koje već
  postoji (`checkEmojiGuess` iz kviza tolerише dijakritiku i sitne greške).
- **TV:** tajmer, ko glumi, i pogoci koji ulete kako stižu.
- **Bodovanje:** identično Crtaj i pogodi — brži pogodak više poena, glumac
  dobija po pogotku.
- **Sadržaj:** postojeća banka reči za crtanje (`draw-words.ts`) radi odmah,
  uz dodatak težih pojmova (glagoli, filmovi, poslovice).

## 6. Foto izazov ⭐⭐

**Igrači:** 3–10 · **Trajanje:** ~10 min · **Hostless:** ne · **Trud:** srednji

Zadatak tipa „nađi nešto okruglo", „najružniji predmet u kući", „nešto starije
od tebe". Svi jure po stanu i slikaju telefonom. Slike se pojave na TV-u, pa
se glasa za najbolju.

- **Zašto baš ova:** kontroler **već ima `exifr`** u zavisnostima i postoji
  `PhotoFrame` komponenta — znači kamera i prikaz slika su već rešeni problemi.
- **Tehnički rizik:** veličina slike. Socket poruke su ograničene na 512KB
  (`maxHttpBufferSize`), pa se **mora smanjiti na klijentu** pre slanja
  (canvas → JPEG ~1200px, kvalitet 0.7). To je jedini pravi posao ovde.
- **Privatnost:** slike žive u memoriji sobe i brišu se sa igrom — ne pisati
  ih na disk. Vredi i reći igračima u pravilima.
- **Bodovanje:** glasovi drugih (ne možeš za sebe), bonus za najbrže predatu.
- **Diplome:** „Paparaco" (najviše glasova), „Fotograf iz 2003" (najmutnija).

## 7. Pogodi pesmu

**Igrači:** 3–10 · **Trajanje:** ~7 min · **Hostless:** može · **Trud:** mali

Jedan igrač dobije naslov pesme na telefon i **peva/pevuši je naglas** (bez
teksta — samo melodija), ostali pogađaju. Isti skelet kao Pantomima.

- Varijanta koja je još smešnija: **samo ritam**, kucanjem po stolu.
- Sadržaj: pack sa domaćim i stranim hitovima, po decenijama — savršeno za
  admin editor i za pravljenje „ekipnih" packova.

## 8. Statue / Ne mrdaj

**Igrači:** 4–12 · **Trajanje:** ~5 min · **Hostless:** ne · **Trud:** srednji

TV pusti muziku i odbrojava; kad stane, svi moraju da se zamrznu. Telefon
meri pokret preko akcelerometra — ko se pomerio, ispada.

- **Ograničenje:** akcelerometar na iOS-u traži HTTPS i dozvolu (vidi
  [README](README.md)). Za razliku od nagiba, ovde je *odsustvo* pokreta ono
  što se meri, pa uređaj bez dozvole jednostavno ne može da igra — treba
  fallback: telefon se odloži i sudi soba, ili se igra samo na LAN-u sa HTTPS.
- Zbog tog ograničenja ide poslednja u ovoj grupi, iako je koncept odličan.

---

**Preporuka iz ove grupe:** *Pantomima* je najjeftinija (Crtaj i pogodi sa
zamenjenim ulazom), a *Foto izazov* je najveći skok u novom osećaju igre i
jedina koja koristi kameru koju svi već drže u ruci.
