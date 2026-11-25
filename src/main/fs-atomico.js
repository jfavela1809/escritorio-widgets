'use strict';
// Escritura atómica: se escribe "archivo.tmp" y se renombra sobre el real.
// Nunca se trunca el archivo real. Sin importar electron.

const nodeFs = require('fs');

function dormir(ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { /* espera corta y síncrona (antivirus/indexador en Windows) */ }
}

function renombrarConReintentos(fs, de, a) {
  let ultimo;
  for (let i = 0; i < 6; i++) {
    try {
      fs.renameSync(de, a);
      return;
    } catch (e) {
      ultimo = e;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      dormir(25 * (i + 1));
    }
  }
  throw ultimo;
}

function escribirAtomico(ruta, texto, fs = nodeFs) {
  const tmp = ruta + '.tmp';
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, texto, 0, 'utf8');
      try { fs.fsyncSync(fd); } catch (_) { /* no crítico */ }
    } finally {
      fs.closeSync(fd);
    }
    renombrarConReintentos(fs, tmp, ruta);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ya no existe */ }
    throw e;
  }
}

module.exports = { escribirAtomico, renombrarConReintentos };
