'use strict';
// Datos del escritorio en userData\escritorio.json (sin importar electron).
// Todo lo que entra (del disco o del renderer) pasa por normalizar(). Un JSON dañado se
// renombra a escritorio.json.roto-<fecha> y se arranca vacío, sin perder el original.

const fs = require('fs');
const path = require('path');
const { escribirAtomico } = require('./fs-atomico');
const { rutaValida, nombreDeRuta } = require('./rutas');
const { claveValida } = require('./pantallas');

const VERSION = 1;
const CELDA = 96;
const MAX_ELEMENTOS = 500;
const MAX_HIJOS = 200;
const MAX_NOMBRE = 120;
const MAX_NOTAS = 200000;
const MAX_OPCIONES = 20000; // bytes de JSON por widget
const MAX_POS = 500;
const COLORES_CARPETA = ['azul', 'verde', 'amarillo', 'naranja', 'rojo', 'morado', 'rosa', 'gris'];

const CLIMA_DEFECTO = Object.freeze({ nombre: 'Ciudad Juárez', lat: 31.69, lon: -106.42 });

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function entero(v, min, max, defecto) {
  const n = Number(v);
  if (!Number.isFinite(n)) return defecto;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function numero(v, min, max, defecto) {
  if (v === null || v === '' || typeof v === 'boolean') return defecto; // Number(null) sería 0
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return defecto;
  return n;
}

function texto(v, max, defecto = '') {
  if (typeof v !== 'string') return defecto;
  // Los caracteres de control no tienen sentido en nombres: se cambian por espacios.
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return t.slice(0, max);
}

function idUnico(v, usados, prefijo) {
  let id = typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : '';
  if (!id || usados.has(id)) {
    do { id = prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); } while (usados.has(id));
  }
  usados.add(id);
  return id;
}

function opcionesSeguras(v) {
  if (!esObjeto(v)) return {};
  try {
    const s = JSON.stringify(v);
    if (s.length > MAX_OPCIONES) return {};
    const o = JSON.parse(s);
    return esObjeto(o) ? o : {};
  } catch (_) { return {}; }
}

function normalizarAcceso(a, usados) {
  if (!esObjeto(a) || !rutaValida(a.ruta)) return null;
  const ruta = a.ruta;
  return {
    id: idUnico(a.id, usados, 'a'),
    tipo: 'acceso',
    ruta,
    nombre: texto(a.nombre, MAX_NOMBRE) || nombreDeRuta(ruta),
  };
}

function normalizarElemento(e, usados) {
  const n = normalizarElementoSinPantalla(e, usados);
  // Monitor donde vive (ver pantallas.js); sin clave válida, la pantalla principal.
  if (n && claveValida(e.pantalla)) n.pantalla = e.pantalla;
  return n;
}

function normalizarElementoSinPantalla(e, usados) {
  if (!esObjeto(e)) return null;
  const col = entero(e.col, 0, MAX_POS, 0);
  const fila = entero(e.fila, 0, MAX_POS, 0);
  if (e.tipo === 'acceso') {
    const a = normalizarAcceso(e, usados);
    return a ? { ...a, col, fila } : null;
  }
  if (e.tipo === 'carpeta') {
    const hijos = [];
    for (const h of Array.isArray(e.hijos) ? e.hijos.slice(0, MAX_HIJOS) : []) {
      const a = normalizarAcceso(h, usados);
      if (a) hijos.push(a);
    }
    const c = {
      id: idUnico(e.id, usados, 'c'), tipo: 'carpeta',
      nombre: texto(e.nombre, MAX_NOMBRE) || 'Carpeta', col, fila, hijos,
    };
    if (COLORES_CARPETA.includes(e.color)) c.color = e.color; // mismos nombres que carpetas.js
    return c;
  }
  if (e.tipo === 'widget') {
    const widget = typeof e.widget === 'string' && /^[a-z0-9_-]{1,40}$/i.test(e.widget) ? e.widget : null;
    if (!widget) return null;
    return {
      id: idUnico(e.id, usados, 'w'), tipo: 'widget', widget, col, fila,
      ancho: entero(e.ancho, 1, 8, 1), alto: entero(e.alto, 1, 8, 1), opciones: opcionesSeguras(e.opciones),
    };
  }
  return null;
}

// Carpeta con 1 hijo se deshace; vacía se descarta (misma regla que en el renderer).
function deshacerCarpetas(lista) {
  const salida = [];
  for (const e of lista) {
    if (e.tipo !== 'carpeta') { salida.push(e); continue; }
    if (e.hijos.length === 0) continue;
    if (e.hijos.length === 1) {
      const solo = { ...e.hijos[0], col: e.col, fila: e.fila };
      if (e.pantalla) solo.pantalla = e.pantalla;
      salida.push(solo);
      continue;
    }
    salida.push(e);
  }
  return salida;
}

const RE_HORA_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// Último dato del clima (con su hora) para mostrarlo sin red. Si algo no cuadra se descarta.
function normalizarCacheClima(c) {
  if (!esObjeto(c)) return null;
  const temperatura = numero(c.temperatura, -90, 70, null);
  const codigo = numero(c.codigo, 0, 99, null);
  const actualizado = numero(c.actualizado, 1, 8.64e15, null);
  const lat = numero(c.lat, -90, 90, null);
  const lon = numero(c.lon, -180, 180, null);
  if ([temperatura, codigo, actualizado, lat, lon].includes(null)) return null;
  const hora = (v) => (typeof v === 'string' && RE_HORA_LOCAL.test(v) ? v : null);
  return {
    temperatura: Math.round(temperatura * 10) / 10, codigo: Math.round(codigo),
    esDia: c.esDia !== false, atardecer: hora(c.atardecer), horaLocal: hora(c.horaLocal),
    actualizado: Math.round(actualizado), lat, lon,
  };
}

// Ciudad del clima: nombre, lat y lon validados por rango (si no, ciudad por defecto);
// `cache` solo aparece cuando hay un dato válido guardado.
function normalizarClima(c) {
  const o = esObjeto(c) ? c : {};
  const salida = {
    nombre: texto(o.nombre, 80) || CLIMA_DEFECTO.nombre,
    lat: numero(o.lat, -90, 90, CLIMA_DEFECTO.lat),
    lon: numero(o.lon, -180, 180, CLIMA_DEFECTO.lon),
  };
  const cache = normalizarCacheClima(o.cache);
  // El dato guardado solo vale para la ciudad actual.
  if (cache && cache.lat === salida.lat && cache.lon === salida.lon) salida.cache = cache;
  return salida;
}

function normalizar(obj) {
  const o = esObjeto(obj) ? obj : {};
  const usados = new Set();
  const elementos = [];
  for (const e of Array.isArray(o.elementos) ? o.elementos.slice(0, MAX_ELEMENTOS) : []) {
    const n = normalizarElemento(e, usados);
    if (n) elementos.push(n);
  }
  const notas = esObjeto(o.notas) && typeof o.notas.texto === 'string' ? o.notas.texto.slice(0, MAX_NOTAS) : '';
  return {
    version: VERSION,
    celda: entero(o.celda, 64, 160, CELDA),
    elementos: deshacerCarpetas(elementos),
    clima: normalizarClima(o.clima),
    notas: { texto: notas },
    iniciarConWindows: o.iniciarConWindows === true,
  };
}

function marcaFecha(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Lee el archivo. Si no existe: datos vacíos. Si está dañado (no es JSON o no es un objeto):
// se renombra a <archivo>.roto-<fecha> y se devuelve vacío. Devuelve { datos, roto }.
function cargar(ruta, ahora = new Date()) {
  let crudo;
  try {
    crudo = fs.readFileSync(ruta, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { datos: normalizar({}), roto: null };
    return { datos: normalizar({}), roto: respaldarRoto(ruta, ahora) };
  }
  try {
    const j = JSON.parse(crudo.replace(/^﻿/, ''));
    if (!esObjeto(j)) throw new Error('no es un objeto');
    return { datos: normalizar(j), roto: null };
  } catch (_) {
    return { datos: normalizar({}), roto: respaldarRoto(ruta, ahora) };
  }
}

function respaldarRoto(ruta, ahora) {
  let destino = `${ruta}.roto-${marcaFecha(ahora)}`;
  for (let i = 1; fs.existsSync(destino); i++) destino = `${ruta}.roto-${marcaFecha(ahora)}-${i}`;
  try { fs.renameSync(ruta, destino); return destino; } catch (_) {
    try { fs.copyFileSync(ruta, destino); return destino; } catch (e2) { return null; }
  }
}

// Copia de seguridad diaria: antes del primer guardado del día se copia el archivo actual a
// <archivo>.respaldo-AAAAMMDD y se conservan las últimas `conservar` copias (son copias de la app,
// no archivos del usuario). Devuelve la ruta de la copia nueva o null si no hizo falta.
function respaldoDiario(ruta, ahora = new Date(), conservar = 7) {
  if (!fs.existsSync(ruta)) return null;
  const dia = marcaFecha(ahora).slice(0, 8);
  const destino = `${ruta}.respaldo-${dia}`;
  let creada = null;
  if (!fs.existsSync(destino)) {
    try { fs.copyFileSync(ruta, destino); creada = destino; } catch (_) { return null; }
  }
  const base = path.basename(ruta) + '.respaldo-';
  try {
    const viejas = fs.readdirSync(path.dirname(ruta))
      .filter((n) => n.startsWith(base) && /^\d{8}$/.test(n.slice(base.length)))
      .sort().reverse().slice(conservar);
    for (const n of viejas) { try { fs.unlinkSync(path.join(path.dirname(ruta), n)); } catch (_) { /* se intenta otro día */ } }
  } catch (_) { /* sin limpieza */ }
  return creada;
}

function guardar(ruta, datos) {
  const limpios = normalizar(datos);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  escribirAtomico(ruta, JSON.stringify(limpios, null, 2));
  return limpios;
}

module.exports = { normalizar, normalizarClima, MAX_NOTAS, CLIMA_DEFECTO, cargar, guardar, respaldoDiario, marcaFecha, VERSION, CELDA, MAX_ELEMENTOS };
