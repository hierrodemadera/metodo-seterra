/* Método Seterra — permite abrir la app sin conexión.
   Guarda una copia de la propia app (index.html). Con internet siempre se usa la versión
   más nueva de GitHub y se actualiza la copia; sin internet se abre la copia guardada.
   MODO SIN INTERNET (interruptor de la app): se abre la copia guardada sin preguntar a la red
   y cualquier otra petición se corta aquí, así la app no gasta datos.
   data.json NO se guarda aquí: los mazos ya viven en el dispositivo. */
const CACHE = 'seterra-app-v1';
const APP = new URL('./', self.location).href;          // .../metodo-seterra/
const APP_FILE = new URL('./index.html', self.location).href;
const FLAG = new URL('./__sin_internet__', self.location).href;
let OFF = null;                                          // null = aún no se sabe
const readFlag = ()=> caches.open(CACHE).then(c=> c.match(FLAG)).then(r=> (OFF = !!r)).catch(()=> (OFF = false));
readFlag();

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=> c.add(new Request(APP, {cache:'reload'}))).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil((async ()=>{
    for(const k of await caches.keys()) if(k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e=>{ if(e.data && 'offline' in e.data) OFF = !!e.data.offline; });

function isAppPage(req){
  if(req.method !== 'GET') return false;
  if(req.mode === 'navigate') return true;
  const u = new URL(req.url);
  u.search = ''; u.hash = '';
  return u.href === APP || u.href === APP_FILE;
}
async function fromCache(){
  const c = await caches.open(CACHE);
  return (await c.match(APP)) || (await c.match(APP_FILE));
}
async function fromNet(req){
  const res = await fetch(req.url, {cache:'no-store', credentials:'same-origin'});
  if(res.ok){ const copy = res.clone(); caches.open(CACHE).then(c=> c.put(APP, copy)); }
  return res;
}

self.addEventListener('fetch', e=>{
  const req = e.request, page = isAppPage(req);
  if(OFF === false && !page) return;                    // lo normal: todo lo demás va directo a la red
  e.respondWith((async ()=>{
    if(OFF === null) await readFlag();
    if(OFF){
      // sin internet: solo lo guardado, nada sale a la red
      if(page){ const c = await fromCache(); if(c) return c; }
      else { const c = await caches.match(req, {ignoreSearch:true}); if(c) return c; }
      return new Response('Modo sin internet', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    }
    if(!page) return fetch(req);
    try{
      // con internet lento, a los 4 s se abre la copia guardada (si la hay);
      // aunque se abra la copia, cuando llegue la versión nueva se guarda
      const net = fromNet(req);
      e.waitUntil(net.catch(()=>{}));
      const timeout = new Promise((_, rej)=> setTimeout(()=> rej(new Error('lento')), 4000));
      const res = await Promise.race([net, timeout]);
      if(res && res.ok) return res;
      return (await fromCache()) || res;
    }catch(err){
      const cached = await fromCache();
      if(cached) return cached;
      return fetch(req.url);
    }
  })());
});
