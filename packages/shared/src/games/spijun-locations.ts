import type { SpijunLocation } from '../types/spijun.js';

/**
 * Built-in Serbian location bank for Špijun (Spyfall-style). Each location
 * carries the roles dealt to non-spy players; if a game has more players
 * than roles, roles repeat. The whole location LIST is public in-game (like
 * the physical reference card) — only the active one is secret.
 *
 * ~25 locations is the sweet spot: under 15 the spy eliminates too easily,
 * over 40 the spy has no chance from subtle clues.
 */
export const SPIJUN_LOCATIONS: SpijunLocation[] = [
  {
    location: 'GSP autobus u špicu (linija 50)',
    roles: [
      'Vozač koji koči naglo',
      'Baba sa kolicima',
      'Student bez BusPlus-a',
      'Kontrolor',
      'Putnik priljubljen uz vrata',
    ],
  },
  {
    location: 'Srpska svadba pod šatrom',
    roles: [
      'Pijani teča',
      'Mladoženjin kum',
      'Fotograf koji prodaje slike',
      'Kuvarica kupusa',
      'Trubač',
    ],
  },
  {
    location: 'Čekaonica u Domu zdravlja',
    roles: [
      'Baba koja ide "samo da pita"',
      'Nervozna sestra na šalteru',
      'Hipohondar',
      'Doktor koji kasni sa pauze',
    ],
  },
  {
    location: 'Kafana u sitne sate',
    roles: [
      'Konobar koji ne donosi ceh',
      'Pevačica',
      'Lik koji spava na stolu',
      'Lik koji naručuje "onu našu"',
    ],
  },
  {
    location: 'Granični prelaz Preševo (sredina avgusta)',
    roles: [
      'Graničar',
      'Lik kome je prokuvao motor',
      'Švercer',
      'Porodica koja ide u Paraliju',
    ],
  },
  {
    location: 'Studentska menza',
    roles: [
      'Tetkica sa kutlačom',
      'Večiti student',
      'Brucoš koji ne zna gde je escajg',
      'Student koji krijumčari tuđu karticu',
    ],
  },
  {
    location: 'Slava kod domaćina',
    roles: [
      'Domaćin koji stalno sipa piće',
      'Pop koji je došao da sveti vodicu',
      'Gost koji drži politički govor',
      'Dete koje krade rusku salatu pre reda',
    ],
  },
  {
    location: 'Vikendica na Srebrnom jezeru',
    roles: [
      'Lik koji celog dana loži ćumur',
      'Onaj što pušta muziku sa telefona',
      'Ortak koji je zaboravio kupaći',
      'Roštilj-majstor sa pivom u ruci',
    ],
  },
  {
    location: 'Red ispred novog Lidla (otvaranje)',
    roles: [
      'Penzioner sa kolicima',
      'Obezbeđenje koje drži distancu',
      'Trudnica preko reda',
      'Profesionalni tapkaroš',
    ],
  },
  {
    location: 'Šalter u Pošti',
    roles: [
      'Radnica koja kuca jednim prstom',
      'Lik koji plaća 15 računa odjednom',
      'Nervozni penzioner',
      'Devojka koja šalje 5 paketa sa AliExpress-a',
    ],
  },
  {
    location: 'Autopijaca Bubanj Potok',
    roles: [
      'Kupac koji lupa po limariji',
      'Preprodavac ("vozila je baba u Nemačkoj")',
      'Lik koji prodaje pljeskavice pored puta',
      'Majstor sa dijagnostikom',
    ],
  },
  {
    location: 'Ispitni rok na fakultetu (ispred kabineta)',
    roles: [
      'Student koji uči iz skripte od 5 strana',
      'Apsolvent koji izlazi 15. put',
      'Dežurni asistent koji mrko gleda',
      'Prepisivač sa bubicom u uvetu',
    ],
  },
  {
    location: 'Gradilište (pored mešalice)',
    roles: [
      'Šef gradilišta koji pije kafu',
      'Majstor koji viče "dodaj taj džak"',
      'Fizikalac na suncu',
      'Komšija koji deli savete preko ograde',
    ],
  },
  {
    location: 'Tehnički pregled za auto',
    roles: [
      'Strogi kontrolor sa libelom',
      'Vlasnik krša koji se moli da prođe',
      'Majstor koji "šteluje farove" na licu mesta',
      'Komšija koji je došao da "pogura" papire',
    ],
  },
  {
    location: 'Seoska prodavnica (ispred koje se pije pivo)',
    roles: [
      'Lokalni filozof sa dvolitarkom',
      'Prodavačica koja piše veresiju u svesku',
      'Prolaznik koji žuri kući',
      'Seoska luda',
    ],
  },
  {
    location: 'Pečenjara na Ibarskoj magistrali',
    roles: [
      'Sekač pečenja sa satarom',
      'Gladni vozač kamiona',
      'Konobar koji briše sto prljavom krpom',
      'Putnik koji traži "samo reš kožicu"',
    ],
  },
  {
    location: 'Tehno žurka u magacinu',
    roles: [
      'DJ koji klima glavom',
      'Lik pored zvučnika koji je ogluveo',
      'Devojka koja traži izgubljeni telefon u mraku',
      'Obezbeđenje na ulazu',
    ],
  },
  {
    location: 'Šalter MUP-a (izdavanje dokumenata)',
    roles: [
      'Šalteruša ("Fali vam jedan papir")',
      'Trudnica koja čeka satima',
      'Lik koji je platio pogrešnu uplatnicu',
      'Besni građanin',
    ],
  },
  {
    location: 'Generalna proba KUD-a',
    roles: [
      'Koreograf koji viče "opet iz početka"',
      'Prva igračica u kolu',
      'Harmonikaš koji stalno greši ton',
      'Početnik koji se sapliće o opanke',
    ],
  },
  {
    location: 'Divlja plaža na reci',
    roles: [
      'Lik koji peca i psuje kupače',
      'Majka koja maže dete kremom faktor 50',
      'Klinac koji skače "bombe"',
      'Prodavac kuvanog kukuruza',
    ],
  },
  {
    location: 'Sajam knjiga (vikend)',
    roles: [
      'Kupac koji traži popust na enciklopediju',
      'Pisac kog niko ne zna a potpisuje knjige',
      'Student koji je došao samo zbog atmosfere',
      'Prodavac na štandu',
    ],
  },
  {
    location: 'Parking ispred zgrade (nedelja ujutru)',
    roles: [
      'Lik koji pere auto crevom sa prvog sprata',
      'Komšinica koja gleda kroz prozor',
      'Komunalni policajac koji piše kaznu',
      'Nervozni vozač koji ne može da izađe',
    ],
  },
  {
    location: 'Sastanak kućnog saveta',
    roles: [
      'Upravnik zgrade koji drži slovo',
      'Komšija koji neće da plati popravku krova',
      'Penzionerka koja zapisuje ko dolazi kasno',
      'Podstanar koji ćuti',
    ],
  },
  {
    location: 'Buvljak (KupujemProdajem uživo)',
    roles: [
      'Lik koji prodaje stare daljinske',
      'Baka koja prodaje štrikane čarape',
      'Kupac koji se cenjka za 50 dinara',
      'Policajac u civilu',
    ],
  },
  {
    location: 'Priprema zimnice u dvorištu',
    roles: [
      'Baka koja ljušti pečene paprike',
      'Deda koji loži smederevac',
      'Unuk koji mora da melje paradajz',
      'Komšija koji je došao "samo da proba"',
    ],
  },
  {
    location: 'Teretana u podrumu',
    roles: [
      'Lik koji radi samo biceps ispred ogledala',
      'Iskusni trener koji "sve zna"',
      'Lik koji uzdiše preglasno',
      'Početnik sa praznom šipkom',
    ],
  },
];

/**
 * Question templates for the controller's "Generator pitanja" — a random
 * co-player's name replaces `{ime}`. Deliberately answerable at ANY location
 * so they never leak the secret.
 */
/**
 * Question generator — two decks, both purely local on the phone (nothing is
 * sent over the wire, so tapping either never singles out the spy).
 *
 * `SPIJUN_QUESTION_TEMPLATES` are SAFE: answerable from atmosphere alone, so
 * a lost spy can ask one without exposing themselves. `SPIJUN_SHARP_QUESTION_TEMPLATES`
 * are SHARP: they demand a concrete detail of the place or of the answerer's
 * role, which is exactly what a spy cannot invent — but they also give away a
 * lot to a listening spy, so asking one is a trade.
 */
export const SPIJUN_QUESTION_TEMPLATES: string[] = [
  'Pitaj {ime}: Kako si se obukao/la za ovo mesto?',
  'Pitaj {ime}: Kakav je ovde miris?',
  'Pitaj {ime}: Koliko često dolaziš ovde?',
  'Pitaj {ime}: Da li bi poveo/la decu ovde?',
  'Pitaj {ime}: Koliko je ovde bučno?',
  'Pitaj {ime}: Šta si poneo/la sa sobom?',
  'Pitaj {ime}: Koliko para ti treba za ovo mesto?',
  'Pitaj {ime}: Kad si zadnji put bio/la ovde?',
  'Pitaj {ime}: Da li ovde ima gužve?',
  'Pitaj {ime}: Šta ti se ovde najviše sviđa?',
  'Pitaj {ime}: Koga si sve video/la ovde?',
  'Pitaj {ime}: Da li se ovde nešto jede?',
  'Pitaj {ime}: Kako si došao/la dovde?',
  'Pitaj {ime}: Da li bi radio/la ovde?',
  'Pitaj {ime}: U koje doba dana je ovde najgore?',
  'Pitaj {ime}: Da li ti je ovde toplo ili hladno?',
  'Pitaj {ime}: Koliko dugo planiraš da ostaneš?',
  'Pitaj {ime}: Da li si ovde svojom voljom?',
  'Pitaj {ime}: Da li bi ovde poveo/la svekrvu?',
  'Pitaj {ime}: Ima li ovde nešto što te nervira?',
  'Pitaj {ime}: Da li se ovde može sesti?',
  'Pitaj {ime}: Da li bi se ovde slikao/la za Instagram?',
  'Pitaj {ime}: Koliko je ovde čisto, od 1 do 10?',
  'Pitaj {ime}: Da li ti ovde treba jakna?',
  'Pitaj {ime}: Da li si ovde nekad nekog izgubio/la?',
  'Pitaj {ime}: Ima li ovde muzike?',
  'Pitaj {ime}: Da li bi ovde prespavao/la ako moraš?',
  'Pitaj {ime}: Šta bi prvo uradio/la kad izađeš odavde?',
  'Pitaj {ime}: Da li se ovde čeka u redu?',
  'Pitaj {ime}: Koliko je ovde svetlo?',
  'Pitaj {ime}: Da li bi ovde došao/la i zimi?',
  'Pitaj {ime}: Da li si ovde ikad bio/la ljut/a?',
  'Pitaj {ime}: Da li bi ovde poveo/la psa?',
  'Pitaj {ime}: Ima li ovde nekog ko te gleda popreko?',
  'Pitaj {ime}: Da li bi platio/la duplo da ne moraš ovde?',
  'Pitaj {ime}: Koliko ljudi je oko tebe u ovom trenutku?',
  'Pitaj {ime}: Da li ti je ovde neprijatno?',
  'Pitaj {ime}: Da li se ovde puši?',
  'Pitaj {ime}: Kakav je ovde pod pod nogama?',
  'Pitaj {ime}: Da li bi ovo mesto preporučio/la nekome?',
];

/**
 * The sharp deck — a spy who asks one of these risks being asked back.
 */
export const SPIJUN_SHARP_QUESTION_TEMPLATES: string[] = [
  'Pitaj {ime}: Šta TAČNO ti ovde radiš?',
  'Pitaj {ime}: Ko je ovde glavni i zašto baš on/ona?',
  'Pitaj {ime}: Opiši mi šta ti je trenutno u rukama.',
  'Pitaj {ime}: Šta vidiš kad se okreneš levo?',
  'Pitaj {ime}: Koliko je moja uloga ovde važnija od tvoje?',
  'Pitaj {ime}: Šta je ovde strogo zabranjeno?',
  'Pitaj {ime}: Kome bi se ovde požalio/la ako nešto krene loše?',
  'Pitaj {ime}: Šta bi ukrao/la odavde da niko ne gleda?',
  'Pitaj {ime}: Koji je najgori mogući scenario na ovom mestu?',
  'Pitaj {ime}: Da li si ti ovde plaćen/a ili plaćaš?',
  'Pitaj {ime}: Šta ti treba da bi obavio/la svoj posao ovde?',
  'Pitaj {ime}: Ko bi ovde primetio da si nestao/la?',
  'Pitaj {ime}: Šta bi ti nedostajalo da ovog mesta nema?',
  'Pitaj {ime}: Kako se ulazi ovde — plaća se, čeka se, zove se?',
  'Pitaj {ime}: Šta je prva stvar koju čuješ kad stigneš ovde?',
  'Pitaj {ime}: Da li bi mogao/la da radiš moj posao ovde?',
  'Pitaj {ime}: Koga bi od nas prvog izbacili odavde?',
  'Pitaj {ime}: Šta je ovde najskuplje?',
  'Pitaj {ime}: Da li se ovde nosi nešto posebno na sebi?',
  'Pitaj {ime}: Koliko ti treba da odavde stigneš do izlaza?',
];
