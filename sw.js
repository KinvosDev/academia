/* Academia — service worker
   Pour publier une mise à jour : changer VERSION ci-dessous.
   Les utilisateurs verront alors « Nouvelle version disponible ». */
const VERSION = "37";
const CACHE_NAME = "academia-cache-v" + VERSION;
const PREFIXE_CACHE = "academia-cache-";

const APP_SHELL = [
  "./index.html",
  "./offline.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./fonts/lora.woff",
  "./fonts/inter-400.woff",
  "./fonts/inter-500.woff",
  "./fonts/inter-600.woff",
  "./fonts/inter-700.woff",
  "./fonts/inter-800.woff",
  "./vendor/pdf.min.js",
  "./vendor/pdf.worker.min.js"
];

// Pas de skipWaiting automatique : la page propose la mise à jour à l'utilisateur.
self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(
        noms
          .filter((nom) => nom.startsWith(PREFIXE_CACHE) && nom !== CACHE_NAME)
          .map((nom) => caches.delete(nom))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (evenement) => {
  if (evenement.data && evenement.data.type === "SKIP_WAITING") self.skipWaiting();
});

const EST_STATIQUE = /\/(fonts|vendor|icons)\//;

function mettreEnCache(requete, reponse) {
  if (reponse && reponse.ok && reponse.type === "basic") {
    const copie = reponse.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(requete, copie));
  }
  return reponse;
}

function reseauAvecDelai(requete, delaiMs) {
  return new Promise((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new Error("delai")), delaiMs);
    fetch(requete).then(
      (r) => { clearTimeout(minuteur); resolve(r); },
      (e) => { clearTimeout(minuteur); reject(e); }
    );
  });
}

// Ne gère que les GET de la même origine ; jamais les appels vers le
// serveur central de licences (autre origine, jamais intercepté ici).
self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // Fichiers statiques (polices, pdf.js, icônes) : cache d'abord.
  if (EST_STATIQUE.test(url.pathname)) {
    evenement.respondWith(
      caches.match(requete).then((trouve) =>
        trouve || fetch(requete).then((r) => mettreEnCache(requete, r))
      )
    );
    return;
  }

  // Reste (page, manifest, sw...) : réseau d'abord (4 s max), repli sur le cache.
  evenement.respondWith(
    reseauAvecDelai(requete, 4000)
      .then((reponse) => mettreEnCache(requete, reponse))
      .catch(async () => {
        const enCache = await caches.match(requete, { ignoreSearch: true });
        if (enCache) return enCache;
        if (requete.mode === "navigate") {
          return (await caches.match("./index.html")) ||
                 (await caches.match("./offline.html")) ||
                 Response.error();
        }
        return Response.error();
      })
  );
});
