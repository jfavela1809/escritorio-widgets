'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/renderer/carpetas');

let n = 0;
const nuevoId = () => 'n' + (++n);
const acc = (id, col, fila) => ({ id, tipo: 'acceso', ruta: 'C:\\x\\' + id + '.lnk', nombre: id, col, fila });
const hijo = (id) => ({ id, tipo: 'acceso', ruta: 'C:\\x\\' + id + '.lnk', nombre: id });
const carp = (id, col, fila, ...hs) => ({ id, tipo: 'carpeta', nombre: 'Carpeta', col, fila, hijos: hs.map(hijo) });
const wid = (id, col, fila) => ({ id, tipo: 'widget', widget: 'reloj', col, fila, ancho: 2, alto: 2, opciones: {} });

test('soltar un acceso sobre otro crea la carpeta "Carpeta" en la celda del destino', () => {
  const ini = [acc('a', 0, 0), acc('b', 3, 2)];
  const r = K.soltarSobre(ini, 'a', 'b', nuevoId);
  assert.equal(r.ok, true);
  assert.equal(r.elementos.length, 1);
  const c = r.elementos[0];
  assert.equal(c.tipo, 'carpeta');
  assert.equal(c.nombre, 'Carpeta');
  assert.deepEqual([c.col, c.fila], [3, 2]);
  assert.deepEqual(c.hijos.map((h) => h.id), ['b', 'a']);
  assert.equal(r.carpetaId, c.id);
  assert.equal(ini.length, 2); // no muta la entrada
});

test('soltar sobre una carpeta añade el acceso', () => {
  const r = K.soltarSobre([carp('c', 1, 1, 'x', 'y'), acc('a', 0, 0)], 'a', 'c', nuevoId);
  assert.equal(r.ok, true);
  assert.equal(r.elementos.length, 1);
  assert.deepEqual(r.elementos[0].hijos.map((h) => h.id), ['x', 'y', 'a']);
});

test('no se sueltan carpetas ni widgets, ni sobre widgets, ni sobre sí mismo', () => {
  const lista = [carp('c', 1, 1, 'x', 'y'), acc('a', 0, 0), wid('w', 4, 4)];
  assert.equal(K.soltarSobre(lista, 'c', 'a', nuevoId).ok, false);
  assert.equal(K.soltarSobre(lista, 'w', 'a', nuevoId).ok, false);
  assert.equal(K.soltarSobre(lista, 'a', 'w', nuevoId).ok, false);
  assert.equal(K.soltarSobre(lista, 'a', 'a', nuevoId).ok, false);
  assert.equal(K.soltarSobre(lista, 'x', 'c', nuevoId).ok, false); // un hijo sobre su propia carpeta
});

test('soltar un hijo de una carpeta de 2 sobre un acceso deshace la carpeta de origen', () => {
  const lista = [carp('c', 1, 1, 'x', 'y'), acc('a', 5, 5)];
  const r = K.soltarSobre(lista, 'x', 'a', nuevoId);
  assert.equal(r.ok, true);
  const tipos = r.elementos.map((e) => e.tipo).sort();
  assert.deepEqual(tipos, ['acceso', 'carpeta']);
  const suelto = r.elementos.find((e) => e.tipo === 'acceso');
  assert.equal(suelto.id, 'y');
  assert.deepEqual([suelto.col, suelto.fila], [1, 1]); // ocupa la celda de la carpeta deshecha
});

test('sacar un hijo: vuelve a la cuadrícula; la carpeta de 1 hijo se deshace', () => {
  const lista = [carp('c', 1, 1, 'x', 'y')];
  const r = K.sacarDeCarpeta(lista, 'x', 4, 3, 8, 6);
  assert.equal(r.ok, true);
  assert.equal(r.elementos.length, 2);
  assert.ok(r.elementos.every((e) => e.tipo === 'acceso'));
  const x = r.elementos.find((e) => e.id === 'x');
  assert.deepEqual([x.col, x.fila], [4, 3]);
  const y = r.elementos.find((e) => e.id === 'y');
  assert.deepEqual([y.col, y.fila], [1, 1]);
});

test('sacar un hijo de una carpeta de 3 deja la carpeta con 2', () => {
  const r = K.sacarDeCarpeta([carp('c', 0, 0, 'x', 'y', 'z')], 'z', 0, 0, 8, 6);
  assert.equal(r.elementos.filter((e) => e.tipo === 'carpeta')[0].hijos.length, 2);
  const z = r.elementos.find((e) => e.id === 'z');
  assert.notDeepEqual([z.col, z.fila], [0, 0]); // la celda 0,0 está ocupada: va a la libre más cercana
});

test('sacarDeCarpeta no hace nada con un id que no es hijo', () => {
  assert.equal(K.sacarDeCarpeta([acc('a', 0, 0)], 'a', 1, 1, 8, 6).ok, false);
});

test('mover busca la celda libre más cercana y respeta los límites', () => {
  const lista = [acc('a', 0, 0), acc('b', 2, 2)];
  const r = K.mover(lista, 'a', 2, 2, 8, 6);
  assert.equal(r.ok, true);
  const a = r.elementos.find((e) => e.id === 'a');
  assert.notDeepEqual([a.col, a.fila], [2, 2]);
  const r2 = K.mover(lista, 'a', 99, 99, 8, 6);
  const a2 = r2.elementos.find((e) => e.id === 'a');
  assert.deepEqual([a2.col, a2.fila], [7, 5]);
});

test('quitar: acceso, hijo (carpeta se deshace) y carpeta vacía', () => {
  assert.deepEqual(K.quitar([acc('a', 0, 0)], 'a').elementos, []);
  const r = K.quitar([carp('c', 2, 2, 'x', 'y')], 'x');
  assert.equal(r.elementos.length, 1);
  assert.equal(r.elementos[0].id, 'y');
  assert.deepEqual([r.elementos[0].col, r.elementos[0].fila], [2, 2]);
  assert.deepEqual(K.quitar([carp('c', 2, 2, 'x', 'y')], 'c').elementos, []);
  assert.equal(K.quitar([acc('a', 0, 0)], 'nada').ok, false);
});

test('renombrar: limpia el nombre; vacío en carpeta vuelve a "Carpeta"; widgets no', () => {
  const lista = [acc('a', 0, 0), carp('c', 1, 0, 'x', 'y'), wid('w', 4, 4)];
  assert.equal(K.renombrar(lista, 'a', '  Excel 2021  ').elementos[0].nombre, 'Excel 2021');
  assert.equal(K.renombrar(lista, 'c', '   ').elementos[1].nombre, 'Carpeta');
  assert.equal(K.renombrar(lista, 'a', '   ').elementos[0].nombre, 'a'); // acceso conserva el anterior
  assert.equal(K.renombrar(lista, 'w', 'x').ok, false);
  assert.equal(K.renombrar(lista, 'x', 'Word').elementos[1].hijos[0].nombre, 'Word');
  assert.equal(K.renombrar(lista, 'a', 'x'.repeat(200)).elementos[0].nombre.length, K.MAX_NOMBRE);
});

test('agregarAcceso: sin destino va a la primera celda libre', () => {
  const r = K.agregarAcceso([acc('a', 0, 0)], { ruta: 'C:\\z\\Z.lnk', nombre: 'Z' }, null, 4, 4, nuevoId);
  assert.equal(r.ok, true);
  const z = r.elementos.find((e) => e.id === r.id);
  assert.deepEqual([z.col, z.fila], [0, 1]);
});

test('agregarAcceso sobre un acceso crea carpeta; sobre una carpeta entra', () => {
  const r = K.agregarAcceso([acc('a', 2, 2)], { ruta: 'C:\\z\\Z.lnk', nombre: 'Z' }, 'a', 4, 4, nuevoId);
  assert.equal(r.elementos.length, 1);
  assert.equal(r.elementos[0].tipo, 'carpeta');
  assert.equal(r.elementos[0].hijos.length, 2);
  const r2 = K.agregarAcceso([carp('c', 0, 0, 'x', 'y')], { ruta: 'C:\\z\\Z.lnk', nombre: 'Z' }, 'c', 4, 4, nuevoId);
  assert.equal(r2.elementos[0].hijos.length, 3);
});

test('agregarAcceso sin lugar no agrega', () => {
  const r = K.agregarAcceso([acc('a', 0, 0)], { ruta: 'C:\\z\\Z.lnk', nombre: 'Z' }, null, 1, 1, nuevoId);
  assert.equal(r.ok, false);
});

test('agregarAHijos y agregarWidget', () => {
  const r = K.agregarAHijos([carp('c', 0, 0, 'x', 'y')], 'c', { ruta: 'C:\\z\\Z.lnk', nombre: 'Z' }, nuevoId);
  assert.equal(r.elementos[0].hijos.length, 3);
  assert.equal(K.agregarAHijos([acc('a', 0, 0)], 'a', { ruta: 'C:\\z', nombre: 'Z' }, nuevoId).ok, false);
  const w = K.agregarWidget([acc('a', 0, 0)], 'reloj', 2, 2, 6, 4, nuevoId);
  assert.equal(w.ok, true);
  const nuevo = w.elementos.find((e) => e.tipo === 'widget');
  assert.deepEqual([nuevo.col, nuevo.fila, nuevo.ancho, nuevo.alto], [0, 1, 2, 2]);
});

test('deshacerCarpetas y miniaturas', () => {
  const r = K.deshacerCarpetas([carp('c', 1, 1, 'x'), carp('d', 2, 2), carp('e', 3, 3, 'a', 'b', 'c2', 'd2', 'e2')]);
  assert.deepEqual(r.map((e) => e.id), ['x', 'e']);
  assert.equal(K.miniaturas(r[1]).length, 4);
});

test('redimensionar un widget: crece si cabe, no choca ni se sale', () => {
  const C = require('../src/renderer/carpetas');
  const el = [
    { id: 'w', tipo: 'widget', widget: 'reloj', col: 0, fila: 0, ancho: 2, alto: 2 },
    { id: 'a', tipo: 'acceso', ruta: 'C:\\a.lnk', nombre: 'a', col: 4, fila: 0 },
  ];
  const r = C.redimensionar(el, 'w', 4, 3, 10, 5);
  assert.ok(r.ok);
  assert.deepStrictEqual([r.elementos[0].ancho, r.elementos[0].alto], [4, 3]);
  assert.strictEqual(el[0].ancho, 2, 'no muta la lista original');
  assert.strictEqual(C.redimensionar(el, 'w', 5, 2, 10, 5).motivo, 'choca');
  assert.strictEqual(C.redimensionar(el, 'w', 2, 6, 10, 5).motivo, 'fuera');
  assert.strictEqual(C.redimensionar(el, 'a', 2, 2, 10, 5).ok, false);
  assert.deepStrictEqual([C.redimensionar(el, 'w', 0, 1, 10, 5).elementos[0].ancho], [1]);
});
