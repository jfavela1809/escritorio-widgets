'use strict';
// Deshacer, buscador, orden y color de carpetas, y los widgets de batería, pendientes y enlaces.
const test = require('node:test');
const assert = require('node:assert/strict');
const Hist = require('../src/renderer/historial');
const Busc = require('../src/renderer/buscar');
const K = require('../src/renderer/carpetas');
const datos = require('../src/main/datos');
const bateria = require('../src/main/bateria');
const enlaces = require('../src/main/enlaces');

// Los widgets se registran en window.EscritorioWidgets: aquí uno falso que los guarda.
const registrados = {};
global.window = { EscritorioWidgets: { registrar(m) { registrados[m.id] = m; }, crear() { return {}; } } };
require('../src/renderer/widgets/bateria');
require('../src/renderer/widgets/pendientes');
require('../src/renderer/widgets/enlaces');

const acc = (id, nombre, col = 0, fila = 0) => ({ id, tipo: 'acceso', ruta: 'C:\\x\\' + id + '.lnk', nombre, col, fila });
const carp = (id, nombre, ...hijos) => ({ id, tipo: 'carpeta', nombre, col: 1, fila: 1, hijos });

test('historial: deshacer y rehacer en orden, y un cambio nuevo borra el rehacer', () => {
  const h = Hist.crear();
  const v0 = [acc('a', 'A')]; const v1 = [acc('a', 'A', 2)]; const v2 = [acc('a', 'A', 3)];
  h.registrar(v0, 'mover'); h.registrar(v1, 'mover otra vez');
  assert.equal(h.siguienteDeshacer(), 'mover otra vez');
  const d1 = h.deshacer(v2);
  assert.deepEqual(d1.elementos, v1);
  assert.deepEqual(h.deshacer(v1).elementos, v0);
  assert.equal(h.deshacer(v0), null);
  assert.deepEqual(h.rehacer(v0).elementos, v1);
  h.registrar(v1, 'quitar');
  assert.equal(h.siguienteRehacer(), null);
  h.limpiar();
  assert.equal(h.tamano(), 0);
});

test('historial: guarda como mucho 30 pasos y no deshace las opciones de los widgets', () => {
  const h = Hist.crear(3);
  for (let i = 0; i < 5; i++) h.registrar([acc('a', 'A', i)], 'paso ' + i);
  assert.equal(h.tamano(), 3);
  const w = (items, col) => ({ id: 'w', tipo: 'widget', widget: 'pendientes', col, fila: 0, ancho: 2, alto: 2, opciones: { items } });
  const h2 = Hist.crear();
  h2.registrar([w([], 0)], 'mover el widget');
  const r = h2.deshacer([w([{ t: 'nuevo', hecho: false }], 4)]);
  assert.equal(r.elementos[0].col, 0, 'regresa a su lugar');
  assert.deepEqual(r.elementos[0].opciones.items, [{ t: 'nuevo', hecho: false }], 'la lista de pendientes no se pierde');
});

test('buscador: sin acentos ni mayúsculas, también dentro de carpetas, los mejores primero', () => {
  const lista = [
    { nombre: 'Cámara', carpeta: '' }, { nombre: 'Microsoft Word', carpeta: 'Oficina' },
    { nombre: 'WordPad', carpeta: '' }, { nombre: 'Excel', carpeta: 'Oficina' }, { nombre: 'Notas', carpeta: '' },
  ];
  assert.deepEqual(Busc.filtrar(lista, 'camara').map((r) => r.nombre), ['Cámara']);
  assert.deepEqual(Busc.filtrar(lista, 'WORD').map((r) => r.nombre), ['WordPad', 'Microsoft Word']);
  assert.deepEqual(Busc.filtrar(lista, 'oficina').map((r) => r.nombre), ['Excel', 'Microsoft Word']);
  assert.deepEqual(Busc.filtrar(lista, 'oficina exc').map((r) => r.nombre), ['Excel']);
  assert.deepEqual(Busc.filtrar(lista, '   '), []);
  assert.equal(Busc.filtrar(lista, 'o', 2).length, 2);
});

test('carpetas: reordenar, ordenar por nombre y color', () => {
  const lista = [carp('c', 'Oficina', acc('w', 'Word'), acc('e', 'excel'), acc('a', 'Access'))];
  const r = K.reordenar(lista, 'c', 'a', 0);
  assert.equal(r.ok, true);
  assert.deepEqual(r.elementos[0].hijos.map((h) => h.id), ['a', 'w', 'e']);
  assert.deepEqual(lista[0].hijos.map((h) => h.id), ['w', 'e', 'a'], 'no muta la lista original');
  assert.equal(K.reordenar(lista, 'c', 'w', 0).ok, false, 'ya estaba ahí');
  assert.deepEqual(K.reordenar(lista, 'c', 'w', 99).elementos[0].hijos.map((h) => h.id), ['e', 'a', 'w']);
  assert.deepEqual(K.ordenarPorNombre(lista, 'c').elementos[0].hijos.map((h) => h.nombre), ['Access', 'excel', 'Word']);
  const col = K.colorear(lista, 'c', 'verde');
  assert.equal(col.elementos[0].color, 'verde');
  assert.equal(K.colorear(col.elementos, 'c', '').elementos[0].color, undefined);
  assert.equal(K.colorear(lista, 'c', 'fosforescente').ok, false);
  assert.equal(K.colorear([acc('x', 'X')], 'x', 'rojo').ok, false, 'solo carpetas');
});

test('datos: guarda el color válido de la carpeta y descarta el inventado', () => {
  const d = datos.normalizar({ elementos: [
    { tipo: 'carpeta', nombre: 'A', color: 'morado', hijos: [{ tipo: 'acceso', ruta: 'C:\\x\\1.lnk' }, { tipo: 'acceso', ruta: 'C:\\x\\2.lnk' }] },
    { tipo: 'carpeta', nombre: 'B', col: 2, color: 'red; background:url(x)', hijos: [{ tipo: 'acceso', ruta: 'C:\\x\\3.lnk' }, { tipo: 'acceso', ruta: 'C:\\x\\4.lnk' }] },
  ] });
  assert.equal(d.elementos[0].color, 'morado');
  assert.equal(d.elementos[1].color, undefined);
  for (const c of K.COLORES.filter(Boolean)) {
    assert.equal(datos.normalizar({ elementos: [{ tipo: 'carpeta', color: c, hijos: [{ tipo: 'acceso', ruta: 'C:\\a' }, { tipo: 'acceso', ruta: 'C:\\b' }] }] }).elementos[0].color, c);
  }
});

test('batería: interpreta GetSystemPowerStatus (laptop, cargando, PC sin batería)', () => {
  assert.deepEqual(bateria.interpretar({ ACLineStatus: 0, BatteryFlag: 0, BatteryLifePercent: 64, BatteryLifeTime: 11100 }),
    { hay: true, porcentaje: 64, enchufada: false, cargando: false, minutos: 185 });
  const c = bateria.interpretar({ ACLineStatus: 1, BatteryFlag: 8, BatteryLifePercent: 80, BatteryLifeTime: 0xFFFFFFFF });
  assert.equal(c.cargando, true); assert.equal(c.minutos, null);
  assert.deepEqual(bateria.interpretar({ ACLineStatus: 1, BatteryFlag: 128, BatteryLifePercent: 255 }), { hay: false });
  assert.deepEqual(bateria.interpretar(null), { hay: false });
  assert.deepEqual(bateria.crear({ api: { leer() { throw new Error('x'); } } }).leer(), { hay: false });
  const t = registrados.bateria.estadoTexto;
  assert.equal(t({ hay: true, porcentaje: 64, minutos: 185 }), '3 h 05 min');
  assert.equal(t({ hay: true, porcentaje: 99, cargando: true }), 'Cargando');
  assert.equal(t({ hay: false }), 'Sin batería');
});

test('pendientes: solo entra texto limpio, con tope', () => {
  const L = registrados.pendientes.limpiar;
  assert.deepEqual(L([{ t: '  Llamar  ', hecho: true }, { t: '' }, { t: 5 }, null, { t: 'a\u0007b' }]), [{ t: 'Llamar', hecho: true }, { t: 'a b', hecho: false }]);
  assert.equal(L(Array.from({ length: 150 }, (_, i) => ({ t: 'x' + i }))).length, 100);
  assert.equal(L('no es lista').length, 0);
});

test('enlaces: direcciones http/https y solo las guardadas se abren', () => {
  const N = registrados.enlaces.normalizarUrl;
  assert.equal(N('google.com'), 'https://google.com/');
  assert.equal(N('http://intranet.ejemplo.com/ventas'), 'http://intranet.ejemplo.com/ventas');
  for (const malo of ['javascript:alert(1)', 'file:///C:/Windows', 'notepad', '', 'https://user:pw@x.com', 'ms-settings:']) assert.equal(N(malo), null, malo);
  const items = registrados.enlaces.limpiar([{ url: 'youtube.com' }, { nombre: 'Mi banco', url: 'javascript:x' }]);
  assert.deepEqual(items, [{ nombre: 'Youtube', url: 'https://youtube.com/' }]);

  assert.equal(enlaces.urlValida('https://google.com'), 'https://google.com/');
  assert.equal(enlaces.urlValida('file:///C:/x'), null);
  assert.equal(enlaces.urlValida('https://a:b@x.com'), null);
  const el = [
    { tipo: 'widget', widget: 'enlaces', opciones: { items: [{ url: 'https://google.com/' }, { url: 'javascript:x' }] } },
    { tipo: 'widget', widget: 'notas', opciones: { items: [{ url: 'https://otro.com/' }] } },
  ];
  assert.deepEqual([...enlaces.guardadas(el)], ['https://google.com/']);
});
