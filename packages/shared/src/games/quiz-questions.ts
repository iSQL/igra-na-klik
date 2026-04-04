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
  q('1', 'What planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Saturn'], 1),
  q('2', 'How many legs does a spider have?', ['6', '8', '10', '12'], 1),
  q('3', 'What is the largest ocean on Earth?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 3),
  q('4', 'In which year did the Titanic sink?', ['1905', '1912', '1920', '1898'], 1),
  q('5', 'What gas do plants absorb from the atmosphere?', ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'], 2),
  q('6', 'Which country has the most people?', ['USA', 'India', 'China', 'Indonesia'], 1),
  q('7', 'What is the hardest natural substance?', ['Gold', 'Iron', 'Diamond', 'Quartz'], 2),
  q('8', 'How many continents are there?', ['5', '6', '7', '8'], 2),
  q('9', 'What is the smallest planet in our solar system?', ['Mars', 'Mercury', 'Pluto', 'Venus'], 1),
  q('10', 'Which animal is the tallest in the world?', ['Elephant', 'Giraffe', 'Horse', 'Camel'], 1),
  q('11', 'What color do you get mixing red and white?', ['Purple', 'Orange', 'Pink', 'Peach'], 2),
  q('12', 'How many sides does a hexagon have?', ['5', '6', '7', '8'], 1),
  q('13', 'Which planet has the most moons?', ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], 1),
  q('14', 'What is the boiling point of water in Celsius?', ['90°C', '95°C', '100°C', '110°C'], 2),
  q('15', 'Which element has the chemical symbol "O"?', ['Gold', 'Osmium', 'Oxygen', 'Oganesson'], 2),
  q('16', 'In which sport is a shuttlecock used?', ['Tennis', 'Badminton', 'Squash', 'Table Tennis'], 1),
  q('17', 'What is the longest river in the world?', ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], 1),
  q('18', 'How many bones does an adult human have?', ['186', '196', '206', '216'], 2),
  q('19', 'What year was the first iPhone released?', ['2005', '2006', '2007', '2008'], 2),
  q('20', 'Which gas makes up most of Earth\'s atmosphere?', ['Oxygen', 'Carbon Dioxide', 'Nitrogen', 'Argon'], 2),
  q('21', 'What is the capital of Australia?', ['Sydney', 'Melbourne', 'Canberra', 'Brisbane'], 2),
  q('22', 'How many players are on a soccer team?', ['9', '10', '11', '12'], 2),
  q('23', 'What is the speed of light approximately?', ['100,000 km/s', '200,000 km/s', '300,000 km/s', '400,000 km/s'], 2),
  q('24', 'Which organ pumps blood through the body?', ['Lungs', 'Brain', 'Liver', 'Heart'], 3),
  q('25', 'What is the square root of 144?', ['10', '11', '12', '14'], 2),
];
