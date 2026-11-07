// PocketBase JETABLE pour les tests : dossier de données temporaire, port libre (jamais 8090 ni 8092).
// Avant `serve`, un superuser est créé en ligne de commande (`superuser upsert`) avec un mot de passe aléatoire
// gardé en mémoire seulement (jamais affiché ni écrit) : PocketBase n'affiche donc pas de lien d'installation
// « pbinstall » et n'ouvre pas d'onglet de navigateur. Si un tel lien apparaît malgré tout, l'instance est
// arrêtée aussitôt et une erreur est levée.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const PB_BIN = process.env.PB_BIN || (process.platform === 'win32' ? 'C:\\PB-local\\bin\\pocketbase.exe' : 'pocketbase');
const INTERDITS = new Set([8090, 8091, 8092]);

async function portLibre() {
  for (;;) {
    const port = await new Promise((ok, ko) => {
      const s = net.createServer().once('error', ko).listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
    });
    if (!INTERDITS.has(port)) return port;
  }
}

/**
 * Démarre une instance jetable et attend « Server started ».
 * dataDir : dossier de données EXISTANT (ex. sauvegarde décompressée dans un dossier temporaire) ; il est
 * supprimé à l'arrêt comme le dossier créé ici. Sans dataDir : dossier vide neuf.
 * @param {{ hooksDir?: string, dataDir?: string, env?: Record<string,string>, timeoutMs?: number }} o
 * @returns {Promise<{ url: string, dir: string, sortie: () => string, superuser: { email: string, password: string }, stop: () => Promise<void> }>}
 */
export async function demarrerJetable({ hooksDir, dataDir, env = {}, timeoutMs = 20000 } = {}) {
  const dir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'chay-pb-jetable-'));
  const superuser = { email: `jetable-${crypto.randomBytes(4).toString('hex')}@chay.test`, password: crypto.randomBytes(24).toString('base64url') };
  const fullEnv = { ...process.env, ...env };

  // 1. Superuser créé AVANT le démarrage (pas de lien d'installation). Sortie non affichée.
  const up = spawnSync(PB_BIN, ['superuser', 'upsert', superuser.email, superuser.password, `--dir=${dir}`], { env: fullEnv, encoding: 'utf8', timeout: 60000 });
  if (up.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`superuser upsert : échec (code ${up.status})`);
  }

  // 2. Démarrage.
  const port = await portLibre();
  const args = ['serve', `--http=127.0.0.1:${port}`, `--dir=${dir}`];
  if (hooksDir) args.push(`--hooksDir=${hooksDir}`);
  const child = spawn(PB_BIN, args, { env: fullEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '';
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((ok) => { child.once('exit', ok); setTimeout(ok, 5000); });
    }
    for (let i = 0; i < 10; i++) {
      try { fs.rmSync(dir, { recursive: true, force: true }); break; } catch { await new Promise((ok) => setTimeout(ok, 300)); }
    }
  };
  await new Promise((ok, ko) => {
    const timer = setTimeout(() => ko(new Error('PocketBase jetable : démarrage trop long')), timeoutMs);
    const onData = (d) => {
      out += d.toString();
      if (/pbinstall/i.test(out)) { clearTimeout(timer); ko(new Error('lien d\'installation pbinstall affiché : instance arrêtée')); }
      else if (/Server started/.test(out)) { clearTimeout(timer); ok(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => { clearTimeout(timer); ko(new Error(`PocketBase jetable arrêté (code ${code})`)); });
  }).catch(async (err) => { await stop(); throw err; });

  return { url: `http://127.0.0.1:${port}`, dir, sortie: () => out, superuser, stop };
}
