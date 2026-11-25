'use strict';
// Uso de la PC para el widget: RAM, CPU y disco C:. Sin importar electron (se prueba con
// lecturas inyectadas). La CPU se mide por diferencia entre dos lecturas de os.cpus().

const os = require('os');
const fs = require('fs');

const redondear = (n, d = 0) => { const k = 10 ** d; return Math.round(n * k) / k; };
const limitar = (n, min, max) => Math.min(max, Math.max(min, n));

// Suma de tiempos (ms) de todos los núcleos: { inactivo, total }.
function sumarCpus(cpus) {
  let inactivo = 0; let total = 0;
  for (const c of Array.isArray(cpus) ? cpus : []) {
    const t = c && c.times ? c.times : {};
    const ocupado = (t.user || 0) + (t.nice || 0) + (t.sys || 0) + (t.irq || 0);
    inactivo += t.idle || 0;
    total += ocupado + (t.idle || 0);
  }
  return { inactivo, total };
}

// Porcentaje de CPU ocupada entre dos lecturas (0 a 100). null si no hay diferencia medible.
function porcentajeCpu(antes, despues) {
  const a = sumarCpus(antes); const b = sumarCpus(despues);
  const dTotal = b.total - a.total;
  const dInactivo = b.inactivo - a.inactivo;
  if (!(dTotal > 0)) return null;
  return redondear(limitar((1 - dInactivo / dTotal) * 100, 0, 100), 1);
}

function porcentaje(usado, total) {
  if (!(total > 0)) return 0;
  return redondear(limitar(usado / total * 100, 0, 100), 1);
}

// "12.3 GB", "512 MB" (separador decimal de es-MX: punto).
function formatoBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  const GB = 1024 ** 3; const MB = 1024 ** 2;
  if (n >= 1024 * GB) return redondear(n / (1024 * GB), 1) + ' TB';
  if (n >= 10 * GB) return redondear(n / GB, 0) + ' GB';
  if (n >= GB) return redondear(n / GB, 1) + ' GB';
  return redondear(n / MB, 0) + ' MB';
}

function lecturaMemoria(total, libre) {
  const usado = Math.max(0, total - libre);
  return { usado, total, pct: porcentaje(usado, total) };
}

// Disco: statfs de Node (bsize, blocks, bavail). Devuelve { usado, total, libre, pct } o null.
function lecturaDisco(st) {
  if (!st) return null;
  const total = Number(st.blocks) * Number(st.bsize);
  const libre = Number(st.bavail) * Number(st.bsize);
  if (!(total > 0) || !Number.isFinite(libre)) return null;
  const usado = Math.max(0, total - libre);
  return { usado, total, libre, pct: porcentaje(usado, total) };
}

// Crea el medidor. Todo se puede inyectar para las pruebas.
function crearMedidor(dep = {}) {
  const cpus = dep.cpus || (() => os.cpus());
  const totalmem = dep.totalmem || (() => os.totalmem());
  const freemem = dep.freemem || (() => os.freemem());
  const statfs = dep.statfs || ((r) => fs.promises.statfs(r));
  const esperar = dep.esperar || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const unidad = dep.unidad || 'C:';
  let previa = cpus();

  // reiniciar: empieza a medir de cero (al montar el widget) y espera un momento para dar ya un valor.
  async function leer({ reiniciar = false } = {}) {
    if (reiniciar) { previa = cpus(); await esperar(250); }
    const ahora = cpus();
    const cpu = porcentajeCpu(previa, ahora);
    if (cpu !== null) previa = ahora;
    let disco = null;
    try { disco = lecturaDisco(await statfs(unidad + '\\')); } catch (_) { disco = null; }
    return {
      ram: lecturaMemoria(totalmem(), freemem()),
      cpu: { pct: cpu },
      disco: disco ? { ...disco, unidad } : null,
    };
  }
  return { leer };
}

module.exports = { sumarCpus, porcentajeCpu, porcentaje, formatoBytes, lecturaMemoria, lecturaDisco, crearMedidor };
