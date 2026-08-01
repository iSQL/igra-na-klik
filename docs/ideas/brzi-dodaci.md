# Brzi dodaci — tri male igre bez nove infrastrukture

**Tier 1.** Sve tri rade na današnjem event modelu (1s tick, `game:player-action`),
bez three.js i bez brze petlje. Svaka je posao od jednog sedenja i služi kao
kratka pauza između dugih igara (Gluvo doba, Zavet).

---

## 1. Uže — potezanje konopca

**Igrači:** 4–12 (dva tima) · **Trajanje:** ~4 min · **Hostless:** može

Dva tima mlate po ekranu telefona; konopac na TV-u se pomera ka timu koji
brže tapće. Fizički bučno, nula pravila za objašnjavanje.

- **TV:** konopac sa markerom u sredini, dve strane u bojama timova, granica
  pobede na krajevima. Trese se proporcionalno intenzitetu.
- **Telefon:** jedno ogromno dugme preko celog ekrana. Haptika na svaki tap.
- **Server:** broji tapove u prozorima od 200ms, pomera marker za razliku
  **normalizovanu po broju igrača u timu** — inače tim sa više ljudi uvek dobija.
- **Bodovanje:** poeni celom pobedničkom timu + individualno po broju tapova.
- **Rizik:** rate limit je 60/s po socketu, a brz tapkač ide do ~10/s — u redu.
  Ali ne slati po događaj: grupisati tapove i slati broj na svakih 200ms.
- **Diplome:** „Motor" (najviše tapova), „Turista" (najmanje).

---

## 2. Refleks duel — ko pre tapne

**Igrači:** 2–12 · **Trajanje:** ~4 min · **Hostless:** može

TV odbrojava, pa u nasumičnom trenutku da signal. Prvi koji tapne nosi poen.
Tap pre signala = falstart i gubitak runde.

- **TV:** velik znak koji menja boju; posle runde poredak reakcija u ms
  („Marko 214ms, Ana 260ms…") — taj spisak je pola zabave.
- **Telefon:** prazan ekran koji je ceo dugme.
- **Server:** meri vreme od emitovanja signala do prijema akcije. Zbog mreže
  meri se **serverski**, svima isto — nije savršeno fer prema sporijoj vezi,
  ali je jedini pošten izbor bez klijentskih satova.
- **Bodovanje:** poeni po plasmanu u rundi, falstart = 0.
- **Rizik:** signal mora ići svima u istom `emit`-u; ne raditi per-socket petlju
  sa poslom između, jer to samo po sebi pravi razliku od nekoliko ms.
- **Diplome:** „Najbrži prst" (postoji u katalogu), „Falstart" (nova).

---

## 3. Ritam — tapkanje u taktu

**Igrači:** 2–8 · **Trajanje:** ~6 min · **Hostless:** ne (TV nosi ritam)

Note se spuštaju po TV-u u taktu, igrači tapću kad note stignu do linije.

- **TV:** 3–4 kolone nota, linija pogotka, kombo brojač po igraču.
- **Telefon:** 3–4 dugmeta koja odgovaraju kolonama.
- **Ključna odluka:** **ocenjivanje ide na telefonu**, ne na serveru. Klijent
  dobije raspored nota unapred (za celu pesmu), meri lokalno u odnosu na
  sopstveni sat usidren na početak, i šalje **rezultat po taktu** — ne po noti.
  Time mrežni drhtaj ne može da pokvari ni jednu notu.
- **Bodovanje:** tačnost × kombo. Server prima agregat i sabira.
- **Rizik:** ovo je jedini dizajn ovde koji veruje klijentu. Prihvatljivo za
  društvenu igru; ako smeta, ograniči prijavljeni rezultat na teorijski
  maksimum po taktu.
- **Muzika:** postojeći `SoundManager` generiše tonove kroz Web Audio bez
  fajlova — dovoljno za metronom i prostu melodiju, bez novih asseta.
