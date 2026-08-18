// Rasterizes the brand mark (assets/ink-mark-*.svg) into every PNG/ICO the
// apps ship, then copies the result into the three places Express and Vite
// serve icons from. Run after changing the mark:
//
//   node scripts/build-brand-icons.mjs
//
// There is no image library in the dependency tree on purpose — the only
// rasterizer needed here is a browser, and every dev machine has one. Chrome
// is used headless; set CHROME_PATH if it lives somewhere unusual.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'assets')

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) throw new Error('No Chrome/Edge found. Set CHROME_PATH to a Chromium binary.')

const work = mkdtempSync(join(tmpdir(), 'ink-icons-'))

// size: output square in px. mark: fraction of the canvas the mark occupies
// (< 1 leaves the padding maskable icons and the iOS icon need).
function render(svg, out, { size, background = 'transparent', mark = 1 }) {
  const html = join(work, `${out.replace(/[^a-z0-9]+/gi, '-')}.html`)
  const svgUrl = pathToFileURL(join(assets, svg)).href
  const px = Math.round(size * mark)
  writeFileSync(
    html,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0}
body{width:${size}px;height:${size}px;background:${background};display:flex;align-items:center;justify-content:center;overflow:hidden}
img{width:${px}px;height:${px}px;display:block}
</style></head><body><img src="${svgUrl}"></body></html>`,
  )
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${join(work, out)}`,
    pathToFileURL(html).href,
  ], { stdio: 'pipe' })
  return join(work, out)
}

// PNG-in-ICO: the classic BMP payload is only needed for pre-Vista browsers,
// and the existing favicon.ico was already PNG-based.
function buildIco(entries, out) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = header.length + dir.length
  const payloads = []
  entries.forEach(({ size, file }, i) => {
    const png = readFileSync(file)
    const at = 16 * i
    dir.writeUInt8(size >= 256 ? 0 : size, at)
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1)
    dir.writeUInt8(0, at + 2)
    dir.writeUInt8(0, at + 3)
    dir.writeUInt16LE(1, at + 4)
    dir.writeUInt16LE(32, at + 6)
    dir.writeUInt32LE(png.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += png.length
    payloads.push(png)
  })
  writeFileSync(out, Buffer.concat([header, dir, ...payloads]))
}

const COLOR = 'ink-mark-color.svg'
const MONO = 'ink-mark-mono-navy.svg'
const CREAM = '#F5EBE0'

// 16px is the mono cut — five gold pixels of eye and mouth turn to mud at
// that size, so the single-ink version is the readable one.
const png512 = render(COLOR, 'ink-mark-512.png', { size: 512 })
const png180 = render(COLOR, 'apple-touch-icon.png', { size: 180, background: CREAM, mark: 0.9 })
const png48 = render(COLOR, 'favicon-48.png', { size: 48 })
const png32 = render(COLOR, 'favicon-32.png', { size: 32 })
const png16 = render(MONO, 'favicon-16.png', { size: 16 })
// Maskable PWA icons: Android may crop to a circle inscribed in the safe
// zone, so the mark sits at 74% on a full-bleed cream field.
const icon192 = render(COLOR, 'icon-192.png', { size: 192, background: CREAM, mark: 0.74 })
const icon512 = render(COLOR, 'icon-512.png', { size: 512, background: CREAM, mark: 0.74 })

copyFileSync(png512, join(assets, 'ink-mark-512.png'))
copyFileSync(png180, join(assets, 'apple-touch-icon.png'))
copyFileSync(png48, join(assets, 'favicon-48.png'))
copyFileSync(png32, join(assets, 'favicon-32.png'))
copyFileSync(png16, join(assets, 'favicon-16.png'))
copyFileSync(join(assets, 'ink-mark-color.svg'), join(assets, 'favicon.svg'))
buildIco([{ size: 16, file: png16 }, { size: 32, file: png32 }, { size: 48, file: png48 }], join(assets, 'favicon.ico'))

// Where the apps actually serve them from.
const FAVICON_SET = ['favicon.svg', 'favicon.ico', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png']
// The reverse mark rides along: the lobby and join headers render it from the
// bundle's own base URL, so each app needs its own copy in public/.
const SHORT_SET = ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'ink-mark-reverse.svg']
for (const [dir, files] of [
  [join(root, 'packages/server/assets/brand'), FAVICON_SET],
  [join(root, 'packages/host/public'), SHORT_SET],
  [join(root, 'packages/controller/public'), SHORT_SET],
]) {
  mkdirSync(dir, { recursive: true })
  for (const f of files) copyFileSync(join(assets, f), join(dir, f))
}
const icons = join(root, 'packages/controller/public/icons')
mkdirSync(icons, { recursive: true })
copyFileSync(icon192, join(icons, 'icon-192.png'))
copyFileSync(icon512, join(icons, 'icon-512.png'))

rmSync(work, { recursive: true, force: true })
console.log('Brand icons rebuilt from assets/ink-mark-*.svg')
