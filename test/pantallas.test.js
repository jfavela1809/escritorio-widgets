'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/main/pantallas');
const datos = require('../src/main/datos');

// Dos monitores de ejemplo: la laptop al 125 % y la HDMI a la izquierda al 100 %.
const laptop = { id: 608213204, label: '', bounds: { x: 0, y: 0, width: 1536, height: 864 }, scaleFactor: 1.25 };
const hdmi = { id: 1771667228, label: 'HDMI', bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };

test('claves estables por nombre y resolución física, con nombres legibles', () => {
  const l = P.listar([laptop, hdmi], laptop.id);
  assert.deepStrictEqual(l.map((p) => p.clave), ['HDMI|1920x1080', 'interna|1920x1080']);
  assert.strictEqual(l.find((p) => p.principal).clave, 'interna|1920x1080');
  assert.strictEqual(l[0].nombre, 'la pantalla de la izquierda (HDMI)');
  assert.strictEqual(l[1].nombre, 'la pantalla principal');
  // El id de Windows cambió (otro orden al conectar): la clave no.
  assert.deepStrictEqual(P.listar([{ ...hdmi, id: 5 }, { ...laptop, id: 9 }], 9).map((p) => p.clave), ['HDMI|1920x1080', 'interna|1920x1080']);
  // Dos monitores iguales no comparten clave.
  const dos = P.listar([{ ...hdmi, id: 1 }, { ...hdmi, id: 2, bounds: { ...hdmi.bounds, x: 0 } }], 1);
  assert.notStrictEqual(dos[0].clave, dos[1].clave);
});

const conectadas = new Set(['HDMI|1920x1080', 'interna|1920x1080']);
const PR = 'interna|1920x1080';

test('cada lienzo ve solo lo suyo; sin pantalla o con una desconectada, la principal', () => {
  const el = [{ id: 'a' }, { id: 'b', pantalla: 'HDMI|1920x1080' }, { id: 'c', pantalla: 'viejo|800x600' }];
  assert.deepStrictEqual(P.deLaPantalla(el, PR, conectadas, PR).map((e) => e.id), ['a', 'c']);
  assert.deepStrictEqual(P.deLaPantalla(el, 'HDMI|1920x1080', conectadas, PR).map((e) => e.id), ['b']);
});

test('fusionar reemplaza solo lo de esa pantalla y no deja duplicados al pasar un elemento', () => {
  const todos = [{ id: 'a', pantalla: PR }, { id: 'b', pantalla: 'HDMI|1920x1080' }, { id: 'c', pantalla: 'viejo|800x600' }];
  // La HDMI recibió "a" y lo guarda: deja de estar en la principal.
  const r = P.fusionar(todos, 'HDMI|1920x1080', [{ id: 'b' }, { id: 'a' }], conectadas, PR);
  assert.deepStrictEqual(r.map((e) => [e.id, e.pantalla]), [['c', 'viejo|800x600'], ['b', 'HDMI|1920x1080'], ['a', 'HDMI|1920x1080']]);
  // La principal guarda "c" (de un monitor desconectado): conserva su clave para volver a él.
  const r2 = P.fusionar(todos, PR, [{ id: 'c', pantalla: 'viejo|800x600', col: 3 }], conectadas, PR);
  assert.deepStrictEqual(r2.map((e) => [e.id, e.pantalla]), [['b', 'HDMI|1920x1080'], ['c', 'viejo|800x600']]);
});

test('datos conserva la pantalla (y la pasa al deshacer una carpeta de un solo hijo)', () => {
  const d = datos.normalizar({ elementos: [
    { tipo: 'acceso', ruta: 'C:\\x\\a.lnk', col: 1, fila: 1, pantalla: 'HDMI|1920x1080' },
    { tipo: 'carpeta', nombre: 'X', col: 2, fila: 2, pantalla: 'HDMI|1920x1080', hijos: [{ tipo: 'acceso', ruta: 'C:\\x\\b.lnk' }] },
    { tipo: 'widget', widget: 'reloj', ancho: 2, alto: 2, pantalla: 'mal\u0001' },
  ] });
  assert.deepStrictEqual(d.elementos.map((e) => e.pantalla), ['HDMI|1920x1080', 'HDMI|1920x1080', undefined]);
});
