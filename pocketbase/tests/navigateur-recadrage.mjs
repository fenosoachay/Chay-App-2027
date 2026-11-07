// Recadrage fait par un VRAI navigateur (Chrome ou Edge sans interface), avec le vrai src/lib/imageCrop.js :
// 1. le navigateur fabrique une « photo » JPEG de quelques centaines de Ko (canvas.toBlob) ;
// 2. il la recadre comme le bouton « Rogner » d'ImageCrop (cropGeometry + renderCropToBlob).
// Aucun réseau : page locale (file://), module chargé en data:. Navigateur : variable CHROME_PATH, sinon chemins usuels.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const MODULE = path.join(ICI, '..', '..', 'src', 'lib', 'imageCrop.js');
const CANDIDATS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

export const navigateur = () => CANDIDATS.find((p) => fs.existsSync(p)) || null;

/**
 * @param {{ aspect: number, srcW?: number, srcH?: number, zoom?: number, offset?: {x:number,y:number} }} o
 * @returns {{ source: Buffer, crop: Buffer }} deux JPEG produits par le navigateur
 */
export function recadrerDansNavigateur({ aspect, srcW = 1600, srcH = 1200, zoom = 1.25, offset = { x: -30, y: 15 } }) {
  const exe = navigateur();
  if (!exe) throw new Error('Chrome ou Edge introuvable (définir CHROME_PATH)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-recadrage-'));
  const mod = Buffer.from(fs.readFileSync(MODULE, 'utf8')).toString('base64');
  const html = `<!doctype html><meta charset="utf-8"><body><pre id="r">attente</pre><script type="module">
const out = document.getElementById('r');
try {
  const m = await import('data:text/javascript;base64,${mod}');
  const W = ${srcW}, H = ${srcH};
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const px = ctx.createImageData(W, H);
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = rnd() * 70;
    px.data[i] = (x * 255 / W + n) | 0; px.data[i + 1] = (y * 255 / H + n) | 0; px.data[i + 2] = (128 + n) | 0; px.data[i + 3] = 255;
  }
  ctx.putImageData(px, 0, 0);
  const photo = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8));
  const im = await m.loadImage(URL.createObjectURL(photo));
  const vpW = 280, vpH = Math.round(vpW / ${aspect});
  const g = m.cropGeometry({ natural: { w: im.naturalWidth, h: im.naturalHeight }, vpW, vpH, zoom: ${zoom}, offset: ${JSON.stringify(offset)} });
  const crop = await m.renderCropToBlob(im, g.source, ${aspect});
  const b64 = (b) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(b); });
  out.textContent = JSON.stringify({ source: await b64(photo), crop: await b64(crop), cropType: crop.type });
} catch (e) { out.textContent = 'ERREUR ' + e; }
</script>`;
  const page = path.join(dir, 'recadrage.html');
  fs.writeFileSync(page, html);
  try {
    const dom = execFileSync(exe, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--user-data-dir=${path.join(dir, 'profil')}`, '--virtual-time-budget=20000', '--dump-dom', `file:///${page.replace(/\\/g, '/')}`,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
    const txt = (/<pre id="r">([\s\S]*?)<\/pre>/.exec(dom) || [])[1] || '';
    if (!txt.startsWith('{')) throw new Error(`navigateur : ${txt.slice(0, 200) || 'pas de résultat'}`);
    const r = JSON.parse(txt);
    if (r.cropType !== 'image/jpeg') throw new Error(`type du recadrage : ${r.cropType}`);
    return { source: Buffer.from(r.source, 'base64'), crop: Buffer.from(r.crop, 'base64') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Largeur et hauteur d'un JPEG (segment SOF). */
export function tailleJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
