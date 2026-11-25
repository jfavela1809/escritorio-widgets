'use strict';
// Utilidades puras para rutas de Windows (sin importar electron). La app solo guarda rutas:
// nunca borra, mueve ni modifica los archivos a los que apuntan.

const path = require('path');

const MAX_RUTA = 1000;

// Una ruta guardable: cadena absoluta de Windows ("C:\..." o "\\servidor\recurso\..."),
// sin caracteres de control, sin comillas ni comodines, sin segmentos "..".
function rutaValida(r) {
  if (typeof r !== 'string') return false;
  if (r.length < 3 || r.length > MAX_RUTA) return false;
  if (/[\u0000-\u001f"<>|*?]/.test(r)) return false;
  const unidad = /^[A-Za-z]:[\\/]/.test(r);
  const unc = /^\\\\[^\\/]+[\\/][^\\/]+/.test(r);
  if (!unidad && !unc) return false;
  if (r.split(/[\\/]/).includes('..')) return false;
  return true;
}

function esUnc(r) { return typeof r === 'string' && r.startsWith('\\\\'); }

// Nombre para mostrar: nombre del archivo sin extensión (.lnk/.exe/.url) o de la carpeta.
function nombreDeRuta(ruta) {
  const limpia = String(ruta).replace(/[\\/]+$/, '');
  let base = path.win32.basename(limpia);
  if (!base) base = limpia;
  const ext = path.win32.extname(base).toLowerCase();
  if (['.lnk', '.exe', '.url', '.bat', '.cmd', '.msi'].includes(ext)) base = base.slice(0, -ext.length);
  return base || limpia;
}

function esAcceso(ruta) { return /\.lnk$/i.test(String(ruta)); }

// Quita duplicados y rutas inválidas de una lista de rutas recibida por IPC.
function filtrarRutas(lista, max = 400) {
  if (!Array.isArray(lista)) return [];
  const vistas = new Set();
  const salida = [];
  for (const r of lista) {
    if (salida.length >= max) break;
    if (!rutaValida(r)) continue;
    const clave = r.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(r);
  }
  return salida;
}

// Fuentes de icono para un acceso directo, en orden:
// 1. su icono propio si es .ico, o un .exe con índice 0 (un .dll o un índice distinto de 0 no
//    se puede leer con getFileIcon: daría el icono equivocado);
// 2. el destino (programa, documento o carpeta);
// 3. el propio .lnk (icono genérico) como último recurso.
// link: lo que devuelve shell.readShortcutLink (o null si no se pudo leer).
function fuentesDeIcono(ruta, link) {
  const salida = [];
  const l = link && typeof link === 'object' ? link : {};
  const icono = typeof l.icon === 'string' ? l.icon.trim() : '';
  const indice = Number(l.iconIndex) || 0;
  if (rutaValida(icono) && (/\.ico$/i.test(icono) || (/\.exe$/i.test(icono) && indice === 0))) salida.push(icono);
  const destino = typeof l.target === 'string' ? l.target.trim() : '';
  if (rutaValida(destino) && !salida.some((s) => s.toLowerCase() === destino.toLowerCase())) salida.push(destino);
  salida.push(ruta);
  return salida;
}

module.exports = { rutaValida, esUnc, nombreDeRuta, esAcceso, filtrarRutas, fuentesDeIcono, MAX_RUTA };
