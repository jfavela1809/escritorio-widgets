'use strict';
// Ninguna prueba toca internet: el fetch siempre es inyectado.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/main/clima');

const PRONOSTICO = {
  latitude: 31.7, longitude: -106.4, timezone: 'America/Ojinaga', timezone_abbreviation: 'GMT-6',
  current_units: { temperature_2m: '°C', weather_code: 'wmo code', is_day: '' },
  current: { time: '2026-11-24T10:30', interval: 900, temperature_2m: 14.6, weather_code: 2, is_day: 1 },
  daily_units: { time: 'iso8601', sunset: 'iso8601' },
  daily: { time: ['2026-11-24'], sunset: ['2026-11-24T17:02'] },
};

const respuesta = (obj, ok = true, status = 200) => ({ ok, status, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });

test('códigos de clima: icono y texto, noche y desconocidos', () => {
  assert.deepEqual(C.infoCodigo(0, true), { texto: 'Despejado', icono: '☀️' });
  assert.equal(C.infoCodigo(0, false).icono, '🌙');
  assert.equal(C.infoCodigo(2).texto, 'Parcialmente nublado');
  assert.equal(C.infoCodigo(3).texto, 'Nublado');
  assert.equal(C.infoCodigo(63).texto, 'Lluvia');
  assert.equal(C.infoCodigo(75).texto, 'Nieve');
  assert.equal(C.infoCodigo(95).texto, 'Tormenta');
  assert.equal(C.infoCodigo(99).texto, 'Tormenta con granizo');
  assert.equal(C.infoCodigo(1234).texto, 'Sin datos');
  // Todos los códigos WMO que documenta Open-Meteo tienen descripción.
  for (const c of [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]) {
    assert.notEqual(C.infoCodigo(c).texto, 'Sin datos', 'código ' + c);
  }
});

test('hora del atardecer en formato es-MX (a. m. / p. m.)', () => {
  assert.equal(C.horaEs('2026-11-24T17:02'), '5:02 p. m.');
  assert.equal(C.horaEs('2026-11-24T00:05'), '12:05 a. m.');
  assert.equal(C.horaEs('2026-11-24T12:00'), '12:00 p. m.');
  assert.equal(C.horaEs('2026-06-24T06:48'), '6:48 a. m.');
  assert.equal(C.horaEs('basura'), null);
  assert.equal(C.horaEs('2026-11-24T25:00'), null);
  assert.equal(C.textoAtardecer('2026-11-24T17:02', '2026-11-24T10:30'), 'Atardecer a las 5:02 p. m.');
  assert.equal(C.textoAtardecer('2026-11-24T17:02', '2026-11-24T18:00'), 'Atardeció a las 5:02 p. m.');
  assert.equal(C.textoAtardecer('2026-11-24T13:05', null), 'Atardecer a la 1:05 p. m.');
  assert.equal(C.textoAtardecer(null, null), '');
});

test('parsearPronostico: respuesta de ejemplo de Open-Meteo', () => {
  const c = C.parsearPronostico(PRONOSTICO, 31.69, -106.42, 1000);
  assert.deepEqual(c, {
    temperatura: 14.6, codigo: 2, esDia: true, atardecer: '2026-11-24T17:02', horaLocal: '2026-11-24T10:30',
    actualizado: 1000, lat: 31.69, lon: -106.42,
  });
  const p = C.presentar(c);
  assert.deepEqual(p, { temperatura: 15, icono: '⛅', descripcion: 'Parcialmente nublado', atardecer: 'Atardecer a las 5:02 p. m.', actualizado: 1000 });
});

test('parsearPronostico: de noche, sin atardecer y respuestas inválidas', () => {
  const noche = { current: { time: '2026-11-24T22:00', temperature_2m: -3.2, weather_code: 0, is_day: 0 } };
  const c = C.parsearPronostico(noche, 1, 2, 5);
  assert.equal(c.esDia, false);
  assert.equal(c.atardecer, null);
  assert.equal(C.presentar(c).icono, '🌙');
  assert.equal(C.presentar(c).temperatura, -3);
  assert.equal(C.presentar(c).atardecer, '');
  for (const malo of [null, {}, { current: {} }, { current: { temperature_2m: '14', weather_code: 2 } }, { current: { temperature_2m: 1 } }]) {
    assert.throws(() => C.parsearPronostico(malo, 1, 2, 5), /no válida/);
  }
});

test('parsearCiudades: respuesta de geocodificación y entradas dañadas', () => {
  const r = C.parsearCiudades({ results: [
    { id: 1, name: 'Ciudad Juárez', latitude: 31.72, longitude: -106.46, country: 'México', admin1: 'Chihuahua' },
    { name: 'Sin coordenadas' },
    { name: 'Fuera de rango', latitude: 200, longitude: 0 },
    null,
    { name: 'Juárez', latitude: 25.65, longitude: -100.1, country: 'México' },
  ] });
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { nombre: 'Ciudad Juárez', detalle: 'Chihuahua, México', lat: 31.72, lon: -106.46 });
  assert.equal(r[1].detalle, 'México');
  assert.deepEqual(C.parsearCiudades({}), []); // sin resultados Open-Meteo omite "results"
  assert.deepEqual(C.parsearCiudades(null), []);
});

test('URLs: coordenadas, zona automática e idioma español', () => {
  const u = new URL(C.urlPronostico(31.69, -106.42));
  assert.equal(u.origin, 'https://api.open-meteo.com');
  assert.equal(u.searchParams.get('latitude'), '31.69');
  assert.equal(u.searchParams.get('longitude'), '-106.42');
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.equal(u.searchParams.get('daily'), 'sunset');
  assert.match(u.searchParams.get('current'), /temperature_2m,weather_code/);
  const g = new URL(C.urlGeocodificacion('Ciudad Juárez'));
  assert.equal(g.origin, 'https://geocoding-api.open-meteo.com');
  assert.equal(g.searchParams.get('name'), 'Ciudad Juárez');
  assert.equal(g.searchParams.get('language'), 'es');
});

// Servicio con fetch, reloj y guardado inyectados.
function montar({ fetch, cache = null, t0 = 1_000_000, tiempoLimite } = {}) {
  const e = { ciudad: { nombre: 'Ciudad Juárez', lat: 31.69, lon: -106.42, ...(cache ? { cache } : {}) }, t: t0, guardados: 0 };
  e.servicio = C.crearServicio({
    fetch,
    ciudad: () => e.ciudad,
    guardarCache: (c) => { e.ciudad = { ...e.ciudad, cache: c }; e.guardados++; },
    ahora: () => e.t,
    tiempoLimite,
  });
  return e;
}

test('servicio: pide, guarda el caché y no vuelve a pedir dentro de la vigencia', async () => {
  const llamadas = [];
  const e = montar({ fetch: async (url) => { llamadas.push(url); return respuesta(PRONOSTICO); } });
  const a = await e.servicio.obtener();
  assert.equal(a.error, null);
  assert.equal(a.desactualizado, false);
  assert.equal(a.ciudad, 'Ciudad Juárez');
  assert.equal(a.dato.temperatura, 15);
  assert.equal(llamadas.length, 1);
  assert.equal(e.guardados, 1);
  e.t += 10 * 60000;
  await e.servicio.obtener();
  assert.equal(llamadas.length, 1, 'dentro de la vigencia usa el caché');
  e.t += 25 * 60000; // 35 min en total
  await e.servicio.obtener();
  assert.equal(llamadas.length, 2, 'pasada la vigencia vuelve a pedir');
  await e.servicio.obtener({ forzar: true });
  assert.equal(llamadas.length, 3, 'forzar siempre pide');
});

test('servicio: sin red devuelve el último dato guardado marcado como desactualizado', async () => {
  const viejo = C.parsearPronostico(PRONOSTICO, 31.69, -106.42, 1_000_000 - 3 * 3600_000);
  const e = montar({ cache: viejo, fetch: async () => { throw new TypeError('fetch failed'); } });
  const r = await e.servicio.obtener();
  assert.equal(r.error, 'Sin conexión');
  assert.equal(r.desactualizado, true);
  assert.equal(r.dato.temperatura, 15);
  assert.equal(r.dato.actualizado, viejo.actualizado);
  assert.equal(e.guardados, 0, 'un fallo no pisa el caché');
});

test('servicio: sin red y sin caché da error y dato nulo (sin lanzar)', async () => {
  const e = montar({ fetch: async () => { throw new TypeError('fetch failed'); } });
  const r = await e.servicio.obtener();
  assert.equal(r.dato, null);
  assert.equal(r.error, 'Sin conexión');
  assert.equal(r.desactualizado, false);
});

test('servicio: respuesta con error HTTP, JSON roto y estructura inválida', async () => {
  const casos = [
    [respuesta({ error: true }, false, 500), /error \(500\)/],
    [respuesta('<html>no es json</html>'), /no válida/],
    [respuesta({ current: {} }), /no válida/],
  ];
  for (const [res, patron] of casos) {
    const e = montar({ fetch: async () => res });
    const r = await e.servicio.obtener();
    assert.match(r.error, patron);
    assert.equal(r.dato, null);
  }
});

test('servicio: tiempo límite (no espera a un fetch que nunca responde)', async () => {
  const e = montar({ tiempoLimite: 30, fetch: () => new Promise(() => {}) });
  const t0 = Date.now();
  const r = await e.servicio.obtener();
  assert.equal(r.error, 'Tiempo agotado');
  assert.ok(Date.now() - t0 < 2000);
});

test('servicio: dos pedidos a la vez comparten una sola petición', async () => {
  let n = 0;
  const e = montar({ fetch: async () => { n++; await new Promise((r) => setTimeout(r, 20)); return respuesta(PRONOSTICO); } });
  const [a, b] = await Promise.all([e.servicio.obtener(), e.servicio.obtener()]);
  assert.equal(n, 1);
  assert.equal(a.dato.temperatura, b.dato.temperatura);
});

test('servicio: si cambia la ciudad durante la petición, el dato no se guarda', async () => {
  let e;
  e = montar({ fetch: async () => { e.ciudad = { nombre: 'Chihuahua', lat: 28.6, lon: -106.1 }; return respuesta(PRONOSTICO); } });
  await e.servicio.obtener();
  assert.equal(e.guardados, 0);
});

test('buscarCiudades: resultados, texto corto, sin red', async () => {
  let url = '';
  const e = montar({ fetch: async (u) => { url = u; return respuesta({ results: [{ name: 'Chihuahua', latitude: 28.63, longitude: -106.08, country: 'México', admin1: 'Chihuahua' }] }); } });
  const r = await e.servicio.buscarCiudades('  Chihuahua ');
  assert.equal(r.ciudades.length, 1);
  assert.equal(new URL(url).searchParams.get('name'), 'Chihuahua');
  assert.deepEqual(await e.servicio.buscarCiudades('a'), { ciudades: [], error: null });
  assert.deepEqual(await e.servicio.buscarCiudades(42), { ciudades: [], error: null });
  const sinRed = montar({ fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.deepEqual(await sinRed.servicio.buscarCiudades('Chihuahua'), { ciudades: [], error: 'Sin conexión' });
});

test('fetch falso del smoke tiene el formato de Open-Meteo', async () => {
  const f = C.crearFetchFalso();
  const e = montar({ fetch: f });
  const r = await e.servicio.obtener();
  assert.equal(r.dato.atardecer, 'Atardecer a las 5:02 p. m.');
  f.fallar = true;
  assert.equal((await e.servicio.obtener({ forzar: true })).error, 'Sin conexión');
  assert.ok(f.llamadas.every((u) => u.startsWith('https://api.open-meteo.com/')));
});
