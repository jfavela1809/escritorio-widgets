'use strict';
// Clic a través guiado por la posición del cursor (sin importar electron).
//
// Durante un arrastre de Windows (un icono del escritorio o del Explorador) el renderer no
// recibe mousemove, así que no puede pedir que la ventana deje de ser transparente al ratón y
// el soltar cae en el escritorio real. Por eso el proceso principal sondea el cursor y lo
// compara con las zonas interactivas que el renderer le reporta.

const MAX_ZONAS = 2000;

// zonas: [[x, y, ancho, alto], ...] en px CSS relativos a la ventana (= DIP con zoom 1).
function normalizarZonas(lista) {
  if (!Array.isArray(lista)) return [];
  const salida = [];
  for (const z of lista) {
    if (salida.length >= MAX_ZONAS) break;
    if (!Array.isArray(z) || z.length !== 4) continue;
    const [x, y, w, h] = z.map(Number);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    salida.push([x, y, w, h]);
  }
  return salida;
}

function dentroDeZona(zonas, x, y) {
  for (const [zx, zy, w, h] of zonas) {
    if (x >= zx && x < zx + w && y >= zy && y < zy + h) return true;
  }
  return false;
}

// ¿La ventana debe dejar pasar el ratón? cursor y limites en DIP de pantalla.
function debeIgnorar({ cursor, limites, zonas, capturando }) {
  if (capturando) return false;
  const x = cursor.x - limites.x;
  const y = cursor.y - limites.y;
  if (x < 0 || y < 0 || x >= limites.width || y >= limites.height) return true;
  return !dentroDeZona(zonas, x, y);
}

module.exports = { normalizarZonas, dentroDeZona, debeIgnorar, MAX_ZONAS };
