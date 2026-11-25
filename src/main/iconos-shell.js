'use strict';
// Iconos idénticos a los del Explorador: se piden en lote a iconos-shell.ps1
// (IShellItemImageFactory) y se guardan como PNG en una caché en disco.
// Sin importar electron: devuelve rutas de PNG; main.js los convierte en dataURL.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const SCRIPT = path.join(__dirname, 'iconos-shell.ps1');
const ESPERA_LOTE_MS = 40;
const TOPE_MS = 30000;

// Clave de caché: la ruta y la fecha de modificación (si cambia el acceso, cambia el icono).
function claveDe(ruta, mtimeMs) {
  return crypto.createHash('sha1').update(String(ruta).toLowerCase() + '|' + Math.round(Number(mtimeMs) || 0)).digest('hex');
}

// Interpreta la salida del script: líneas "OK<TAB>archivo".
function leerSalida(texto) {
  const hechos = new Set();
  for (const linea of String(texto || '').split(/\r?\n/)) {
    const i = linea.indexOf('\t');
    if (i > 0 && linea.slice(0, i) === 'OK') hechos.add(linea.slice(i + 1).trim().toLowerCase());
  }
  return hechos;
}

function ejecutarPs(lista, archivoLista, tam) {
  return new Promise((resolve) => {
    fs.writeFileSync(archivoLista, JSON.stringify(lista), 'utf8');
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Lista', archivoLista, '-Tam', String(tam)],
      { timeout: TOPE_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (_err, stdout) => {
        try { fs.unlinkSync(archivoLista); } catch (_) { /* nada */ }
        resolve(String(stdout || ''));
      });
  });
}

// dirCache: carpeta propia de la app (userData\iconos). ejecutar es inyectable para pruebas.
function crear({ dirCache, tam = 96, ejecutar = ejecutarPs } = {}) {
  fs.mkdirSync(dirCache, { recursive: true });
  let cola = [];
  let timer = null;

  async function lote() {
    timer = null;
    const pendientes = cola; cola = [];
    const unicos = new Map();
    for (const p of pendientes) if (!unicos.has(p.archivo)) unicos.set(p.archivo, p.ruta);
    const lista = [...unicos].map(([archivo, ruta]) => ({ ruta, archivo }));
    let hechos = new Set();
    try {
      const salida = await ejecutar(lista, path.join(dirCache, 'lista-' + process.pid + '-' + Date.now() + '.json'), tam);
      hechos = leerSalida(salida);
    } catch (_) { hechos = new Set(); }
    for (const p of pendientes) p.resolve(hechos.has(p.archivo.toLowerCase()) && fs.existsSync(p.archivo) ? p.archivo : null);
  }

  // Devuelve la ruta del PNG o null si el shell no dio icono.
  function obtener(ruta, mtimeMs) {
    const archivo = path.join(dirCache, claveDe(ruta, mtimeMs) + '.png');
    if (fs.existsSync(archivo)) return Promise.resolve(archivo);
    return new Promise((resolve) => {
      cola.push({ ruta, archivo, resolve });
      if (!timer) timer = setTimeout(lote, ESPERA_LOTE_MS);
    });
  }
  return { obtener };
}

module.exports = { crear, claveDe, leerSalida };
