'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/main/sistema');

const nucleo = (user, sys, idle) => ({ model: 'x', speed: 1, times: { user, nice: 0, sys, idle, irq: 0 } });

test('CPU: porcentaje entre dos lecturas de os.cpus()', () => {
  const antes = [nucleo(100, 50, 850), nucleo(200, 100, 700)];
  // Entre lecturas: núcleo 1 +30 user, +10 sys, +60 idle; núcleo 2 +50 user, +0 sys, +50 idle.
  const despues = [nucleo(130, 60, 910), nucleo(250, 100, 750)];
  // total +200, inactivo +110 -> ocupado 90/200 = 45 %
  assert.equal(S.porcentajeCpu(antes, despues), 45);
});

test('CPU: sin diferencia medible devuelve null; 100 % y 0 % en los extremos', () => {
  const a = [nucleo(10, 10, 80)];
  assert.equal(S.porcentajeCpu(a, a), null);
  assert.equal(S.porcentajeCpu([nucleo(0, 0, 0)], [nucleo(100, 0, 0)]), 100);
  assert.equal(S.porcentajeCpu([nucleo(0, 0, 0)], [nucleo(0, 0, 100)]), 0);
  assert.equal(S.porcentajeCpu([], []), null);
  assert.equal(S.porcentajeCpu(undefined, null), null);
});

test('formatoBytes: MB, GB con decimal, GB redondeado y TB', () => {
  const GB = 1024 ** 3;
  assert.equal(S.formatoBytes(512 * 1024 ** 2), '512 MB');
  assert.equal(S.formatoBytes(1.5 * GB), '1.5 GB');
  assert.equal(S.formatoBytes(15.7 * GB), '16 GB');
  assert.equal(S.formatoBytes(2 * GB), '2 GB');
  assert.equal(S.formatoBytes(1.5 * 1024 * GB), '1.5 TB');
  assert.equal(S.formatoBytes(-1), '—');
  assert.equal(S.formatoBytes(NaN), '—');
});

test('porcentaje y lecturas de memoria y disco', () => {
  assert.equal(S.porcentaje(1, 4), 25);
  assert.equal(S.porcentaje(5, 0), 0);
  assert.equal(S.porcentaje(9, 4), 100);
  assert.deepEqual(S.lecturaMemoria(16e9, 4e9), { usado: 12e9, total: 16e9, pct: 75 });
  const d = S.lecturaDisco({ bsize: 4096, blocks: 1000, bavail: 250 });
  assert.equal(d.total, 4096000);
  assert.equal(d.libre, 1024000);
  assert.equal(d.pct, 75);
  assert.equal(S.lecturaDisco(null), null);
  assert.equal(S.lecturaDisco({ bsize: 4096, blocks: 0, bavail: 0 }), null);
});

test('medidor: usa las lecturas inyectadas y reinicia la base de la CPU', async () => {
  const lecturas = [
    [nucleo(0, 0, 100)],      // al crear
    [nucleo(0, 0, 100)],      // reiniciar (base)
    [nucleo(50, 0, 150)],     // lectura tras la espera: +50 ocupado, +50 inactivo -> 50 %
    [nucleo(50, 0, 250)],     // siguiente: +100 inactivo -> 0 %
  ];
  let i = 0;
  let esperas = 0;
  const m = S.crearMedidor({
    cpus: () => lecturas[Math.min(i++, lecturas.length - 1)],
    totalmem: () => 8e9, freemem: () => 2e9,
    statfs: async (r) => { assert.equal(r, 'C:\\'); return { bsize: 4096, blocks: 1000, bavail: 500 }; },
    esperar: async () => { esperas++; },
  });
  const a = await m.leer({ reiniciar: true });
  assert.equal(esperas, 1);
  assert.equal(a.cpu.pct, 50);
  assert.deepEqual(a.ram, { usado: 6e9, total: 8e9, pct: 75 });
  assert.equal(a.disco.unidad, 'C:');
  assert.equal(a.disco.pct, 50);
  const b = await m.leer();
  assert.equal(esperas, 1);
  assert.equal(b.cpu.pct, 0);
});

test('medidor: si statfs falla, el disco es null y lo demás sigue', async () => {
  const m = S.crearMedidor({
    cpus: () => [nucleo(1, 1, 1)], totalmem: () => 4e9, freemem: () => 1e9,
    statfs: async () => { throw new Error('sin disco'); }, esperar: async () => {},
  });
  const r = await m.leer();
  assert.equal(r.disco, null);
  assert.equal(r.ram.pct, 75);
  assert.equal(r.cpu.pct, null);
});

test('medidor real: devuelve números razonables en esta PC', async () => {
  const m = S.crearMedidor({ esperar: async () => {} });
  const r = await m.leer({ reiniciar: true });
  assert.ok(r.ram.total > 0 && r.ram.pct >= 0 && r.ram.pct <= 100);
  assert.ok(r.cpu.pct === null || (r.cpu.pct >= 0 && r.cpu.pct <= 100));
  assert.ok(r.disco === null || (r.disco.total > 0 && r.disco.pct >= 0 && r.disco.pct <= 100));
});
