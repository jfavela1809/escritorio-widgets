'use strict';
// Clima con Open-Meteo (sin clave). Todo se pide desde el proceso principal con el fetch de Node
// (el renderer no hace peticiones: CSP default-src 'self'). Sin importar electron: el fetch, el
// reloj y el guardado del caché se inyectan, así las pruebas no tocan internet.

const URL_PRONOSTICO = 'https://api.open-meteo.com/v1/forecast';
const URL_GEOCODIFICACION = 'https://geocoding-api.open-meteo.com/v1/search';
const TIEMPO_LIMITE_MS = 10000;
// El widget refresca cada 30 min; con 29 el caché siempre ya venció cuando le toca (el reloj puede ir un poco antes).
const VIGENCIA_MS = 29 * 60 * 1000;
const MAX_RESPUESTA = 512 * 1024;

// Códigos WMO que usa Open-Meteo -> descripción en español y emoji (de noche cambia el cielo despejado).
const CODIGOS = [
  [[0], 'Despejado', '☀️', '🌙'],
  [[1], 'Mayormente despejado', '🌤️', '🌙'],
  [[2], 'Parcialmente nublado', '⛅', '☁️'],
  [[3], 'Nublado', '☁️', '☁️'],
  [[45, 48], 'Niebla', '🌫️', '🌫️'],
  [[51, 53, 55], 'Llovizna', '🌦️', '🌧️'],
  [[56, 57], 'Llovizna helada', '🌧️', '🌧️'],
  [[61, 63, 65], 'Lluvia', '🌧️', '🌧️'],
  [[66, 67], 'Lluvia helada', '🌧️', '🌧️'],
  [[71, 73, 75, 77], 'Nieve', '🌨️', '🌨️'],
  [[80, 81, 82], 'Chubascos', '🌦️', '🌧️'],
  [[85, 86], 'Chubascos de nieve', '🌨️', '🌨️'],
  [[95], 'Tormenta', '⛈️', '⛈️'],
  [[96, 99], 'Tormenta con granizo', '⛈️', '⛈️'],
];

function infoCodigo(codigo, esDia = true) {
  for (const [lista, texto, dia, noche] of CODIGOS) {
    if (lista.includes(codigo)) return { texto, icono: esDia ? dia : noche };
  }
  return { texto: 'Sin datos', icono: '🌡️' };
}

// "2026-11-24T17:02" -> "5:02 p. m." (la hora ya viene en la zona de la ciudad: timezone=auto).
function horaEs(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const h = Number(m[1]); const min = m[2];
  if (h > 23 || Number(min) > 59) return null;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

// "Atardecer a las 5:02 p. m." (en pasado si ya atardeció en la ciudad: "Atardeció a las ...").
function textoAtardecer(atardecer, horaLocal) {
  const h = horaEs(atardecer);
  if (!h) return '';
  const pasado = typeof horaLocal === 'string' && horaLocal.slice(0, 16) >= String(atardecer).slice(0, 16);
  const articulo = h.split(':')[0] === '1' ? 'la' : 'las';
  return `${pasado ? 'Atardeció' : 'Atardecer'} a ${articulo} ${h}`;
}

function urlPronostico(lat, lon) {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    current: 'temperature_2m,weather_code,is_day', daily: 'sunset', timezone: 'auto', forecast_days: '1',
  });
  return `${URL_PRONOSTICO}?${p}`;
}

function urlGeocodificacion(nombre) {
  const p = new URLSearchParams({ name: nombre, count: '6', language: 'es', format: 'json' });
  return `${URL_GEOCODIFICACION}?${p}`;
}

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const hora16 = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? v.slice(0, 16) : null);

// Respuesta de /v1/forecast -> dato para guardar en caché. Lanza Error si no tiene lo mínimo.
function parsearPronostico(json, lat, lon, ahoraMs) {
  const c = json && json.current;
  if (!c || !esNumero(c.temperature_2m) || !esNumero(c.weather_code)) throw new Error('Respuesta del clima no válida');
  const sunset = json.daily && Array.isArray(json.daily.sunset) ? hora16(json.daily.sunset[0]) : null;
  return {
    temperatura: Math.round(c.temperature_2m * 10) / 10,
    codigo: Math.round(c.weather_code),
    esDia: c.is_day !== 0,
    atardecer: sunset,
    horaLocal: hora16(c.time),
    actualizado: ahoraMs, lat, lon,
  };
}

// Respuesta de la geocodificación -> [{ nombre, detalle, lat, lon }] (hasta 6).
function parsearCiudades(json) {
  const lista = json && Array.isArray(json.results) ? json.results : [];
  const salida = [];
  for (const r of lista) {
    if (!r || typeof r.name !== 'string' || !esNumero(r.latitude) || !esNumero(r.longitude)) continue;
    if (Math.abs(r.latitude) > 90 || Math.abs(r.longitude) > 180) continue;
    const detalle = [r.admin1, r.country].filter((x) => typeof x === 'string' && x).join(', ');
    salida.push({ nombre: r.name.slice(0, 80), detalle: detalle.slice(0, 120), lat: r.latitude, lon: r.longitude });
    if (salida.length >= 6) break;
  }
  return salida;
}

// Dato listo para el renderer.
function presentar(cache) {
  if (!cache) return null;
  const info = infoCodigo(cache.codigo, cache.esDia !== false);
  return {
    temperatura: Math.round(cache.temperatura), icono: info.icono, descripcion: info.texto,
    atardecer: textoAtardecer(cache.atardecer, cache.horaLocal), actualizado: cache.actualizado,
  };
}

// GET con tiempo límite. Solo se piden las dos direcciones de Open-Meteo (las arma este módulo).
async function pedirJson(fetchFn, url, limiteMs) {
  const control = new AbortController();
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => { control.abort(); rechazar(new Error('Tiempo agotado')); }, limiteMs);
  });
  try {
    const tarea = (async () => {
      const res = await fetchFn(url, { signal: control.signal, headers: { accept: 'application/json' } });
      if (!res || !res.ok) throw new Error('El servicio respondió con error' + (res && res.status ? ` (${res.status})` : ''));
      const t = await res.text();
      if (typeof t !== 'string' || t.length > MAX_RESPUESTA) throw new Error('Respuesta demasiado grande');
      try { return JSON.parse(t); } catch (_) { throw new Error('Respuesta del clima no válida'); }
    })();
    tarea.catch(() => {}); // si gana el límite, no dejar un rechazo sin atender
    return await Promise.race([tarea, limite]);
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Tiempo agotado');
    const pista = String(e && e.message) + String(e && e.cause && e.cause.code);
    if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|network/i.test(pista)) throw new Error('Sin conexión');
    throw e;
  } finally { clearTimeout(temporizador); }
}

// Servicio del clima. dep: { fetch, ciudad(): {nombre,lat,lon,cache?}, guardarCache(cache, ciudad), ahora(), tiempoLimite }
function crearServicio(dep) {
  const ahora = dep.ahora || (() => Date.now());
  const limite = dep.tiempoLimite || TIEMPO_LIMITE_MS;
  const fetchFn = dep.fetch;
  let enCurso = null;
  let claveEnCurso = '';

  async function refrescar(ciudad) {
    const json = await pedirJson(fetchFn, urlPronostico(ciudad.lat, ciudad.lon), limite);
    const cache = parsearPronostico(json, ciudad.lat, ciudad.lon, ahora());
    const actual = dep.ciudad();
    // Si mientras tanto cambió la ciudad, el dato ya no sirve para guardarlo.
    if (actual.lat === ciudad.lat && actual.lon === ciudad.lon) dep.guardarCache(cache, actual);
    return cache;
  }

  // Devuelve { ciudad, dato, error, desactualizado }. Nunca lanza: sin red devuelve el último dato.
  async function obtener({ forzar = false } = {}) {
    const ciudad = dep.ciudad();
    const guardado = ciudad.cache || null;
    const edad = guardado ? ahora() - guardado.actualizado : Infinity;
    if (guardado && !forzar && edad >= 0 && edad < VIGENCIA_MS) {
      return { ciudad: ciudad.nombre, dato: presentar(guardado), error: null, desactualizado: false };
    }
    try {
      const clave = ciudad.lat + ',' + ciudad.lon;
      if (!enCurso || claveEnCurso !== clave) {
        claveEnCurso = clave;
        const propia = refrescar(ciudad).finally(() => { if (enCurso === propia) enCurso = null; });
        enCurso = propia;
      }
      const nuevo = await enCurso;
      return { ciudad: ciudad.nombre, dato: presentar(nuevo), error: null, desactualizado: false };
    } catch (e) {
      return {
        ciudad: ciudad.nombre, dato: presentar(guardado),
        error: e && e.message ? e.message : 'No se pudo obtener el clima', desactualizado: !!guardado,
      };
    }
  }

  async function buscarCiudades(texto) {
    const t = typeof texto === 'string' ? texto.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) : '';
    if (t.length < 2) return { ciudades: [], error: null };
    try {
      return { ciudades: parsearCiudades(await pedirJson(fetchFn, urlGeocodificacion(t), limite)), error: null };
    } catch (e) {
      return { ciudades: [], error: e && e.message ? e.message : 'No se pudo buscar' };
    }
  }

  return { obtener, buscarCiudades };
}

// Fetch falso para el smoke y las pruebas sin red: respuestas con el mismo formato de Open-Meteo.
function crearFetchFalso() {
  const f = async (url) => {
    f.llamadas.push(String(url));
    if (f.fallar) throw new TypeError('fetch failed');
    const u = new URL(url);
    let cuerpo;
    if (u.hostname === 'geocoding-api.open-meteo.com') {
      cuerpo = { results: [
        { name: 'Chihuahua', latitude: 28.63528, longitude: -106.08889, country: 'México', admin1: 'Chihuahua' },
        { name: 'Chihuahua', latitude: 40.1, longitude: -3.2, country: 'España', admin1: 'Madrid' },
      ] };
    } else {
      cuerpo = {
        latitude: Number(u.searchParams.get('latitude')), longitude: Number(u.searchParams.get('longitude')),
        timezone: 'America/Denver',
        current: { time: '2026-11-24T10:30', interval: 900, temperature_2m: 14.6, weather_code: 2, is_day: 1 },
        daily: { time: ['2026-11-24'], sunset: ['2026-11-24T17:02'] },
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(cuerpo) };
  };
  f.llamadas = [];
  f.fallar = false;
  return f;
}

module.exports = {
  CODIGOS, VIGENCIA_MS, TIEMPO_LIMITE_MS, infoCodigo, horaEs, textoAtardecer, urlPronostico, urlGeocodificacion,
  parsearPronostico, parsearCiudades, presentar, crearServicio, crearFetchFalso,
};
