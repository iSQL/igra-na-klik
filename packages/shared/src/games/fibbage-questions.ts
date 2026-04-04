import type { FibbageQuestion } from '../types/fibbage.js';

/**
 * Serbian (Latin script) Fibbage question bank.
 * Each answer must be real, verifiable, and surprising — never a joke or trick.
 * The fun comes from players' fakes being plausibly real.
 */
export const FIBBAGE_QUESTION_BANK: FibbageQuestion[] = [
  // Jezik / etimologija
  {
    id: 'sr-lang-1',
    text: "Kako se zvanično zove tačka iznad malog slova 'i' ili 'j'?",
    answer: 'titla',
    category: 'jezik',
  },
  {
    id: 'sr-lang-2',
    text: "Šta reč 'trotoar' izvorno znači na francuskom?",
    answer: 'mesto za kasanje',
    category: 'jezik',
  },
  {
    id: 'sr-lang-3',
    text: "Kako se naziva strah od dugačkih reči?",
    answer: 'hipopotomonstroseskvipedaliofobija',
    category: 'jezik',
  },
  {
    id: 'sr-lang-4',
    text: "Od koje reči potiče izraz 'robot'?",
    answer: 'robota (rad u češkom)',
    category: 'jezik',
  },
  {
    id: 'sr-lang-5',
    text: "Šta doslovno znači reč 'avgust' (kao ime meseca)?",
    answer: 'uzvišeni',
    category: 'jezik',
  },

  // Životinje
  {
    id: 'sr-animal-1',
    text: 'Koji je jedini sisar koji ne može da skoči?',
    answer: 'slon',
    category: 'životinje',
  },
  {
    id: 'sr-animal-2',
    text: 'Koliko srca ima hobotnica?',
    answer: '3',
    category: 'životinje',
  },
  {
    id: 'sr-animal-3',
    text: 'Kako se naziva grupa lavova?',
    answer: 'čopor',
    category: 'životinje',
  },
  {
    id: 'sr-animal-4',
    text: 'Koliko ždrebeta godišnje može da ima ženka kengura?',
    answer: '1',
    category: 'životinje',
  },
  {
    id: 'sr-animal-5',
    text: 'Koje boje je krv potkovice (račića)?',
    answer: 'plava',
    category: 'životinje',
  },
  {
    id: 'sr-animal-6',
    text: 'Koji se jedini ptica zna ponašati kao ptica grabljivica, a nije to?',
    answer: 'kukavica',
    category: 'životinje',
  },

  // Telo i medicina
  {
    id: 'sr-body-1',
    text: 'Koliko kostiju ima odrasla ljudska šaka (sa prstima i ručnim zglobom)?',
    answer: '27',
    category: 'telo',
  },
  {
    id: 'sr-body-2',
    text: 'Koji je najveći organ ljudskog tela?',
    answer: 'koža',
    category: 'telo',
  },
  {
    id: 'sr-body-3',
    text: 'Koliko mišića pokreće ljudsko oko?',
    answer: '6',
    category: 'telo',
  },
  {
    id: 'sr-body-4',
    text: 'Koja kost je najmanja u ljudskom telu?',
    answer: 'stremen',
    category: 'telo',
  },
  {
    id: 'sr-body-5',
    text: 'Koliko otprilike ukupnih ukusnih pupoljaka ima prosečan odrasli čovek?',
    answer: '10000',
    category: 'telo',
  },

  // Istorija
  {
    id: 'sr-hist-1',
    text: 'Koji grad je bio prva prestonica ujedinjene Italije (1861)?',
    answer: 'Torino',
    category: 'istorija',
  },
  {
    id: 'sr-hist-2',
    text: 'Koliko je dugo trajao najkraći rat u istoriji (Anglo-zanzibarski rat)?',
    answer: '38 minuta',
    category: 'istorija',
  },
  {
    id: 'sr-hist-3',
    text: 'Ko je bio prvi car Rimskog carstva?',
    answer: 'Oktavijan Avgust',
    category: 'istorija',
  },
  {
    id: 'sr-hist-4',
    text: 'Koje godine je prvi put patentiran šrafciger (odvijač)?',
    answer: '1744',
    category: 'istorija',
  },
  {
    id: 'sr-hist-5',
    text: 'U kom gradu je održana prva zimska olimpijada 1924. godine?',
    answer: 'Šamoni',
    category: 'istorija',
  },

  // Srpska istorija i geografija
  {
    id: 'sr-local-1',
    text: 'Koja je najstarija ulica u Beogradu?',
    answer: 'Cara Dušana',
    category: 'Srbija',
  },
  {
    id: 'sr-local-2',
    text: 'Kako se zove najviši vrh Srbije?',
    answer: 'Midžor',
    category: 'Srbija',
  },
  {
    id: 'sr-local-3',
    text: 'Koje godine je Beograd zvanično postao prestonica Kneževine Srbije?',
    answer: '1841',
    category: 'Srbija',
  },
  {
    id: 'sr-local-4',
    text: 'Koji je najduži tok reke kroz Srbiju?',
    answer: 'Velika Morava',
    category: 'Srbija',
  },
  {
    id: 'sr-local-5',
    text: 'Kako se zvao prvi srpski pisani zakonik?',
    answer: 'Dušanov zakonik',
    category: 'Srbija',
  },

  // Astronomija / nauka
  {
    id: 'sr-sci-1',
    text: 'Koliko je dug jedan dan na Veneri (u zemaljskim danima)?',
    answer: '243',
    category: 'nauka',
  },
  {
    id: 'sr-sci-2',
    text: 'Koji je najgušći prirodni element?',
    answer: 'osmijum',
    category: 'nauka',
  },
  {
    id: 'sr-sci-3',
    text: 'Koliko prstenova ima planeta Uran?',
    answer: '13',
    category: 'nauka',
  },
  {
    id: 'sr-sci-4',
    text: 'Koji je hemijski simbol za volfram?',
    answer: 'W',
    category: 'nauka',
  },

  // Hrana i piće
  {
    id: 'sr-food-1',
    text: 'Iz koje zemlje potiče kroasan (u svom današnjem obliku)?',
    answer: 'Austrija',
    category: 'hrana',
  },
  {
    id: 'sr-food-2',
    text: 'Koja začinska biljka je poznata kao „kralj začina"?',
    answer: 'biber',
    category: 'hrana',
  },
  {
    id: 'sr-food-3',
    text: 'Od koje biljke se dobija vanilija?',
    answer: 'orhideja',
    category: 'hrana',
  },
  {
    id: 'sr-food-4',
    text: 'U kom veku je prvi put pripremljen današnji espresso?',
    answer: '19. vek',
    category: 'hrana',
  },
];
