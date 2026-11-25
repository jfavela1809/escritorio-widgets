'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/renderer/cuadricula');

const acc = (id, col, fila) => ({ id, tipo: 'acceso', ruta: 'C:\\x\\' + id, nombre: id, col, fila });
const wid = (id, col, fila, ancho, alto) => ({ id, tipo: 'widget', widget: 'reloj', col, fila, ancho, alto, opciones: {} });

test('dimensiones: columnas y filas con celdas de 96 px', () => {
  assert.deepEqual(C.dimensiones(1536, 816), { cols: 16, filas: 8 });
  assert.deepEqual(C.dimensiones(50, 50), { cols: 1, filas: 1 });
});

test('celdaDePunto', () => {
  assert.deepEqual(C.celdaDePunto(0, 0), { col: 0, fila: 0 });
  assert.deepEqual(C.celdaDePunto(95, 96), { col: 0, fila: 1 });
  assert.deepEqual(C.celdaDePunto(200, 300), { col: 2, fila: 3 });
});

test('traslapa y colision con widgets de varias celdas', () => {
  const lista = [wid('w', 2, 1, 2, 2)];
  assert.equal(C.colision(lista, { col: 3, fila: 2, ancho: 1, alto: 1 }).id, 'w');
  assert.equal(C.colision(lista, { col: 4, fila: 1, ancho: 1, alto: 1 }), null);
  assert.equal(C.colision(lista, { col: 2, fila: 1, ancho: 1, alto: 1 }, 'w'), null);
});

test('celdaLibreMasCercana: la propia celda si está libre', () => {
  assert.deepEqual(C.celdaLibreMasCercana([], 3, 2, 8, 6), { col: 3, fila: 2 });
});

test('celdaLibreMasCercana: elige la vecina más cercana y desempata fila, luego columna', () => {
  const lista = [acc('a', 3, 3)];
  // Vecinas a distancia 1: (3,2) (2,3) (4,3) (3,4); gana la de fila menor.
  assert.deepEqual(C.celdaLibreMasCercana(lista, 3, 3, 8, 8), { col: 3, fila: 2 });
});

test('celdaLibreMasCercana: respeta los límites y devuelve null si no hay lugar', () => {
  const lista = [acc('a', 0, 0), acc('b', 1, 0)];
  assert.equal(C.celdaLibreMasCercana(lista, 0, 0, 2, 1), null);
  assert.deepEqual(C.celdaLibreMasCercana(lista, 0, 0, 3, 1), { col: 2, fila: 0 });
});

test('celdaLibreMasCercana para un bloque 2x2 evita choques', () => {
  const lista = [acc('a', 1, 1)];
  const r = C.celdaLibreMasCercana(lista, 1, 1, 6, 6, null, 2, 2);
  assert.equal(C.colision(lista, { col: r.col, fila: r.fila, ancho: 2, alto: 2 }), null);
});

test('primeraZonaLibre recorre por columnas de arriba abajo', () => {
  assert.deepEqual(C.primeraZonaLibre([], 1, 1, 4, 3), { col: 0, fila: 0 });
  assert.deepEqual(C.primeraZonaLibre([acc('a', 0, 0)], 1, 1, 4, 3), { col: 0, fila: 1 });
  const llena = [acc('a', 0, 0), acc('b', 0, 1), acc('c', 0, 2)];
  assert.deepEqual(C.primeraZonaLibre(llena, 1, 1, 4, 3), { col: 1, fila: 0 });
  assert.deepEqual(C.primeraZonaLibre([wid('w', 0, 0, 2, 2)], 2, 2, 4, 3), { col: 2, fila: 0 });
  assert.equal(C.primeraZonaLibre([], 5, 1, 4, 3), null);
});

test('limitar deja el bloque dentro de la pantalla', () => {
  assert.deepEqual(C.limitar(-2, 9, 2, 2, 8, 6), { col: 0, fila: 4 });
  assert.deepEqual(C.limitar(7, 0, 2, 1, 8, 6), { col: 6, fila: 0 });
});

test('acomodar: mueve fuera de límites y choques, no descarta nada y no muta', () => {
  const entrada = [acc('a', 1, 1), acc('b', 1, 1), acc('c', 50, 50)];
  const copia = JSON.stringify(entrada);
  const r = C.acomodar(entrada, 4, 4);
  assert.equal(JSON.stringify(entrada), copia);
  assert.equal(r.length, 3);
  const celdas = new Set(r.map((e) => `${e.col},${e.fila}`));
  assert.equal(celdas.size, 3);
  for (const e of r) assert.ok(C.cabe(C.rectDe(e), 4, 4));
  assert.deepEqual({ c: r[0].col, f: r[0].fila }, { c: 1, f: 1 }); // el que ya estaba bien no se mueve
});

test('acomodar: si ya no hay lugar, conserva los elementos', () => {
  const r = C.acomodar([acc('a', 0, 0), acc('b', 0, 0)], 1, 1);
  assert.equal(r.length, 2);
});
