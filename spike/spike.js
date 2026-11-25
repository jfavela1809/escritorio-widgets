'use strict';
// Prueba de ventana de escritorio (paso 1 del plan). Mide en esta laptop:
//  - tamaño/posición con setBounds al 125 %,
//  - clic a través de zonas vacías con setIgnoreMouseEvents(true,{forward:true}),
//  - orden de ventanas con koffi + SetWindowPos(HWND_BOTTOM),
//  - qué pasa con Win+D (ToggleDesktop y Win+D real) con y sin listener showInactive().
// Se cierra sola y escribe un JSON en la salida estándar (línea que empieza con RESULTADO_JSON).
// Ejecutar: electron spike/spike.js   (usar Start-Process con redirección, no tubería).

const path = require('path');
const { execFile } = require('child_process');
const { app, BrowserWindow, screen, ipcMain, desktopCapturer } = require('electron');

app.setPath('userData', path.join(require('os').tmpdir(), 'escritorio-spike-userdata'));

const R = { inicio: new Date().toISOString(), pasos: {}, errores: [] };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const anotar = (k, v) => { R.pasos[k] = v; };
const registrarError = (donde, e) => { R.errores.push(`${donde}: ${e && e.message ? e.message : e}`); };

// ------------------------------------------------------------------ koffi / user32
let K = null;
function cargarKoffi() {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const dwm = koffi.load('dwmapi.dll');
  const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
  K = {
    koffi,
    SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr hWnd, intptr after, int x, int y, int cx, int cy, uint flags)'),
    IsIconic: user32.func('bool __stdcall IsIconic(intptr h)'),
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(intptr h)'),
    GetWindow: user32.func('intptr __stdcall GetWindow(intptr h, uint cmd)'),
    GetTopWindow: user32.func('intptr __stdcall GetTopWindow(intptr h)'),
    GetWindowLongPtrW: user32.func('intptr __stdcall GetWindowLongPtrW(intptr h, int idx)'),
    FindWindowW: user32.func('intptr __stdcall FindWindowW(str16 cls, str16 title)'),
    GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr h, _Out_ uint16_t *buf, int n)'),
    GetWindowTextW: user32.func('int __stdcall GetWindowTextW(intptr h, _Out_ uint16_t *buf, int n)'),
    SetCursorPos: user32.func('bool __stdcall SetCursorPos(int x, int y)'),
    GetCursorPos: user32.func('bool __stdcall GetCursorPos(_Out_ POINT *p)'),
    WindowFromPoint: user32.func('intptr __stdcall WindowFromPoint(POINT p)'),
    GetAncestor: user32.func('intptr __stdcall GetAncestor(intptr h, uint flags)'),
    mouse_event: user32.func('void __stdcall mouse_event(uint32_t flags, int dx, int dy, uint32_t data, uintptr extra)'),
    keybd_event: user32.func('void __stdcall keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr extra)'),
    DwmGetWindowAttribute: dwm.func('int __stdcall DwmGetWindowAttribute(intptr h, uint attr, _Out_ int *out, uint size)'),
  };
}

function hwndDe(win) {
  const b = win.getNativeWindowHandle();
  return Number(b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0)));
}
function texto(fn, h) {
  const buf = new Uint16Array(256);
  const n = fn(h, buf, 256);
  return String.fromCharCode(...buf.slice(0, n));
}
const clase = (h) => texto(K.GetClassNameW, h);
const titulo = (h) => texto(K.GetWindowTextW, h);

// Lista de ventanas de nivel superior de arriba hacia abajo.
function ordenZ() {
  const lista = [];
  let h = K.GetTopWindow(0);
  let guardia = 0;
  while (h && guardia++ < 2000) {
    lista.push(h);
    h = K.GetWindow(h, 2); // GW_HWNDNEXT
  }
  return lista;
}

function esDeEscritorio(h) {
  const c = clase(h);
  return c === 'Progman';
}

function posicionZ(hwnd) {
  const lista = ordenZ();
  const idx = lista.indexOf(hwnd);
  const idxDesk = lista.findIndex(esDeEscritorio);
  const visibles = lista.filter((h) => K.IsWindowVisible(h));
  return {
    indice: idx, total: lista.length,
    indiceEscritorio: idxDesk,
    porEncimaDelEscritorio: idx >= 0 && idxDesk >= 0 ? idx < idxDesk : null,
    visiblesPorEncima: visibles.filter((h) => lista.indexOf(h) < idx).length,
    debajoDeMiInmediato: (() => { const h = lista[idx + 1]; return h ? `${clase(h)}|${titulo(h).slice(0, 20)}` : null; })(),
    encimaDeMiInmediato: (() => { const h = lista[idx - 1]; return h ? `${clase(h)}|${titulo(h).slice(0, 20)}` : null; })(),
  };
}

function estadoNativo(win, hwnd) {
  const out = {
    isVisible: win.isVisible(), isMinimized: win.isMinimized(),
    IsIconic: K.IsIconic(hwnd), IsWindowVisible: K.IsWindowVisible(hwnd),
  };
  const c = [0];
  try { K.DwmGetWindowAttribute(hwnd, 14, c, 4); out.cloaked = c[0]; } catch (e) { out.cloaked = 'err'; }
  return out;
}

// Cuenta ventanas de usuario visibles, no minimizadas y con título (para comprobar que se restauran).
function ventanasUsuario(hwnd) {
  return ordenZ().filter((h) => h !== hwnd && K.IsWindowVisible(h) && !K.IsIconic(h) && titulo(h).length > 0
    && !esDeEscritorio(h) && !['Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow'].includes(clase(h))).length;
}

// Fracción de píxeles magenta (la caja de prueba) visibles en una captura real de pantalla.
let DIR_CAP = process.env.SPIKE_CAPTURAS || '';
async function fraccionVisible(caja, nombre) {
  const d = screen.getPrimaryDisplay();
  const sf = d.scaleFactor;
  const tam = { width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf) };
  const fuentes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: tam });
  const f = fuentes.find((s) => String(s.display_id) === String(d.id)) || fuentes[0];
  const img = f.thumbnail;
  const { width, height } = img.getSize();
  if (DIR_CAP && nombre) require('fs').writeFileSync(path.join(DIR_CAP, nombre + '.png'), img.toPNG());
  const bmp = img.toBitmap(); // BGRA
  const x0 = Math.round((caja.x - d.bounds.x) * sf), y0 = Math.round((caja.y - d.bounds.y) * sf);
  const x1 = Math.min(width, x0 + Math.round(caja.w * sf)), y1 = Math.min(height, y0 + Math.round(caja.h * sf));
  let n = 0, tot = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      tot++;
      if (bmp[i + 2] > 240 && bmp[i + 1] < 20 && bmp[i] > 240) n++;
    }
  }
  return { magenta: n, muestras: tot, fraccion: tot ? +(n / tot).toFixed(3) : null, captura: `${width}x${height}` };
}

function toggleDesktopPS() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '(New-Object -ComObject Shell.Application).ToggleDesktop()'], { timeout: 15000 }, (err) => resolve(err ? String(err.message) : 'ok'));
  });
}
// Movimiento de ratón "real" (pasa por los ganchos de bajo nivel, a diferencia de SetCursorPos).
function moverRaton(xFis, yFis, d) {
  const w = Math.round(d.size.width * d.scaleFactor), h = Math.round(d.size.height * d.scaleFactor);
  K.mouse_event(0x8001, Math.round(xFis * 65535 / (w - 1)), Math.round(yFis * 65535 / (h - 1)), 0, 0);
}
function winDReal() {
  const VK_LWIN = 0x5b, VK_D = 0x44, UP = 2;
  K.keybd_event(VK_LWIN, 0, 0, 0); K.keybd_event(VK_D, 0, 0, 0);
  K.keybd_event(VK_D, 0, UP, 0); K.keybd_event(VK_LWIN, 0, UP, 0);
}

// ------------------------------------------------------------------ principal
let nCap = 0;
let win = null;
let hwnd = 0;
const raton = { n: 0, ultimo: null, ignorar: [] };

ipcMain.on('spike:ignorar', (_e, v) => {
  raton.ignorar.push(v);
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(v, v ? { forward: true } : undefined);
});
ipcMain.on('spike:raton', (_e, d) => { raton.n = d.n; raton.ultimo = d; });

async function medir() {
  const wa = screen.getPrimaryDisplay().workArea;
  const sf = screen.getPrimaryDisplay().scaleFactor;
  const CAJA = { x: wa.x + 400, y: wa.y + 300, w: 240, h: 140 };
  anotar('pantalla', { workArea: wa, scaleFactor: sf, boundsPantalla: screen.getPrimaryDisplay().bounds });

  win = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
    show: false, frame: false, thickFrame: false, transparent: true, hasShadow: false,
    resizable: false, movable: false, minimizable: true, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenu(null);
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  await win.loadFile(path.join(__dirname, 'index.html'));
  win.setBounds({ x: Math.round(wa.x) || 0, y: Math.round(wa.y) || 0, width: wa.width, height: wa.height });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.showInactive();
  hwnd = hwndDe(win);
  await dormir(600);

  // ---- S0: base
  const b = win.getBounds();
  const exstyle = Number(K.GetWindowLongPtrW(hwnd, -20));
  anotar('base', {
    boundsPedidos: wa, boundsReales: b, igualAlWorkArea: JSON.stringify(b) === JSON.stringify(wa),
    exStyle: '0x' + exstyle.toString(16), WS_EX_TOOLWINDOW: !!(exstyle & 0x80), WS_EX_TOPMOST: !!(exstyle & 0x8),
    WS_EX_TRANSPARENT: !!(exstyle & 0x20), WS_EX_LAYERED: !!(exstyle & 0x80000),
    alwaysOnTop: win.isAlwaysOnTop(), z: posicionZ(hwnd), ...estadoNativo(win, hwnd),
    usuarioVentanas: ventanasUsuario(hwnd),
  });
  const ventanasAntes = ventanasUsuario(hwnd);

  // Colocación práctica: justo encima de Progman (el escritorio), por debajo de las demás ventanas.
  const sobreEscritorio = () => {
    const lista = ordenZ();
    const iDesk = lista.findIndex(esDeEscritorio);
    let ref = 0;
    for (let i = iDesk - 1; i >= 0; i--) { if (lista[i] !== hwnd) { ref = lista[i]; break; } }
    return { ok: K.SetWindowPos(hwnd, ref, 0, 0, 0, 0, 0x13), ref };
  };
  const colS1 = sobreEscritorio(); await dormir(300);
  anotar('colocacionInicial', { z: posicionZ(hwnd), caja: await fraccionVisible(CAJA, 'base') });

  // Modo sondeo: mantiene la ventana justo encima de Progman con un temporizador y mide Win+D y un clic real.
  if (process.env.SPIKE_SONDEO === '1') {
    const prog = Number(K.FindWindowW('Progman', null));
    let correcciones = 0;
    const mantener = () => {
      const prev = Number(K.GetWindow(prog, 3)); // GW_HWNDPREV: la ventana justo encima del escritorio
      if (prev !== hwnd) { K.SetWindowPos(hwnd, prev, 0, 0, 0, 0, 0x13); correcciones++; }
    };
    const timer = setInterval(() => { try { mantener(); } catch (_) { /* nada */ } }, 150);
    const res = {};
    mantener(); await dormir(500);
    // Espera hasta que la caja vuelva a verse tras un cambio; devuelve ms transcurridos (tope 3 s).
    const hastaVisible = async (t0) => {
      for (;;) {
        const f = await fraccionVisible(CAJA);
        if (f.fraccion >= 0.99) return { ms: Date.now() - t0, fraccion: f.fraccion };
        if (Date.now() - t0 > 3000) return { ms: null, fraccion: f.fraccion };
        await dormir(60);
      }
    };
    // 1) ToggleDesktop con sondeo
    try {
      const c0 = correcciones;
      await toggleDesktopPS(); const t0 = Date.now(); await dormir(250);
      const recup = await hastaVisible(t0); await dormir(800);
      const durante = { caja: await fraccionVisible(CAJA, 'sondeo-durante-toggle'), z: posicionZ(hwnd), usuario: ventanasUsuario(hwnd), recuperadaEn: recup };
      await toggleDesktopPS(); await dormir(1500);
      const despues = { caja: await fraccionVisible(CAJA), z: posicionZ(hwnd), usuario: ventanasUsuario(hwnd) };
      res.toggleDesktop = { durante, despues, correcciones: correcciones - c0 };
    } catch (e) { registrarError('sondeo toggle', e); }
    // 2) Win+D real con sondeo
    try {
      const c0 = correcciones;
      winDReal(); const t0 = Date.now(); await dormir(250);
      const recup = await hastaVisible(t0); await dormir(800);
      const durante = { caja: await fraccionVisible(CAJA), usuario: ventanasUsuario(hwnd), recuperadaEn: recup };
      winDReal(); await dormir(1500);
      const despues = { caja: await fraccionVisible(CAJA), z: posicionZ(hwnd), usuario: ventanasUsuario(hwnd) };
      res.winDReal = { durante, despues, correcciones: correcciones - c0 };
    } catch (e) { registrarError('sondeo winD', e); }
    // 3) Clic real sobre la caja (solo si la ventana es la que recibe el clic en ese punto).
    try {
      const d = screen.getPrimaryDisplay();
      const cx = Math.round((CAJA.x + CAJA.w / 2) * sf), cy = Math.round((CAJA.y + CAJA.h / 2) * sf);
      const p0 = { x: 0, y: 0 }; K.GetCursorPos(p0);
      moverRaton(cx, cy, d); await dormir(150); moverRaton(cx + 1, cy + 1, d); await dormir(400);
      const h = Number(K.WindowFromPoint({ x: cx + 1, y: cy + 1 }));
      const nuestra = Number(K.GetAncestor(h, 2)) === hwnd;
      const antesZ = posicionZ(hwnd);
      const c0 = correcciones;
      let hecho = false;
      if (nuestra) { K.mouse_event(0x2, 0, 0, 0, 0); K.mouse_event(0x4, 0, 0, 0, 0); hecho = true; }
      await dormir(100);
      const zInmediato = posicionZ(hwnd);
      await dormir(600);
      res.clicReal = { clicHecho: hecho, motivoSiNo: hecho ? null : 'otra ventana cubría el punto; no se hizo clic', antesZ, zInmediato, zTras600ms: posicionZ(hwnd), correccionesPorElSondeo: correcciones - c0, enfocada: win.isFocused() };
      K.SetCursorPos(p0.x, p0.y);
    } catch (e) { registrarError('sondeo clic', e); }
    clearInterval(timer);
    res.integridad = { usuarioVentanasAntes: ventanasAntes, despues: ventanasUsuario(hwnd) };
    anotar('sondeo', res);
    return;
  }

  // Modo matriz: solo Win+D (ToggleDesktop) con distintas colocaciones en el orden z.
  if (process.env.SPIKE_MATRIZ === '1') {
    const resumenZ = () => {
      const lista = ordenZ();
      const i = lista.indexOf(hwnd);
      const arriba = lista.slice(0, 12).map((h) => `${clase(h)}${K.IsWindowVisible(h) ? '' : '(oculta)'}${h === hwnd ? '<NOSOTROS>' : ''}`);
      return { indice: i, indiceProgman: lista.findIndex(esDeEscritorio), primeras12: arriba,
        alrededor: lista.slice(Math.max(0, i - 2), i + 3).map((h) => `${clase(h)}|${titulo(h).slice(0, 15)}${h === hwnd ? '<NOSOTROS>' : ''}`) };
    };
    const colocar = {
      natural_mitad: () => { win.show(); win.focus(); },
      sobre_progman: () => sobreEscritorio(),
      fondo_HWND_BOTTOM: () => K.SetWindowPos(hwnd, 1, 0, 0, 0, 0, 0x13),
    };
    const matriz = {};
    for (const [nombre, f] of Object.entries(colocar)) {
      try {
        f(); await dormir(500);
        const antes = { z: resumenZ(), caja: await fraccionVisible(CAJA), estado: estadoNativo(win, hwnd) };
        await toggleDesktopPS(); await dormir(1800);
        const tras = { z: resumenZ(), caja: await fraccionVisible(CAJA), estado: estadoNativo(win, hwnd), usuario: ventanasUsuario(hwnd) };
        await toggleDesktopPS(); await dormir(1800);
        const rest = { z: resumenZ(), caja: await fraccionVisible(CAJA), usuario: ventanasUsuario(hwnd) };
        matriz[nombre] = { antes, tras, rest };
      } catch (e) { registrarError('matriz ' + nombre, e); }
    }
    anotar('matrizWinD', matriz);
    return;
  }

  // ---- S1: clic a través. Se mueve el cursor real y se restaura al terminar.
  try {
    const p0 = { x: 0, y: 0 }; K.GetCursorPos(p0);
    const aFis = (dx, dy) => ({ x: Math.round((wa.x + dx) * sf), y: Math.round((wa.y + dy) * sf) });
    const vacio = aFis(60, 60);
    const dentro = aFis(CAJA.x - wa.x + CAJA.w / 2, CAJA.y - wa.y + CAJA.h / 2);
    const raiz = (h) => (h ? Number(K.GetAncestor(h, 2)) : 0);

    moverRaton(vacio.x + 0, vacio.y + 0, screen.getPrimaryDisplay()); await dormir(250); moverRaton(vacio.x + 3, vacio.y + 2, screen.getPrimaryDisplay()); await dormir(400);
    const hV = K.WindowFromPoint({ x: vacio.x + 3, y: vacio.y + 2 });
    const rVacio = { movimientosRecibidosPorElRenderer: raton.n, ultimo: raton.ultimo, ignorarPedidos: raton.ignorar.slice(),
      windowFromPoint: `${clase(hV)}|${titulo(hV).slice(0, 25)}`, esNuestraVentana: raiz(hV) === hwnd };

    moverRaton(dentro.x + 0, dentro.y + 0, screen.getPrimaryDisplay()); await dormir(250); moverRaton(dentro.x + 2, dentro.y + 2, screen.getPrimaryDisplay()); await dormir(500);
    const hD = K.WindowFromPoint({ x: dentro.x + 2, y: dentro.y + 2 });
    const rDentro = { movimientosRecibidosPorElRenderer: raton.n, ultimo: raton.ultimo, ignorarPedidos: raton.ignorar.slice(),
      windowFromPoint: `${clase(hD)}|${titulo(hD).slice(0, 25)}`, esNuestraVentana: raiz(hD) === hwnd };

    moverRaton(vacio.x + 0, vacio.y + 0, screen.getPrimaryDisplay()); await dormir(500);
    const hV2 = K.WindowFromPoint({ x: vacio.x, y: vacio.y });
    const rVolver = { ignorarPedidos: raton.ignorar.slice(), windowFromPoint: `${clase(hV2)}`, esNuestraVentana: raiz(hV2) === hwnd };
    K.SetCursorPos(p0.x, p0.y);
    anotar('clicATraves', { zonaVacia: rVacio, sobreLaCaja: rDentro, deVueltaEnVacio: rVolver,
      nota: 'ignorarPedidos: true=zona vacía, false=sobre la caja; secuencia esperada [false,true]' });
  } catch (e) { registrarError('S1', e); }

  // ---- S2: orden z
  try {
    win.show(); await dormir(400);
    const zArriba = posicionZ(hwnd);
    const visArriba = await fraccionVisible(CAJA, 'z-arriba');
    // HWND_BOTTOM = 1; SWP_NOMOVE|NOSIZE|NOACTIVATE = 0x2|0x1|0x10
    const ok = K.SetWindowPos(hwnd, 1, 0, 0, 0, 0, 0x13);
    await dormir(500);
    const zAbajo = posicionZ(hwnd);
    const visAbajo = await fraccionVisible(CAJA, 'z-abajo');
    anotar('ordenZ', { alFrentePorShow: { z: zArriba, caja: visArriba }, trasSetWindowPosBottom: { retorno: ok, z: zAbajo, caja: visAbajo } });

    // Alternativa: justo encima del escritorio (Progman/WorkerW), por debajo de todas las demás.
    const lista = ordenZ();
    const iDesk = lista.findIndex(esDeEscritorio);
    const despues = iDesk > 0 ? lista[iDesk - 1] : 0; // 0 = HWND_TOP
    // Se busca la ventana inmediatamente por encima del primer elemento de escritorio, que no sea la nuestra.
    let ref = 0;
    for (let i = iDesk - 1; i >= 0; i--) { if (lista[i] !== hwnd) { ref = lista[i]; break; } }
    const ok2 = K.SetWindowPos(hwnd, ref, 0, 0, 0, 0, 0x13);
    await dormir(500);
    anotar('ordenZ_sobreEscritorio', { retorno: ok2, referencia: ref ? `${clase(ref)}|${titulo(ref).slice(0, 20)}` : 'HWND_TOP', z: posicionZ(hwnd), caja: await fraccionVisible(CAJA, 'z-sobre-escritorio') });
    void despues;

    // Enfocar (como al hacer clic) sube la ventana; con un listener 'focus' se manda otra vez al fondo.
    let eventosFocus = 0;
    const onFocus = () => { eventosFocus++; setTimeout(() => { try { K.SetWindowPos(hwnd, 1, 0, 0, 0, 0, 0x13); } catch (_) { /* nada */ } }, 30); };
    win.on('focus', onFocus);
    win.focus(); await dormir(500);
    const zTrasFocus = posicionZ(hwnd);
    win.off('focus', onFocus);
    anotar('ordenZ_focusConListener', { eventosFocus, z: zTrasFocus, nota: 'win.focus() simula el clic; el listener manda al fondo a los 30 ms' });
  } catch (e) { registrarError('S2', e); }

  // Ventana de vuelta al frente del orden normal antes de Win+D (estado "normal" de la app).
  sobreEscritorio(); await dormir(400);

  // ---- S3: Win+D vía ToggleDesktop, sin listeners
  const lecturasWinD = async (etiqueta) => ({ etiqueta, ...estadoNativo(win, hwnd), usuarioVentanas: ventanasUsuario(hwnd), caja: await fraccionVisible(CAJA, 'w-' + (++nCap) + '-' + etiqueta) });
  try {
    const antes = await lecturasWinD('antes');
    const r1 = await toggleDesktopPS(); await dormir(1800);
    const tras = await lecturasWinD('trasToggleDesktop');
    const r2 = await toggleDesktopPS(); await dormir(1800);
    const restaurado = await lecturasWinD('trasRestaurar');
    anotar('winD_toggleDesktop_sinListener', { antes, tras, restaurado, ps: [r1, r2] });
  } catch (e) { registrarError('S3', e); }

  // ---- S4: Win+D real (teclado) con listeners minimize/hide -> showInactive
  try {
    const eventos = [];
    const l1 = () => { eventos.push('minimize'); setTimeout(() => { try { win.showInactive(); eventos.push('showInactive(min)'); } catch (_) { /* nada */ } }, 50); };
    const l2 = () => { eventos.push('hide'); setTimeout(() => { try { win.showInactive(); eventos.push('showInactive(hide)'); } catch (_) { /* nada */ } }, 50); };
    win.on('minimize', l1); win.on('hide', l2);
    const antes = await lecturasWinD('antes');
    winDReal(); await dormir(1800);
    const tras = await lecturasWinD('trasWinDReal');
    winDReal(); await dormir(1800);
    const restaurado = await lecturasWinD('trasRestaurar');
    win.off('minimize', l1); win.off('hide', l2);
    anotar('winD_teclado_conListener', { eventos, antes, tras, restaurado });
  } catch (e) { registrarError('S4', e); }

  // Si algo dejó las ventanas del usuario minimizadas, un último ToggleDesktop las restauraría; solo se avisa.
  const ventanasDespues = ventanasUsuario(hwnd);
  anotar('integridadVentanasUsuario', { antes: ventanasAntes, despues: ventanasDespues });
}

app.whenReady().then(async () => {
  const tope = setTimeout(() => { registrarError('global', 'tiempo agotado'); finalizar(2); }, 90000);
  try {
    cargarKoffi();
    anotar('koffi', { version: K.koffi.version });
    await medir();
  } catch (e) { registrarError('principal', e); }
  clearTimeout(tope);
  finalizar(0);
});

function finalizar(codigo) {
  R.fin = new Date().toISOString();
  console.log('RESULTADO_JSON ' + JSON.stringify(R));
  app.exit(codigo);
}
