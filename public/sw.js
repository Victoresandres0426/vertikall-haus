// Service worker mínimo — necesario para que Chrome/Android ofrezca la
// instalación completa como app (no solo "crear acceso directo").
// No hace caché agresivo de nada: solo deja pasar las peticiones a la
// red, con un respaldo simple desde caché si no hay conexión.

const CACHE_NAME = "vertikall-haus-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
