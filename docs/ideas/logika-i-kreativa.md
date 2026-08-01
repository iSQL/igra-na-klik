# Logika, pamćenje i kreativa

Ostatak preporuka: dve iz Slagalice (uz Asocijacije koje već postoje), dve
logičke i dve u kojima igrači sami prave sadržaj.

---

## 12. Skočko ⭐

**Igrači:** 2–8 · **Trajanje:** ~6 min · **Hostless:** može · **Trud:** mali

Mastermind iz Slagalice: pogodi kombinaciju od 4 simbola iz 6 mogućih, uz
povratnu informaciju „koliko na mestu / koliko promašeno mesto". Svi igraju
**istu kombinaciju istovremeno na svom telefonu**, ko pre razbije nosi više.

- **Zašto je odlična ovde:** čista logika, nula sadržaja za pisanje
  (kombinacija je nasumična), prepoznatljiva svima, a bodovanje po broju
  pokušaja je prirodno.
- **TV:** mreža pokušaja po igraču — vidi se ko je blizu, bez otkrivanja šta je
  tačno pogodio.
- **Anti-leak:** rezultati poređenja idu **samo tom igraču** kroz `playerData`.

## 13. Moj broj

**Igrači:** 2–8 · **Trajanje:** ~6 min · **Hostless:** može · **Trud:** srednji

Šest brojeva, jedan trocifreni cilj, četiri operacije. Ko se najviše približi.

- **TV:** brojevi i cilj ogromni, na kraju najbolje rešenje po igraču.
- **Telefon:** tapkanje brojeva i operacija (kalkulator koji ne dozvoljava
  nevalidan izraz), sa „PONIŠTI" korakom.
- **Rizik:** unos izraza na telefonu je najteži deo — ne dozvoliti slobodno
  kucanje, nego gradnju korak po korak (broj, operacija, broj → međurezultat
  postaje nov dostupan broj). Server proverava da su svi korišćeni brojevi
  zaista bili ponuđeni.
- Server računa i najbolje moguće rešenje da TV može da pokaže „moglo je tačno".

## 14. Pamti niz (Simon)

**Igrači:** 2–10 · **Trajanje:** ~5 min · **Hostless:** ne · **Trud:** mali

TV pušta niz boja/zvukova koji raste, svi ga ponavljaju na telefonu.
Ko pogreši — ispada iz runde. Traje dok ostane jedan.

- Najlakša igra na celoj listi za implementaciju.
- `SoundManager` već generiše tonove bez fajlova, pa svaka boja ima svoj ton.
- **Rizik:** dosadi posle 3 runde — držati je kao kratku pauzu (5 min), ne kao
  glavnu igru.

## 15. Ko je ovo napisao

**Igrači:** 4–10 · **Trajanje:** ~8 min · **Hostless:** može · **Trud:** srednji

Svi odgovore na isto lično pitanje („najgori savet koji si dobio"), pa se
odgovori pokažu izmešani i **pogađa se ko je šta napisao**.

- Rođak je Ko sam ja, ali obrnut: tamo se pogađa *odgovor*, ovde *autor*.
  Dovoljno različito da se ne preklapa, i mnogo bolje radi u društvu koje se
  dobro poznaje.
- **Bodovanje:** poeni za svako tačno spajanje + poeni onome koga niko nije
  pogodio.
- Sadržaj: pitanja se mogu deliti sa `ko-sam-ja-packs` formatom.

## 16. Prodaj mi ovo

**Igrači:** 3–8 · **Trajanje:** ~8 min · **Hostless:** ne · **Trud:** mali

Svako dobije apsurdan predmet („polovna čačkalica", „kilo magle") i ima 30
sekundi da ga **naglas** proda sobi. Ostali glasaju za najbolju reklamu.

- Kao Krokodil, telefon je samo tajni ekran i tajmer — govor uživo nosi igru.
- **Bodovanje:** glasovi (ne možeš za sebe). Isti obrazac glasanja koji već
  postoji u Lažovu.
- **Rizik:** stidljivo društvo. Vredi dati opciju „preskačem" bez kazne.

---

**Preporuka iz ove grupe:** *Skočko* — logika, nula sadržaja za pisanje,
prepoznatljiva, i savršeno se uklapa u anti-leak model platforme.
