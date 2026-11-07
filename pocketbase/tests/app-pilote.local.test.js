// Parcours de l'app (Communauté, section Requêtes de l'accueil) avec le VRAI
// adaptateur et le VRAI SDK PocketBase, contre le bac à sable local.
// Reproduit la logique de src/pages/Community.jsx et src/components/home/RequestsSection.jsx.
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const credFile = process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt';
const creds = Object.fromEntries(fs.readFileSync(credFile, 'utf8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password] = l.split('\t'); return [k, { email, password }]; }));

const newClient = () => {
  const pb = new PocketBase(BASE);
  pb.autoCancellation(false);
  return createPocketBaseAdapter(pb, { baseUrl: BASE });
};

// src/pages/Community.jsx (chargement de l'annuaire)
async function loadCommunityUsers(base44) {
  try {
    const result = await base44.functions.invoke('listCommunityUsers', {});
    const list = result?.data?.users;
    if (!Array.isArray(list)) throw new Error(result?.data?.error || 'Réponse invalide du serveur.');
    return { users: list, usersError: '' };
  } catch (error) {
    return { users: [], usersError: error?.message || 'Erreur inconnue.' };
  }
}

// src/components/home/RequestsSection.jsx (compteur de prières en attente)
async function loadPendingCount(base44) {
  try {
    const res = await base44.functions.invoke('getPrayerWall', {});
    return res?.data?.count || res?.data?.items?.length || 0;
  } catch {
    return 0;
  }
}

describe('app en mode PocketBase (bac à sable)', () => {
  let membre;
  let anonyme;

  beforeAll(async () => {
    membre = newClient();
    const login = await membre.auth.loginViaEmailPassword(creds.membre.email, creds.membre.password);
    expect(login.access_token).toBeTruthy();
    anonyme = newClient();
  });

  it('auth.me() du membre : utilisateur au format Base44', async () => {
    const me = await membre.auth.me();
    expect(me).toMatchObject({ role: 'user' });
    expect(me).toHaveProperty('full_name');
    expect(me).toHaveProperty('created_date');
    expect(me).not.toHaveProperty('collectionId');
  });

  it('Communauté : la liste des utilisateurs se charge pour un membre', async () => {
    const { users, usersError } = await loadCommunityUsers(membre);
    expect(usersError).toBe('');
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) expect(Object.keys(u).sort()).toEqual(['first_name', 'id', 'last_name', 'profile_photo_url', 'role']);
  });

  it('Communauté : un visiteur non connecté obtient une erreur (comme Base44 : message HTTP générique)', async () => {
    const { users, usersError } = await loadCommunityUsers(anonyme);
    expect(users).toEqual([]);
    expect(usersError).toBe('Request failed with status code 401');
  });

  it('Accueil, section Requêtes : le compteur se charge (0 si aucune prière ouverte)', async () => {
    const count = await loadPendingCount(membre);
    expect(Number.isInteger(count)).toBe(true);
    expect(count).toBeGreaterThanOrEqual(0);
    expect(await loadPendingCount(anonyme)).toBe(0);
  });

  it('lecture directe d’entités par l’adaptateur (règles appliquées)', async () => {
    const verses = await membre.entities.BibleVerse.filter({ chapter: 1, verse: 1 }, '-created_date', 3);
    expect(verses.length).toBeGreaterThan(0);
    expect(verses[0]).toHaveProperty('created_date');
    expect(await anonyme.entities.Message.list('-created_date', 5)).toEqual([]);
  });
});
