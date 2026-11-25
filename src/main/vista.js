'use strict';
// Qué se ve en el escritorio: los elementos de la app, los iconos de Windows o los dos.
// La visibilidad de los iconos de Windows la guarda Windows; aquí solo se guarda si la app
// está oculta (vista.json, junto a escritorio.json). Sin importar electron.

const fs = require('fs');

const MODOS = ['ambos', 'app', 'windows'];

// { appOculta, mostrarWindows } que corresponde a cada modo.
function aplicar(modo) {
  if (modo === 'app') return { appOculta: false, mostrarWindows: false };
  if (modo === 'windows') return { appOculta: true, mostrarWindows: true };
  if (modo === 'ambos') return { appOculta: false, mostrarWindows: true };
  return null;
}

// Modo actual; winVisibles puede ser null (no se encontró el escritorio de Windows).
function modoDe(appOculta, winVisibles) {
  if (winVisibles === null || winVisibles === undefined) return appOculta ? 'windows' : 'ambos';
  if (appOculta) return winVisibles ? 'windows' : null; // nada visible: no es ningún modo
  return winVisibles ? 'ambos' : 'app';
}

function cargar(archivo) {
  try {
    const d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    return { appOculta: d && d.appOculta === true };
  } catch (_) {
    return { appOculta: false };
  }
}

function guardar(archivo, v) {
  const tmp = archivo + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ appOculta: v.appOculta === true }), 'utf8');
  fs.renameSync(tmp, archivo);
}

module.exports = { MODOS, aplicar, modoDe, cargar, guardar };
