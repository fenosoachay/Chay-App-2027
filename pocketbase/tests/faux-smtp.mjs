#!/usr/bin/env node
// Faux serveur SMTP de test : écoute UNIQUEMENT sur 127.0.0.1, accepte tous les messages
// et les enregistre en fichiers .eml (aucun e-mail ne part réellement).
//   node pocketbase/tests/faux-smtp.mjs
// Port : FAUX_SMTP_PORT (défaut 2525). Dossier : FAUX_SMTP_DIR (défaut C:\PB-local\mails, hors dépôt).
// Le journal n'affiche ni adresse ni contenu : seulement un numéro de message.

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const PORT = Number(process.env.FAUX_SMTP_PORT || 2525);
const DIR = process.env.FAUX_SMTP_DIR || 'C:\\PB-local\\mails';
fs.mkdirSync(DIR, { recursive: true });
let count = 0;

const server = net.createServer((socket) => {
  let buffer = '';
  let inData = false;
  let data = [];
  let rcpt = [];
  const reply = (line) => socket.write(`${line}\r\n`);
  reply('220 faux-smtp.local ESMTP prêt');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let i;
    while ((i = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      if (inData) {
        if (line === '.') {
          inData = false;
          count += 1;
          const name = `${Date.now()}-${String(count).padStart(4, '0')}.eml`;
          const header = `X-Faux-Smtp-Rcpt: ${rcpt.join(', ')}\r\n`;
          fs.writeFileSync(path.join(DIR, name), header + data.join('\r\n'));
          console.log(`message n°${count} enregistré`);
          data = [];
          rcpt = [];
          reply('250 OK message enregistré');
        } else {
          data.push(line.startsWith('..') ? line.slice(1) : line);
        }
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO') { socket.write('250-faux-smtp.local\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n'); }
      else if (cmd === 'HELO') reply('250 faux-smtp.local');
      else if (cmd === 'MAIL') reply('250 OK');
      else if (cmd === 'RCPT') { rcpt.push((/<([^>]*)>/.exec(line) || [])[1] || ''); reply('250 OK'); }
      else if (cmd === 'DATA') { inData = true; reply('354 Fin des données par <CRLF>.<CRLF>'); }
      else if (cmd === 'RSET') { data = []; rcpt = []; reply('250 OK'); }
      else if (cmd === 'NOOP') reply('250 OK');
      else if (cmd === 'QUIT') { reply('221 Au revoir'); socket.end(); }
      else reply('502 Commande non prise en charge');
    }
  });
  socket.on('error', () => {});
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`faux SMTP à l'écoute sur 127.0.0.1:${PORT} ; messages dans ${DIR}`);
});
