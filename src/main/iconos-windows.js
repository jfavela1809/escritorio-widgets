'use strict';
// Ocultar / mostrar los iconos del escritorio de Windows (sin importar electron).
// Hace lo mismo que clic derecho en el escritorio → Ver → "Mostrar iconos del escritorio":
// manda el comando 0x7402 a la ventana SHELLDLL_DefView. Windows guarda la preferencia él
// mismo y se puede revertir desde ese mismo menú. No toca archivos.

const WM_COMMAND = 0x0111;
const CMD_ALTERNAR_ICONOS = 0x7402;

function cargarApi() {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  return {
    FindWindowW: user32.func('intptr __stdcall FindWindowW(str16 cls, str16 title)'),
    FindWindowExW: user32.func('intptr __stdcall FindWindowExW(intptr parent, intptr after, str16 cls, str16 title)'),
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(intptr h)'),
    PostMessageW: user32.func('bool __stdcall PostMessageW(intptr h, uint msg, uintptr w, intptr l)'),
  };
}

// SHELLDLL_DefView cuelga de Progman o, tras cambiar el fondo, de una WorkerW.
function buscarDefView(W) {
  const progman = Number(W.FindWindowW('Progman', null));
  if (progman) {
    const dv = Number(W.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null));
    if (dv) return dv;
  }
  let w = 0;
  for (let i = 0; i < 200; i++) {
    w = Number(W.FindWindowExW(0, w, 'WorkerW', null));
    if (!w) break;
    const dv = Number(W.FindWindowExW(w, 0, 'SHELLDLL_DefView', null));
    if (dv) return dv;
  }
  return 0;
}

function crear({ api } = {}) {
  let W;
  try { W = api || cargarApi(); } catch (_) { return null; }

  function vista() {
    const dv = buscarDefView(W);
    const lista = dv ? Number(W.FindWindowExW(dv, 0, 'SysListView32', null)) : 0;
    return { dv, lista };
  }
  // true / false, o null si no se encontró el escritorio.
  function visibles() {
    const { lista } = vista();
    return lista ? !!W.IsWindowVisible(lista) : null;
  }
  // Deja los iconos como se pide; devuelve el estado nuevo esperado o null si no se pudo.
  function fijar(mostrar) {
    const { dv, lista } = vista();
    if (!dv || !lista) return null;
    const ahora = !!W.IsWindowVisible(lista);
    if (ahora !== !!mostrar) W.PostMessageW(dv, WM_COMMAND, CMD_ALTERNAR_ICONOS, 0);
    return !!mostrar;
  }
  return { visibles, fijar };
}

module.exports = { crear, buscarDefView, CMD_ALTERNAR_ICONOS };
