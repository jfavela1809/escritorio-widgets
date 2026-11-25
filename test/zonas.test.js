'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Z = require('../src/main/zonas');

const limites = { x: 0, y: 0, width: 1536, height: 816 };

test('normaliza y descarta zonas inválidas', () => {
  assert.deepStrictEqual(Z.normalizarZonas([[1, 2, 3, 4], [0, 0, 0, 5], 'x', [1, 2, 3], [NaN, 1, 1, 1]]), [[1, 2, 3, 4]]);
  assert.deepStrictEqual(Z.normalizarZonas(null), []);
});

test('sobre un elemento la ventana recibe el ratón (también durante un arrastre de Windows)', () => {
  assert.strictEqual(Z.debeIgnorar({ cursor: { x: 50, y: 50 }, limites, zonas: [[0, 0, 96, 96]], capturando: false }), false);
});

test('en una zona vacía deja pasar el ratón al escritorio', () => {
  assert.strictEqual(Z.debeIgnorar({ cursor: { x: 500, y: 500 }, limites, zonas: [[0, 0, 96, 96]], capturando: false }), true);
});

test('mientras el renderer arrastra no suelta el ratón aunque esté en zona vacía', () => {
  assert.strictEqual(Z.debeIgnorar({ cursor: { x: 500, y: 500 }, limites, zonas: [], capturando: true }), false);
});

test('fuera de la ventana deja pasar el ratón; respeta el origen de la ventana', () => {
  assert.strictEqual(Z.debeIgnorar({ cursor: { x: 10, y: 900 }, limites, zonas: [[0, 0, 2000, 2000]], capturando: false }), true);
  const conBarra = { x: 0, y: 40, width: 1536, height: 776 };
  assert.strictEqual(Z.debeIgnorar({ cursor: { x: 50, y: 60 }, limites: conBarra, zonas: [[0, 0, 96, 96]], capturando: false }), false);
  assert.strictEqual(Z.debeIgnorar({ cursor: { x: 50, y: 20 }, limites: conBarra, zonas: [[0, 0, 96, 96]], capturando: false }), true);
});
