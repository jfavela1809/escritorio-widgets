'use strict';
// Enlaces web del widget "Enlaces": solo se abren direcciones http/https que estén guardadas en
// algún widget de enlaces (aunque el renderer pidiera otra cosa). Sin importar electron.

const MAX_URL = 2000;

// Dirección lista para abrir, o null si no es http/https válida.
function urlValida(u) {
  if (typeof u !== 'string' || !u || u.length > MAX_URL) return null;
  let x;
  try { x = new URL(u); } catch (_) { return null; }
  if (x.protocol !== 'http:' && x.protocol !== 'https:') return null;
  if (x.username || x.password || !x.hostname) return null;
  return x.href;
}

// Todas las direcciones guardadas en widgets "enlaces" (de cualquier monitor).
function guardadas(elementos) {
  const s = new Set();
  for (const e of Array.isArray(elementos) ? elementos : []) {
    if (!e || e.tipo !== 'widget' || e.widget !== 'enlaces') continue;
    const items = e.opciones && Array.isArray(e.opciones.items) ? e.opciones.items : [];
    for (const it of items) { const u = urlValida(it && it.url); if (u) s.add(u); }
  }
  return s;
}

module.exports = { urlValida, guardadas, MAX_URL };
