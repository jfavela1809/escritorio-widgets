'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/renderer/widgets/formatos');

test('fecha y hora en español: día, "24 NOV" y a. m./p. m.', () => {
  const d = new Date(2026, 10, 24, 10, 42); // martes 24 de noviembre de 2026
  assert.equal(F.diaSemana(d), 'Martes');
  assert.equal(F.fechaCorta(d), '24 NOV');
  assert.deepEqual(F.hora12(d), { hora: '10:42', sufijo: 'a. m.' });
  assert.deepEqual(F.hora12(new Date(2026, 10, 24, 0, 5)), { hora: '12:05', sufijo: 'a. m.' });
  assert.deepEqual(F.hora12(new Date(2026, 10, 24, 12, 0)), { hora: '12:00', sufijo: 'p. m.' });
  assert.deepEqual(F.hora12(new Date(2026, 10, 24, 17, 2)), { hora: '5:02', sufijo: 'p. m.' });
  assert.equal(F.mesAnio(2026, 10), 'Noviembre 2026');
});

test('reloj: el siguiente tic cae en el inicio del próximo minuto, no cada 100 ms', () => {
  const t = Date.UTC(2026, 10, 24, 12, 0, 45, 500);
  assert.equal(F.msHastaSiguienteMinuto(t, 30), 14530);
  assert.ok(F.msHastaSiguienteMinuto(Date.UTC(2026, 10, 24, 12, 0, 0, 0), 30) <= 60030);
  assert.ok(F.msHastaSiguienteMinuto(t) > 1000);
  assert.ok(F.msHastaMedianoche(new Date(2026, 10, 24, 23, 59, 30)) > 29000);
  assert.ok(F.msHastaMedianoche(new Date(2026, 10, 24, 0, 0, 1)) > 86000000);
});

test('calendario: noviembre de 2026 empieza en domingo (semana en lunes)', () => {
  const m = F.matrizMes(2026, 10);
  assert.deepEqual(m[0], [null, null, null, null, null, null, 1]); // 1 de nov = domingo
  assert.deepEqual(m[1], [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(m[m.length - 1], [30, null, null, null, null, null, null]);
  assert.equal(m.length, 6);
  for (const s of m) assert.equal(s.length, 7);
});

test('calendario: febrero bisiesto y primer día en distintos días de la semana', () => {
  const feb = F.matrizMes(2028, 1); // 2028 es bisiesto; 1 feb 2028 = martes
  assert.equal(feb.flat().filter((x) => x !== null).length, 29);
  assert.equal(feb[0][1], 1);
  const dic = F.matrizMes(2026, 11); // 1 dic 2026 = martes
  assert.equal(dic[0][1], 1);
  const junio = F.matrizMes(2026, 5); // 1 jun 2026 = lunes
  assert.equal(junio[0][0], 1);
});

test('actualizado hace X', () => {
  const t = 1_000_000_000;
  assert.equal(F.textoActualizado(t, t + 20_000), 'actualizado ahora');
  assert.equal(F.textoActualizado(t, t + 5 * 60_000), 'actualizado hace 5 min');
  assert.equal(F.textoActualizado(t, t + 3 * 3600_000), 'actualizado hace 3 h');
  assert.equal(F.textoActualizado(t, t + 24 * 3600_000), 'actualizado hace 1 día');
  assert.equal(F.textoActualizado(t, t + 49 * 3600_000), 'actualizado hace 2 días');
  assert.equal(F.textoActualizado(t, t - 1000), 'actualizado ahora');
});
