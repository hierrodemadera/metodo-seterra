/* Método Seterra — permite abrir la app sin conexión.
   Guarda una copia de la propia app (index.html). Con internet siempre se usa la versión
   más nueva de GitHub y se actualiza la copia; sin internet se abre la copia guardada.
   data.json NO se guarda aquí: los mazos ya viven en el dispositivo, y así "⟳ actualizar"
   nunca carga por error una copia vieja. */
const CACHE = 'seterra-app-v1';
const APP = new URL('./', self.location).href;          // .../metodo-seterra/
const APP_FILE = new URL('./index.html', self.location).href;

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

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(!isAppPage(req)) return; // todo lo demás (data.json incluido) va directo a la red
  e.respondWith((async ()=>{
    try{
      // con internet lento, a los 4 s se abre la copia guardada (si la hay)
      // aunque se abra la copia por lentitud, cuando llegue la versión nueva se guarda
      const net = fetch(req, {cache:'no-store'}).then(res=>{
        if(res.ok){ const copy = res.clone(); caches.open(CACHE).then(c=> c.put(APP, copy)); }
        return res;
      });
      e.waitUntil(net.catch(()=>{}));
      const timeout = new Promise((_, rej)=> setTimeout(()=> rej(new Error('lento')), 4000));
      const res = await Promise.race([net, timeout]);
      if(res && res.ok) return res;
      return (await fromCache()) || res;
    }catch(err){
      const cached = await fromCache();
      if(cached) return cached;
      return fetch(req); // sin copia aún: que lo intente la red de todos modos
    }
  })());
});
