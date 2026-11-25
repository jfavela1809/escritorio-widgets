'use strict';
// Mantiene las ventanas del lienzo (una por monitor) "sobre el escritorio y bajo todas las
// apps" (ver NOTAS-TECNICAS.md). Win+D no minimiza ni oculta las ventanas: sube el escritorio
// (Progman) en el orden z y lo que queda debajo desaparece. Con koffi (FFI sin compilar) un
// sondeo ligero comprueba que las ventanas sigan justo encima de Progman y, si no, las recoloca
// con SetWindowPos sin activarlas. Sin importar electron; si koffi no carga, devuelve null.

const GW_HWNDPREV = 3;
const FLAGS = 0x13; // SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE

function cargarApi() {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  return {
    SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr hWnd, intptr after, int x, int y, int cx, int cy, uint flags)'),
    GetWindow: user32.func('intptr __stdcall GetWindow(intptr h, uint cmd)'),
    FindWindowW: user32.func('intptr __stdcall FindWindowW(str16 cls, str16 title)'),
    IsWindow: user32.func('bool __stdcall IsWindow(intptr h)'),
  };
}

const numeroDe = (b) => Number(b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0)));

// ventanas: el Buffer de win.getNativeWindowHandle(), o una función que devuelve la lista de
// esos Buffers (las ventanas cambian cuando se conecta o desconecta un monitor).
function crear(ventanas, { intervaloMs = 150, api } = {}) {
  let W;
  try { W = api || cargarApi(); } catch (e) { return null; }
  const lista = typeof ventanas === 'function' ? () => ventanas().map(numeroDe) : (() => { const h = [numeroDe(ventanas)]; return () => h; })();
  let progman = Number(W.FindWindowW('Progman', null));
  if (!progman) return null;

  let timer = null;
  let correcciones = 0;

  // Una pasada: si justo encima de Progman no están todas nuestras ventanas, se colocan ahí.
  // Si el Explorador se reinició, el Progman guardado ya no existe: se busca de nuevo.
  // Con un Progman muerto GetWindow devuelve 0 = HWND_TOP y subiría los widgets por
  // encima de todas las apps; con un Progman vivo, 0 significa que Progman está hasta
  // arriba y HWND_TOP es justo lo correcto.
  function mantener() {
    if (W.IsWindow && !W.IsWindow(progman)) {
      progman = Number(W.FindWindowW('Progman', null));
      if (!progman || !W.IsWindow(progman)) return;
    }
    const hwnds = lista();
    if (!hwnds.length) return;
    const nuestras = new Set(hwnds);
    let x = progman;
    let enSuLugar = true;
    for (let i = 0; i < hwnds.length; i++) {
      x = Number(W.GetWindow(x, GW_HWNDPREV));
      if (!nuestras.has(x)) { enSuLugar = false; break; }
    }
    if (enSuLugar) return;
    for (const h of hwnds) {
      const encima = Number(W.GetWindow(progman, GW_HWNDPREV));
      if (encima !== h) W.SetWindowPos(h, encima, 0, 0, 0, 0, FLAGS);
    }
    correcciones++;
  }

  function iniciar() {
    if (timer) return;
    try { mantener(); } catch (_) { /* se reintenta en el siguiente tic */ }
    timer = setInterval(() => { try { mantener(); } catch (_) { /* nada */ } }, intervaloMs);
    if (timer.unref) timer.unref();
  }
  function detener() { if (timer) { clearInterval(timer); timer = null; } }
  return { iniciar, detener, mantener, get correcciones() { return correcciones; }, get activo() { return !!timer; } };
}

module.exports = { crear };
