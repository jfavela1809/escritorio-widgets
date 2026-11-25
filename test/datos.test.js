'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('../src/main/datos');
const R = require('../src/main/rutas');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'escritorio-test-'));

test('rutas: validación de rutas de Windows, UNC y rechazos', () => {
  assert.equal(R.rutaValida('C:\\Program Files\\Excel.lnk'), true);
  assert.equal(R.rutaValida('D:/datos/archivo.txt'), true);
  assert.equal(R.rutaValida('\\\\servidor\\Compartida\\a.xlsx'), true);
  assert.equal(R.rutaValida('relativa\\a.txt'), false);
  assert.equal(R.rutaValida('C:\\a\\..\\b'), false);
  assert.equal(R.rutaValida('C:\\a\\b*.txt'), false);
  assert.equal(R.rutaValida('C:\\a\u0000b'), false);
  assert.equal(R.rutaValida('\\\\solo'), false);
  assert.equal(R.rutaValida(42), false);
  assert.equal(R.rutaValida('C:\\' + 'a'.repeat(1100)), false);
  assert.equal(R.rutaValida('file:///C:/a.txt'), false);
});

test('rutas: nombreDeRuta quita .lnk/.exe y maneja carpetas y UNC', () => {
  assert.equal(R.nombreDeRuta('C:\\Users\\usuario\\Excel.lnk'), 'Excel');
  assert.equal(R.nombreDeRuta('C:\\Windows\\notepad.exe'), 'notepad');
  assert.equal(R.nombreDeRuta('C:\\Users\\usuario\\Documents\\'), 'Documents');
  assert.equal(R.nombreDeRuta('C:\\datos\\reporte.xlsx'), 'reporte.xlsx');
  assert.equal(R.nombreDeRuta('\\\\srv\\recurso\\carpeta'), 'carpeta');
});

test('rutas: filtrarRutas quita inválidas y duplicadas', () => {
  const r = R.filtrarRutas(['C:\\a.txt', 'c:\\A.TXT', 'malo', 5, 'D:\\b.txt']);
  assert.deepEqual(r, ['C:\\a.txt', 'D:\\b.txt']);
  assert.deepEqual(R.filtrarRutas('nope'), []);
});

test('normalizar: vacío y basura dan el documento por defecto', () => {
  for (const x of [undefined, null, 5, 'texto', [], {}]) {
    const d = D.normalizar(x);
    assert.equal(d.version, 1);
    assert.equal(d.celda, 96);
    assert.deepEqual(d.elementos, []);
    assert.equal(d.clima.nombre, 'Ciudad Juárez');
    assert.equal(d.notas.texto, '');
    assert.equal(d.iniciarConWindows, false);
  }
});

test('normalizar: depura accesos, ids repetidos, tipos, coordenadas y rutas inválidas', () => {
  const d = D.normalizar({
    celda: 9999,
    elementos: [
      { id: 'a1', tipo: 'acceso', ruta: 'C:\\x\\Excel.lnk', nombre: '  Excel  ', col: 2.4, fila: -3 },
      { id: 'a1', tipo: 'acceso', ruta: 'C:\\x\\Word.lnk', col: 'x', fila: 1000 },
      { tipo: 'acceso', ruta: 'relativa' },
      { tipo: 'rarito', ruta: 'C:\\x' },
      null,
      { tipo: 'widget', widget: 'reloj', col: 4, fila: 0, ancho: 99, alto: 0, opciones: { a: 1 } },
      { tipo: 'widget', widget: '../malo', col: 0, fila: 0 },
    ],
  });
  assert.equal(d.celda, 160);
  assert.equal(d.elementos.length, 3);
  const [a, b, w] = d.elementos;
  assert.equal(a.nombre, 'Excel');
  assert.deepEqual([a.col, a.fila], [2, 0]);
  assert.notEqual(b.id, 'a1');
  assert.equal(b.nombre, 'Word');
  assert.deepEqual([b.col, b.fila], [0, 500]);
  assert.deepEqual([w.ancho, w.alto], [8, 1]);
  assert.deepEqual(w.opciones, { a: 1 });
  assert.equal(new Set(d.elementos.map((e) => e.id)).size, 3);
});

test('normalizar: carpetas (hijos válidos, 1 hijo se deshace, vacía se descarta)', () => {
  const h = (id, ruta) => ({ id, tipo: 'acceso', ruta, nombre: id });
  const d = D.normalizar({
    elementos: [
      { id: 'c1', tipo: 'carpeta', nombre: 'Oficina', col: 1, fila: 0, hijos: [h('a', 'C:\\a.lnk'), h('b', 'C:\\b.lnk'), h('c', 'mala')] },
      { id: 'c2', tipo: 'carpeta', nombre: 'Sola', col: 3, fila: 3, hijos: [h('d', 'C:\\d.lnk'), h('e', 'mala')] },
      { id: 'c3', tipo: 'carpeta', nombre: 'Vacía', col: 5, fila: 5, hijos: [] },
      { id: 'c4', tipo: 'carpeta', col: 6, fila: 6, hijos: [h('f', 'C:\\f.lnk'), { id: 'g', tipo: 'carpeta', hijos: [] }, h('h', 'C:\\h.lnk')] },
    ],
  });
  assert.equal(d.elementos.length, 3);
  assert.equal(d.elementos[0].tipo, 'carpeta');
  assert.equal(d.elementos[0].hijos.length, 2);
  assert.equal(d.elementos[1].tipo, 'acceso');
  assert.deepEqual([d.elementos[1].col, d.elementos[1].fila], [3, 3]);
  assert.equal(d.elementos[2].nombre, 'Carpeta'); // sin nombre: valor por defecto
  assert.equal(d.elementos[2].hijos.length, 2);   // una carpeta dentro de otra no es válida
});

test('normalizar: clima, notas y banderas', () => {
  const d = D.normalizar({ clima: { nombre: 'Chihuahua', lat: 28.6, lon: -106.1 }, notas: { texto: 'hola' }, iniciarConWindows: true });
  assert.deepEqual(d.clima, { nombre: 'Chihuahua', lat: 28.6, lon: -106.1 });
  assert.equal(d.notas.texto, 'hola');
  assert.equal(d.iniciarConWindows, true);
  assert.equal(D.normalizar({ clima: { lat: 500, lon: 'x' } }).clima.lat, 31.69);
  assert.equal(D.normalizar({ iniciarConWindows: 'si' }).iniciarConWindows, false);
});

test('normalizar: es idempotente', () => {
  const d1 = D.normalizar({ elementos: [{ tipo: 'acceso', ruta: 'C:\\a.lnk', col: 1, fila: 1 }] });
  assert.deepEqual(D.normalizar(d1), d1);
});

test('guardar y cargar: ida y vuelta, escritura atómica sin .tmp sobrante', () => {
  const dir = tmp();
  const ruta = path.join(dir, 'sub', 'escritorio.json');
  const g = D.guardar(ruta, { elementos: [{ id: 'a', tipo: 'acceso', ruta: 'C:\\a.lnk', col: 1, fila: 2 }] });
  const { datos, roto } = D.cargar(ruta);
  assert.equal(roto, null);
  assert.deepEqual(datos, g);
  assert.deepEqual(fs.readdirSync(path.dirname(ruta)), ['escritorio.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cargar: archivo inexistente da datos vacíos sin crear nada', () => {
  const dir = tmp();
  const r = D.cargar(path.join(dir, 'escritorio.json'));
  assert.equal(r.roto, null);
  assert.deepEqual(r.datos.elementos, []);
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cargar: JSON dañado se renombra a .roto-<fecha> y se arranca vacío', () => {
  const dir = tmp();
  const ruta = path.join(dir, 'escritorio.json');
  fs.writeFileSync(ruta, '{ "elementos": [ {"tipo": ');
  const r = D.cargar(ruta, new Date(2026, 10, 24, 9, 5, 7));
  assert.deepEqual(r.datos.elementos, []);
  assert.ok(r.roto.endsWith('escritorio.json.roto-20261124-090507'));
  assert.equal(fs.existsSync(ruta), false);
  assert.equal(fs.readFileSync(r.roto, 'utf8'), '{ "elementos": [ {"tipo": ');
  // Un segundo daño el mismo segundo no pisa el respaldo anterior.
  fs.writeFileSync(ruta, 'basura');
  const r2 = D.cargar(ruta, new Date(2026, 10, 24, 9, 5, 7));
  assert.notEqual(r2.roto, r.roto);
  assert.equal(fs.readFileSync(r.roto, 'utf8'), '{ "elementos": [ {"tipo": ');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cargar: un JSON válido pero que no es objeto también se respalda', () => {
  const dir = tmp();
  const ruta = path.join(dir, 'escritorio.json');
  fs.writeFileSync(ruta, '[1,2,3]');
  const r = D.cargar(ruta);
  assert.ok(r.roto);
  assert.equal(fs.existsSync(ruta), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cargar: acepta BOM y normaliza campos malos sin considerarlo dañado', () => {
  const dir = tmp();
  const ruta = path.join(dir, 'escritorio.json');
  fs.writeFileSync(ruta, '\uFEFF' + JSON.stringify({ elementos: [{ tipo: 'acceso', ruta: 'mala' }, { tipo: 'acceso', ruta: 'C:\\ok.lnk' }] }));
  const r = D.cargar(ruta);
  assert.equal(r.roto, null);
  assert.equal(r.datos.elementos.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('clima: ciudad con rangos válidos, límites y valores raros', () => {
  const c = (o) => D.normalizar({ clima: o }).clima;
  assert.deepEqual(c({ nombre: 'Polo', lat: -90, lon: 180 }), { nombre: 'Polo', lat: -90, lon: 180 });
  assert.equal(c({ lat: 90.1 }).lat, 31.69);
  assert.equal(c({ lat: -90.1 }).lat, 31.69);
  assert.equal(c({ lon: 180.5 }).lon, -106.42);
  assert.equal(c({ lat: '31.5', lon: '-106.1' }).lat, 31.5);
  assert.equal(c({ lat: null }).lat, 31.69);
  assert.equal(c({ lat: NaN, lon: Infinity }).lon, -106.42);
  assert.equal(c({ nombre: '   ' }).nombre, 'Ciudad Juárez');
  assert.equal(c({ nombre: 'x'.repeat(500) }).nombre.length, 80);
  assert.equal(c('texto').nombre, 'Ciudad Juárez');
  assert.equal(c(undefined).lat, 31.69);
});

test('clima: caché del último dato (válido, de otra ciudad y dañado)', () => {
  const cache = { temperatura: 14.64, codigo: 2.2, esDia: false, atardecer: '2026-11-24T17:02', horaLocal: '2026-11-24T10:30', actualizado: 1700000000000, lat: 31.69, lon: -106.42 };
  const ok = D.normalizar({ clima: { cache } }).clima;
  assert.deepEqual(ok.cache, { ...cache, temperatura: 14.6, codigo: 2 });
  assert.equal('cache' in D.normalizar({}).clima, false);
  assert.equal('cache' in D.normalizar({ clima: { lat: 28.6, lon: -106.1, cache } }).clima, false);
  for (const malo of [{ ...cache, temperatura: 999 }, { ...cache, codigo: -1 }, { ...cache, actualizado: 0 }, { ...cache, lat: 'x' }, 'hola', [], null]) {
    assert.equal('cache' in D.normalizar({ clima: { cache: malo } }).clima, false);
  }
  const raro = D.normalizar({ clima: { cache: { ...cache, atardecer: 'tarde', horaLocal: 5 } } }).clima.cache;
  assert.equal(raro.atardecer, null);
  assert.equal(raro.horaLocal, null);
  assert.deepEqual(D.normalizar(D.normalizar({ clima: { cache } })), D.normalizar({ clima: { cache } }));
});

test('notas: texto largo se recorta y valores no texto quedan vacíos', () => {
  assert.equal(D.normalizar({ notas: { texto: 'a'.repeat(D.MAX_NOTAS + 50) } }).notas.texto.length, D.MAX_NOTAS);
  assert.equal(D.normalizar({ notas: { texto: 42 } }).notas.texto, '');
  assert.equal(D.normalizar({ notas: 'hola' }).notas.texto, '');
  const multi = 'línea 1\nlínea 2\n\tcon tab ñ 🙂';
  assert.equal(D.normalizar({ notas: { texto: multi } }).notas.texto, multi);
});

test('widgets: ancho y alto por widget, opciones grandes se descartan, ids únicos', () => {
  const d = D.normalizar({ elementos: [
    { id: 'w1', tipo: 'widget', widget: 'clima', col: 0, fila: 0, ancho: 4, alto: 1, opciones: { x: 'y'.repeat(30000) } },
    { id: 'w1', tipo: 'widget', widget: 'uso-pc', col: 0, fila: 1, ancho: 2, alto: 1 },
    { tipo: 'widget', widget: 'reloj', col: 0, fila: 2, ancho: 2, alto: 2 },
  ] });
  assert.equal(d.elementos.length, 3);
  assert.deepEqual(d.elementos[0].opciones, {});
  assert.deepEqual(d.elementos.map((e) => e.widget), ['clima', 'uso-pc', 'reloj']);
  assert.equal(new Set(d.elementos.map((e) => e.id)).size, 3);
  assert.deepEqual([d.elementos[0].ancho, d.elementos[0].alto], [4, 1]);
});

test('guardar: el caché del clima y las notas sobreviven ida y vuelta', () => {
  const dir = tmp();
  const ruta = path.join(dir, 'escritorio.json');
  const cache = { temperatura: 10, codigo: 3, atardecer: '2026-11-24T17:02', horaLocal: '2026-11-24T09:00', actualizado: 1700000000000, lat: 31.69, lon: -106.42 };
  D.guardar(ruta, { clima: { cache }, notas: { texto: 'hola\nmundo' } });
  const { datos } = D.cargar(ruta);
  assert.equal(datos.clima.cache.temperatura, 10);
  assert.equal(datos.clima.cache.esDia, true);
  assert.equal(datos.notas.texto, 'hola\nmundo');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('respaldo diario: una copia por día y solo las últimas 7', () => {
  const fs2 = require('fs'); const os2 = require('os'); const path2 = require('path');
  const D = require('../src/main/datos');
  const dir = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'respaldo-'));
  const f = path2.join(dir, 'escritorio.json');
  assert.strictEqual(D.respaldoDiario(f, new Date(2026, 10, 1)), null, 'sin archivo no hay copia');
  fs2.writeFileSync(f, '{"v":1}');
  for (let d = 1; d <= 9; d++) D.respaldoDiario(f, new Date(2026, 10, d));
  assert.strictEqual(D.respaldoDiario(f, new Date(2026, 10, 9, 23)), null, 'el mismo día no se repite');
  const copias = fs2.readdirSync(dir).filter((n) => n.includes('.respaldo-')).sort();
  assert.deepStrictEqual(copias, [3, 4, 5, 6, 7, 8, 9].map((d) => 'escritorio.json.respaldo-202611' + String(d).padStart(2, '0')));
  assert.strictEqual(fs2.readFileSync(path2.join(dir, copias[6]), 'utf8'), '{"v":1}');
  assert.ok(fs2.existsSync(f), 'el archivo original sigue');
  fs2.rmSync(dir, { recursive: true, force: true });
});
