// Garde-fou : seules les requêtes vers 127.0.0.1 / localhost sont autorisées.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`Requête bloquée : seul le bac à sable local est autorisé (${url.hostname}).`);
  }
  return realFetch(input, init);
};
