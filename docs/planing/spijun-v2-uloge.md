# Špijun — v2 plan: specijalne / modifikator uloge

Ovaj dokument čuva ideje za drugu fazu igre **Špijun** (Spyfall, id `spijun`).
v1 je namerno bez specijalnih uloga — čist core loop (špijun vs selo, pomoćnik,
generator pitanja, optužba → odbrana → glasanje). Uloge ispod se dodaju tek
kad se v1 balans potvrdi kroz igranje.

## Princip ugradnje (kada dođe vreme)

- Po uzoru na Gluvo doba: uloge su **podaci**, ne if-grane — tabela
  `SPIJUN_SPECIAL_ROLES` u `packages/shared/src/games/spijun-roles.ts`
  (id, ime, opis, tim, modifikator-tekst za telefon).
- Deljenje uloga ide kroz `playerData` (anti-tell: svi ekrani vizuelno isti).
- Uključivanje preko toggle-ova na game-select ekranu ili kroz "mod" pack
  (kao `gluvoDobaPack`), poslato u `host:start-game` payloadu.

## Katalog uloga

### „Svedok saradnik" (Insajder)
Običan igrač koji zna lokaciju, ali na telefonu dobija: *„Znaš ko je špijun
(to je [Ime]). Pomozi mu da NE bude otkriven — ali ako tebe provale, obojica
gubite."*
**Balans:** za veće grupe (7+). Špijun dobija tajnog saveznika koji može da
povuče sumnju na sebe ili postavi glupo pitanje da skrene temu.
**Mehanika:** server bira insajdera i šalje mu špijunov id u `playerData`;
glasanje mora da podrži „provaljen insajder" ishod (dodatna faza ili opcija).

### „Dugoprstić" (Lopov informacija)
Ne zna lokaciju (drugi špijun), ali jednom u igri sme da klikne „Ukradi trag" —
telefon mu otkriva ulogu jednog nasumičnog igrača (npr. „Marko je 'Kuvar
kupusa'").
**Balans:** pomaže špijunskoj strani kad je baza lokacija velika — po ulozi
sužava izbor lokacija.
**Mehanika:** server akcija `spijun:steal-hint` (jednom po rundi), vraća
nasumičnu tuđu ulogu kroz `playerData`.

### „Mitrofan" (Pijani gost)
Zna lokaciju i ulogu, ali: *„Pijan si. Svaki tvoj odgovor mora da sadrži bar
jednu reč koja nema veze sa lokacijom (npr. 'bager', 'žirafa', 'sarma')."*
**Balans:** deluje kao špijun koji lupa — skreće pažnju sa pravog špijuna.
**Mehanika:** čist modifikator.

### „Lokalni diler" (Trgovac informacijama)
Zna lokaciju. Može da ponudi „u etar": *„Menjam deo istine za bodove."* Ako špijun
prihvati, diler dobija 25 poena od spijuna (spijun ih gubi, ili ide u -25), špijun dobija kategoriju lokacije (npr. „zatvoreni
prostor") ili jedno slovo.
**Balans:** vraća potpuno izgubljenog špijuna u igru, uz svesni rizik dilera.
**Mehanika:** dvosmerna ponuda/prihvatanje kroz server + kategorije lokacija u
bazi (`SpijunLocation.category`).

### „Bot" (Partijski vojnik)
Zadatak: *„Ko god postavi pitanje pre tebe, u odgovoru ga suptilno pohvali
('To je odlično pitanje, kolega…')."*
**Balans:** očigledna smešna šema skreće fokus sa lokacije na ponašanje.
**Mehanika:** čist modifikator.

### „Gastarbajter" (Zaboravio srpski)
*„Živiš u inostranstvu 10 godina. U svakom odgovoru bar jedna nemačka/engleska/strana reč ('Das ist
strašno', 'Ja, naravno', 'Katastrofe')."*
**Balans:** jezički humor + lažna sumnja, olakšava špijunu.
**Mehanika:** čist modifikator.

„Papagaj" — „U svakom svom odgovoru moraš da ponoviš ili parafraziraš deo PRETHODNOG odgovora ('Kao što reče Marko, gužva je...')."
Balans: zvuči kao špijun koji se šlepa na tuđe informacije — savršen gromobran.

„Turista" — zna lokaciju, ali ne dobija ulogu — mora da je improvizuje.
Balans: druga sumnjiva osoba u igri; pitanja tipa „šta ti tačno radiš ovde?" ga ruše iako nije špijun. Najbolji odnos zabave i cene: bukvalno se samo preskoči dodela uloge.

„Detektiv amater" — zna lokaciju; njegov rizik je udvostručen: ako on pokrene uspešnu optužbu, bonus je +400 umesto +200, ali ako njegova optužba padne (nevin izbačen ili glasanje propadne), špijun dobija duplo (+400).

„Provokator" — zna lokaciju + dobija tajnu metu: „Izvedi da se glasa o [Ime]." Ako do glasanja o toj osobi dođe (bez obzira na ishod), +150.
Balans: ubacuje optužbe koje NISU signal o špijunu — magla koja špijunu daje prostor. Server bira metu i boduje.

„Mamurluk" — zna lokaciju i ulogu, ali na pola runde telefon mu obriše ulogu (lokacija ostaje): „Zaboravio si šta si ovde radio..."
Balans: druga polovina runde mora da improvizuje dosledno onome što je već rekao — smešno i stvara laznu sumnju. Server: tajmirana izmena playerData (mehanika slična sub-phase-scoped peek u Zavetu).

„Duplikat" — dva špijuna koji ne znaju jedan za drugog (klasična Spyfall varijanta za velike grupe). Svaki misli da je jedini; mogu čak da optuže jedan drugog.
Balans: za 7-8 igrača gde jedan špijun prebrzo pada; izbacivanje jednog špijuna ne završava rundu (igra se nastavlja dok i drugi ne padne ili vreme istekne) — to traži izmenu fazne mašine, zato je najskuplja.

## Ostale v2 ideje

- Kategorije lokacija u bazi (zatvoreno/otvoreno, grad/selo) — preduslov za
  Dilera, a korisno i za špijunov pomoćnik (filter).
- Više rundi sa rotacijom špijuna uz garanciju da svako bude špijun bar jednom
  (kao `usedFakeIds` u Lažnom umetniku — v1 već rotira, ovo je samo tvrdo
  pravilo za "party" mod).
- „Rizikuj" opcija: uhvaćen špijun sme da pogodi lokaciju za spas (kao
  fake-guess redemption u Lažnom umetniku).
