import { QUIZ_OPTION_COLORS } from '../types/quiz.js';
import type { QuizQuestionFull } from '../types/quiz.js';

function q(
  id: string,
  text: string,
  options: string[],
  correctIndex: number,
  timeLimit = 15
): QuizQuestionFull {
  return {
    id,
    text,
    options: options.map((t, i) => ({
      index: i,
      text: t,
      color: QUIZ_OPTION_COLORS[i],
    })),
    correctIndex,
    timeLimit,
  };
}

export const QUIZ_QUESTION_BANK: QuizQuestionFull[] = [
  q('1', 'Koja planeta je poznata kao Crvena planeta?', ['Venera', 'Mars', 'Jupiter', 'Saturn'], 1),
  q('2', 'Koliko nogu ima pauk?', ['6', '8', '10', '12'], 1),
  q('3', 'Koji je najveći okean na Zemlji?', ['Atlantski', 'Indijski', 'Arktički', 'Tihi'], 3),
  q('4', 'Koje godine je potonuo Titanik?', ['1905', '1912', '1920', '1898'], 1),
  q('5', 'Koji gas biljke upijaju iz atmosfere?', ['Kiseonik', 'Azot', 'Ugljen-dioksid', 'Vodonik'], 2),
  q('6', 'Koja zemlja ima najviše stanovnika?', ['SAD', 'Indija', 'Kina', 'Indonezija'], 1),
  q('7', 'Koji je najtvrđi prirodni materijal?', ['Zlato', 'Gvožđe', 'Dijamant', 'Kvarc'], 2),
  q('8', 'Koliko ima kontinenata?', ['5', '6', '7', '8'], 2),
  q('9', 'Koja je najmanja planeta u Sunčevom sistemu?', ['Mars', 'Merkur', 'Pluton', 'Venera'], 1),
  q('10', 'Koja je najviša životinja na svetu?', ['Slon', 'Žirafa', 'Konj', 'Kamila'], 1),
  q('11', 'Koju boju dobijaš mešanjem crvene i bele?', ['Ljubičasta', 'Narandžasta', 'Roze', 'Breskva'], 2),
  q('12', 'Koliko strana ima šestougao?', ['5', '6', '7', '8'], 1),
  q('13', 'Koja planeta ima najviše meseca?', ['Jupiter', 'Saturn', 'Uran', 'Neptun'], 1),
  q('14', 'Na kojoj temperaturi voda ključa (u Celzijusima)?', ['90°C', '95°C', '100°C', '110°C'], 2),
  q('15', 'Koji element ima hemijski simbol „O"?', ['Zlato', 'Osmijum', 'Kiseonik', 'Oganeson'], 2),
  q('16', 'U kom sportu se koristi loptica sa perjem (reket)?', ['Tenis', 'Badminton', 'Skvoš', 'Stoni tenis'], 1),
  q('17', 'Koja je najduža reka na svetu?', ['Amazon', 'Nil', 'Jangce', 'Misisipi'], 1),
  q('18', 'Koliko kostiju ima odrasla osoba?', ['186', '196', '206', '216'], 2),
  q('19', 'Koje godine je izašao prvi iPhone?', ['2005', '2006', '2007', '2008'], 2),
  q('20', 'Koji gas najviše ima u Zemljinoj atmosferi?', ['Kiseonik', 'Ugljen-dioksid', 'Azot', 'Argon'], 2),
  q('21', 'Koji je glavni grad Australije?', ['Sidnej', 'Melburn', 'Kanbera', 'Brizbejn'], 2),
  q('22', 'Koliko igrača ima u fudbalskom timu na terenu?', ['9', '10', '11', '12'], 2),
  q('23', 'Kolika je približno brzina svetlosti?', ['100.000 km/s', '200.000 km/s', '300.000 km/s', '400.000 km/s'], 2),
  q('24', 'Koji organ pumpa krv kroz telo?', ['Pluća', 'Mozak', 'Jetra', 'Srce'], 3),
  q('25', 'Koliko je kvadratni koren broja 144?', ['10', '11', '12', '14'], 2),
  q('26', 'Koji je glavni grad Srbije?', ['Novi Sad', 'Beograd', 'Niš', 'Kragujevac'], 1),
  q('27', 'Koja reka protiče kroz Beograd pored Save?', ['Drina', 'Morava', 'Dunav', 'Tisa'], 2),
  q('28', 'Ko je napisao „Gorski vijenac"?', ['Vuk Karadžić', 'Petar II Petrović Njegoš', 'Ivo Andrić', 'Branko Radičević'], 1),
  q('29', 'Koja je najveća država na svetu po površini?', ['Kina', 'SAD', 'Kanada', 'Rusija'], 3),
  q('30', 'Koliko minuta traje jedna polovina fudbalske utakmice?', ['30', '40', '45', '50'], 2),
];
