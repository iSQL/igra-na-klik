// Renderuje HTML reel (docs/marketing/reels/*.html) u MP4, kadar po kadar.
//
//   npm run reel -- docs/marketing/reels/uvod.html            -> uvod.mp4 pored html-a
//   npm run reel -- docs/marketing/reels/uvod.html out.mp4 60  -> drugi izlaz i fps
//
// Ne snima ekran u realnom vremenu: stranica izlaze window.renderAt(t) koji pauzira sve
// animacije i postavi ih na trenutak t, pa snimak nema seckanja ni na sporoj masini i
// svaki put ispadne isti. Ugovor stranice je opisan u .claude/skills/instagram-reel/SKILL.md.
//
// puppeteer-core ne skida svoj Chromium, koristi instalirani Chrome ili Edge
// (ili CHROME_PATH); ffmpeg mora biti na PATH-u.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , inputArg, outputArg, fpsArg] = process.argv;
if (!inputArg) {
  console.error('Upotreba: npm run reel -- <reel.html> [izlaz.mp4] [fps]');
  process.exit(1);
}
const input = resolve(inputArg);
const output = resolve(outputArg ?? input.replace(/\.html$/, '.mp4'));
const FPS = Number(fpsArg ?? 30);
const WIDTH = 1080;
const HEIGHT = 1920;

const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(p => p && existsSync(p));
if (!executablePath) {
  console.error('Nije nadjen Chrome ni Edge, postavi CHROME_PATH.');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.error('Greska na stranici:', e.message));
// #render kaze stranici da ne pusta animaciju sama, vreme vodi ova skripta
await page.goto(pathToFileURL(input).href + '#render', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);

const total = await page.evaluate(() => window.TOTAL);
if (typeof total !== 'number' || !(await page.evaluate(() => typeof window.renderAt === 'function'))) {
  console.error('Stranica ne izlaze window.TOTAL i window.renderAt(t), vidi SKILL.md.');
  await browser.close();
  process.exit(1);
}
const frames = Math.ceil(total * FPS);

const ff = spawn('ffmpeg', [
  '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow',
  '-movflags', '+faststart', output,
], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let i = 0; i < frames; i++) {
  await page.evaluate(t => window.renderAt(t), i / FPS);
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % FPS === 0) process.stdout.write(`\r${Math.round((i / frames) * 100)}%`);
}
ff.stdin.end();
const code = await new Promise(r => ff.on('close', r));
await browser.close();
if (code !== 0) process.exit(code);
console.log(`\rGotovo: ${output} (${total.toFixed(1)} s, ${frames} kadrova, ${FPS} fps)`);
