'use strict';
// Ciclo de vida, ventana lienzo, bandeja, atajo e IPC de Escritorio Widgets.
// REGLA: la app nunca borra, mueve ni modifica archivos del usuario; solo guarda rutas.

const path = require('path');
const fs = require('fs');
const {
  app, BrowserWindow, Tray, Menu, screen, globalShortcut, ipcMain, shell, nativeImage, dialog, session,
} = require('electron');

// Pruebas: ESCRITORIO_DATA_DIR redirige los datos y también userData (antes de que la app esté lista).
const DIR_DATOS = process.env.ESCRITORIO_DATA_DIR || '';
if (DIR_DATOS) {
  fs.mkdirSync(path.join(DIR_DATOS, 'userData'), { recursive: true });
  app.setPath('userData', path.join(DIR_DATOS, 'userData'));
}

const datos = require('./datos');
const rutas = require('./rutas');
const icono = require('./icono');
const sistema = require('./sistema');
const clima = require('./clima');
const zonasMod = require('./zonas');
const pantallasMod = require('./pantallas');
const vistaMod = require('./vista');
const enlaces = require('./enlaces');

const SMOKE = process.env.ESCRITORIO_SMOKE === '1';
const ATAJO = 'Control+Alt+E';
const ESPERA_ICONO_MS = 4000;
const MAX_CACHE_ICONOS = 600;

app.setAppUserModelId('EscritorioWidgets');

let resolverListo;
const listo = new Promise((r) => { resolverListo = r; });

const estado = {
  // Un lienzo por monitor: clave (pantallas.js) -> { clave, nombre, display, principal, win,
  // ignorando, zonas, capturando }. `principal` es la clave del monitor principal.
  lienzos: new Map(), principal: '', conectadas: new Set(),
  tray: null, archivo: '', datos: null, rotoEn: null,
  conocidas: new Set(),        // rutas guardadas (en minúsculas): solo estas se pueden abrir
  alFrente: false, saliendo: false, orden: null,
  iconos: new Map(),           // caché en memoria: ruta -> dataURL
  abiertos: [], mostrados: [], // solo SMOKE: lo que se habría abierto
  atajoRegistrado: false,
  lecturasSistema: 0,          // cuántas veces el widget de uso de PC pidió datos (el smoke lo mide)
  medidor: null,               // uso de la PC (se crea al primer pedido)
  clima: null, climaFalso: null, // servicio del clima; en el smoke usa un fetch falso (nunca internet)
  sondeoCursor: null,
  pedidos: new Map(),          // pasar un elemento a otro monitor: id del pedido -> resolve
  iconosWin: null,             // control de los iconos del escritorio de Windows (koffi)
  appOculta: false,            // "ver solo los de Windows": los lienzos no muestran sus elementos
  archivoVista: '',
  iconosShell: null,           // iconos como los del Explorador (iconos-shell.js)
  respaldoDel: '',
  bateria: null,               // lector de la batería (bateria.js; en el smoke, uno falso)
  webAbiertos: [],             // solo SMOKE: enlaces que se habrían abierto en el navegador             // día (AAAAMMDD) del último respaldo de escritorio.json
};

// ---------------------------------------------------------------- utilidades

const vivo = (l) => l && l.win && !l.win.isDestroyed();
const lienzosVivos = () => [...estado.lienzos.values()].filter(vivo);
const lienzoPrincipal = () => estado.lienzos.get(estado.principal) || lienzosVivos()[0] || null;
const lienzoDe = (sender) => lienzosVivos().find((l) => l.win.webContents === sender) || null;

function enviarA(l, canal, d) {
  if (vivo(l) && !l.win.webContents.isDestroyed()) l.win.webContents.send(canal, d);
}

// Las rutas nuevas de la bandeja van al lienzo de la pantalla principal.
function enviar(canal, d) { enviarA(lienzoPrincipal(), canal, d); }

// Medido con la pantalla al 125 %: siempre setBounds con el tamaño completo y thickFrame:false;
// nunca setPosition. "|| 0" convierte -0 en 0 (Electron rechaza -0). Con monitores de distinta
// escala, la primera vez Windows reajusta el tamaño al cambiar de DPI: se aplica de nuevo.
function colocarLienzo(l) {
  if (!vivo(l)) return;
  const a = l.display.workArea;
  const b = { x: Math.round(a.x) || 0, y: Math.round(a.y) || 0, width: a.width, height: a.height };
  for (let i = 0; i < 3; i++) {
    l.win.setBounds(b);
    const r = l.win.getBounds();
    if (r.x === b.x && r.y === b.y && r.width === b.width && r.height === b.height) break;
  }
}

// Datos que ve un lienzo: solo los elementos de su monitor (el resto se conserva en main).
function datosPara(l) {
  return { ...estado.datos, elementos: pantallasMod.deLaPantalla(estado.datos.elementos, l.clave, estado.conectadas, estado.principal) };
}

function recordarRutas() {
  const s = new Set();
  for (const e of estado.datos.elementos) {
    if (e.tipo === 'acceso') s.add(e.ruta.toLowerCase());
    else if (e.tipo === 'carpeta') for (const h of e.hijos) s.add(h.ruta.toLowerCase());
  }
  estado.conocidas = s;
}

function guardarDatos(d) {
  // Una copia por día de escritorio.json (las últimas 7), por si algo se quita sin querer.
  const hoy = datos.marcaFecha().slice(0, 8);
  if (estado.respaldoDel !== hoy) { datos.respaldoDiario(estado.archivo); estado.respaldoDel = hoy; }
  const limpios = datos.guardar(estado.archivo, d);
  estado.datos = limpios;
  recordarRutas();
  return limpios;
}

// ---------------------------------------------------------------- mostrar / ocultar

// "Mostrar widgets": sube el lienzo por encima de las apps hasta que se haga clic en otra cosa.
function mostrarAlFrente() {
  const todos = lienzosVivos();
  if (!todos.length) return;
  estado.alFrente = true;
  if (estado.orden) estado.orden.detener();
  for (const l of todos) { l.win.show(); l.win.moveTop(); }
  // El foco va al monitor donde está el ratón.
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const l = todos.find((x) => x.display.id === d.id) || lienzoPrincipal();
  if (vivo(l)) l.win.focus();
}

function mandarAlFondo() {
  const todos = lienzosVivos();
  if (!todos.length) return;
  estado.alFrente = false;
  if (estado.orden) estado.orden.iniciar();
  else for (const l of todos) if (l.win.isVisible()) l.win.blur();
}

function alternar() {
  if (estado.alFrente) { mandarAlFondo(); return; }
  // "Mostrar widgets" con la app oculta: primero vuelve a mostrarla (Windows se queda como está).
  if (estado.appOculta) fijarAppOculta(false);
  mostrarAlFrente();
}

// ---------------------------------------------------------------- qué se ve (app / Windows)

function iconosWindows() {
  if (SMOKE) return null; // nunca en el smoke: tocaría el escritorio real
  if (!estado.iconosWin) estado.iconosWin = require('./iconos-windows').crear();
  return estado.iconosWin;
}

function estadoVista() {
  const w = iconosWindows();
  const winVisibles = w ? w.visibles() : null;
  return { appOculta: estado.appOculta, windows: winVisibles, modo: vistaMod.modoDe(estado.appOculta, winVisibles) };
}

function fijarAppOculta(v) {
  estado.appOculta = v === true;
  try { vistaMod.guardar(estado.archivoVista, { appOculta: estado.appOculta }); } catch (_) { /* se queda en memoria */ }
  for (const l of lienzosVivos()) enviarA(l, 'escritorio:vista', { appOculta: estado.appOculta });
}

// modo: 'ambos' | 'app' | 'windows'. Devuelve el estado nuevo; windows:null = no se pudo tocar Windows.
function fijarVista(modo) {
  const a = vistaMod.aplicar(modo);
  if (!a) throw new Error('Modo no válido');
  const w = iconosWindows();
  const winVisibles = w ? w.fijar(a.mostrarWindows) : null;
  // Si no se pudo tocar Windows, no dejar el escritorio sin nada visible (en el smoke sí se oculta:
  // ahí Windows nunca se toca y lo que se prueba es la app).
  fijarAppOculta(winVisibles === null && a.appOculta && !SMOKE ? false : a.appOculta);
  return { appOculta: estado.appOculta, windows: winVisibles, modo: vistaMod.modoDe(estado.appOculta, winVisibles) };
}

// ---------------------------------------------------------------- rutas / iconos

function conTope(promesa, ms, valor) {
  return Promise.race([promesa, new Promise((r) => setTimeout(() => r(valor), ms))]);
}

// De dónde sacar el icono de una ruta (el orden importa; ver rutas.fuentesDeIcono).
function fuentesDeIcono(ruta) {
  if (!rutas.esAcceso(ruta)) return [ruta];
  let l = null;
  try { l = shell.readShortcutLink(ruta); } catch (_) { l = null; }
  return rutas.fuentesDeIcono(ruta, l);
}

async function infoDe(ruta) {
  let st = null;
  try { st = await conTope(fs.promises.stat(ruta), ESPERA_ICONO_MS, null); } catch (_) { st = null; }
  if (!st) return { ruta, existe: false, esCarpeta: false, icono: null };
  const clave = ruta.toLowerCase();
  let url = estado.iconos.get(clave);
  const enMemoria = !!url;
  if (!url) {
    // Primero el mismo icono que dibuja el Explorador (caché en disco); si no, getFileIcon.
    try {
      if (!estado.iconosShell) estado.iconosShell = require('./iconos-shell').crear({ dirCache: path.join(app.getPath('userData'), 'iconos') });
      const png = await estado.iconosShell.obtener(ruta, st.mtimeMs);
      if (png) {
        const img = nativeImage.createFromPath(png);
        if (!img.isEmpty()) url = img.toDataURL();
      }
    } catch (_) { url = null; }
  }
  if (!url) {
    // Para un .lnk, getFileIcon devuelve el icono genérico de "acceso directo" (hoja con flecha).
    // Se prueba primero el icono propio del acceso (.ico/.exe) y luego su destino.
    for (const fuente of fuentesDeIcono(ruta)) {
      try {
        const img = await conTope(app.getFileIcon(fuente, { size: 'large' }), ESPERA_ICONO_MS, null);
        if (img && !img.isEmpty()) { url = img.toDataURL(); break; }
      } catch (_) { /* se prueba la siguiente fuente */ }
    }
  }
  if (url && !enMemoria) {
    if (estado.iconos.size >= MAX_CACHE_ICONOS) estado.iconos.delete(estado.iconos.keys().next().value);
    estado.iconos.set(clave, url);
  }
  return { ruta, existe: true, esCarpeta: st.isDirectory(), icono: url || null };
}

// Datos de rutas nuevas (soltadas o elegidas): solo las que existen. Para .lnk se lee el acceso
// directo con shell.readShortcutLink; si no se puede leer, se usa igual (Windows lo abrirá o dirá el error).
async function resolverRutas(lista) {
  const salida = [];
  for (const ruta of rutas.filtrarRutas(lista, 100)) {
    let st = null;
    try { st = await conTope(fs.promises.stat(ruta), ESPERA_ICONO_MS, null); } catch (_) { st = null; }
    if (!st) continue;
    let nombre = rutas.nombreDeRuta(ruta);
    if (rutas.esAcceso(ruta) && st.isFile()) {
      try {
        const l = shell.readShortcutLink(ruta);
        if (!nombre && l && typeof l.description === 'string') nombre = l.description.trim().slice(0, 120);
      } catch (_) { /* acceso directo ilegible: se conserva el nombre del archivo */ }
    }
    salida.push({ ruta, nombre: nombre || ruta, esCarpeta: st.isDirectory() });
  }
  return salida;
}

async function elegirRutas(tipo) {
  if (SMOKE && process.env.ESCRITORIO_DIALOGO) {
    try { return rutas.filtrarRutas(JSON.parse(process.env.ESCRITORIO_DIALOGO)); } catch (_) { return []; }
  }
  const r = await dialog.showOpenDialog({
    title: tipo === 'carpeta' ? 'Agregar carpeta de Windows' : 'Agregar acceso',
    properties: tipo === 'carpeta' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
  });
  return r.canceled ? [] : rutas.filtrarRutas(r.filePaths);
}

// ---------------------------------------------------------------- IPC

// Servicio del clima (fetch de Node con tiempo límite de 10 s; en el smoke, un fetch falso).
function servicioClima() {
  if (estado.clima) return estado.clima;
  if (SMOKE) estado.climaFalso = clima.crearFetchFalso();
  estado.clima = clima.crearServicio({
    fetch: estado.climaFalso || ((url, op) => fetch(url, op)),
    ciudad: () => estado.datos.clima,
    guardarCache: (cache) => { guardarDatos({ ...estado.datos, clima: { ...estado.datos.clima, cache } }); },
  });
  return estado.clima;
}

function registrarIpc() {
  const propio = (e) => !!lienzoDe(e.sender);
  // fn recibe primero el lienzo que pidió y después los argumentos del renderer.
  const manejarL = (canal, fn) => {
    ipcMain.handle(canal, (e, ...args) => {
      const l = lienzoDe(e.sender);
      if (!l) throw new Error('Origen no permitido');
      return fn(l, ...args);
    });
  };
  const manejar = (canal, fn) => manejarL(canal, (_l, ...args) => fn(...args));

  manejarL('datos:cargar', (l) => ({
    datos: datosPara(l), rotoEn: l.principal ? estado.rotoEn : null, pantalla: l.display.workArea,
    clave: l.clave, otras: otrasPantallas(l), appOculta: estado.appOculta,
  }));
  manejarL('datos:guardar', (l, d) => {
    if (d === null || typeof d !== 'object' || Array.isArray(d)) throw new Error('Datos no válidos');
    // Cada lienzo manda solo los elementos de su monitor: se fusionan con los de los demás.
    const propios = datos.normalizar({ elementos: d.elementos }).elementos;
    const elementos = pantallasMod.fusionar(estado.datos.elementos, l.clave, propios, estado.conectadas, estado.principal);
    // La ciudad, el caché del clima y las notas los cambia solo el proceso principal:
    // un guardado del lienzo con datos viejos no debe pisarlos.
    guardarDatos({ ...d, elementos, clima: estado.datos.clima, notas: estado.datos.notas });
    return datosPara(l);
  });
  // Pasar un elemento a otro monitor. destino: clave del monitor, o null = el monitor donde está
  // el ratón (al soltar un arrastre fuera de la ventana). offX/offY: dónde se tomó el elemento.
  manejarL('pantalla:mover', (l, p) => moverAPantalla(l, p));
  ipcMain.on('pantalla:recibido', (e, r) => {
    if (!propio(e) || !r || typeof r.pid !== 'string') return;
    const fin = estado.pedidos.get(r.pid);
    if (fin) { estado.pedidos.delete(r.pid); fin(r.ok === true); }
  });

  // ---- widgets: sistema, clima y notas (todo validado aquí; el renderer no hace fetch)
  manejar('sistema:leer', (reiniciar) => {
    estado.lecturasSistema++;
    if (!estado.medidor) estado.medidor = sistema.crearMedidor();
    return estado.medidor.leer({ reiniciar: reiniciar === true });
  });
  manejar('clima:obtener', (forzar) => servicioClima().obtener({ forzar: forzar === true }));
  manejar('clima:buscar', (texto) => servicioClima().buscarCiudades(texto));
  manejar('clima:ciudad', (c) => {
    if (!c || typeof c !== 'object' || typeof c.nombre !== 'string'
        || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)
        || Math.abs(c.lat) > 90 || Math.abs(c.lon) > 180) throw new Error('Ciudad no válida');
    const nueva = datos.normalizarClima({ nombre: c.nombre, lat: c.lat, lon: c.lon });
    guardarDatos({ ...estado.datos, clima: nueva });
    return servicioClima().obtener({ forzar: true });
  });
  manejar('notas:leer', () => estado.datos.notas.texto);
  manejar('notas:guardar', (t) => {
    if (typeof t !== 'string' || t.length > datos.MAX_NOTAS) throw new Error('Texto de notas no válido');
    guardarDatos({ ...estado.datos, notas: { texto: t } });
    return true;
  });
  manejar('rutas:info', (lista) => Promise.all(rutas.filtrarRutas(lista).map(infoDe)));
  manejar('rutas:resolver', (lista) => resolverRutas(lista));
  manejar('dialogo:elegir', async (tipo) => resolverRutas(await elegirRutas(tipo === 'carpeta' ? 'carpeta' : 'archivos')));
  manejar('rutas:abrir', async (ruta) => {
    // Solo se abre lo que está guardado en el escritorio (aunque el renderer pidiera otra cosa).
    if (!rutas.rutaValida(ruta) || !estado.conocidas.has(ruta.toLowerCase())) return { ok: false, error: 'Ruta no registrada' };
    if (SMOKE) { estado.abiertos.push(ruta); return { ok: true }; }
    const err = await shell.openPath(ruta);
    return err ? { ok: false, error: err } : { ok: true };
  });
  manejar('rutas:mostrar', (ruta) => {
    if (!rutas.rutaValida(ruta) || !estado.conocidas.has(ruta.toLowerCase())) return { ok: false, error: 'Ruta no registrada' };
    if (SMOKE) { estado.mostrados.push(ruta); return { ok: true }; }
    shell.showItemInFolder(ruta);
    return { ok: true };
  });
  ipcMain.on('ventana:ignorar', (e, ignorar) => {
    const l = lienzoDe(e.sender);
    if (!l || typeof ignorar !== 'boolean') return;
    fijarIgnorar(l, ignorar);
  });
  ipcMain.on('ventana:zonas', (e, d) => {
    const l = lienzoDe(e.sender);
    if (!l || !d || typeof d !== 'object') return;
    l.zonas = zonasMod.normalizarZonas(d.zonas);
    l.capturando = d.capturando === true;
  });
  manejar('escritorio:iconos-windows', () => iconosDelEscritorio());
  // Buscador: todos los accesos de todos los monitores (también los de dentro de carpetas).
  manejar('buscar:lista', () => listaParaBuscar());
  // El lienzo necesita el teclado (buscador, pendientes, notas, renombrar).
  manejarL('ventana:enfocar', (l) => { if (vivo(l)) { l.win.focus(); l.win.webContents.focus(); } return true; });
  manejar('bateria:leer', () => {
    if (SMOKE) return { hay: true, porcentaje: 64, enchufada: false, cargando: false, minutos: 185 };
    if (!estado.bateria) estado.bateria = require('./bateria').crear();
    return estado.bateria.leer();
  });
  // Enlaces web: solo http/https y solo los guardados en un widget "Enlaces".
  manejar('web:abrir', async (url) => {
    const u = enlaces.urlValida(url);
    if (!u || !enlaces.guardadas(estado.datos.elementos).has(u)) return { ok: false, error: 'Enlace no registrado' };
    if (SMOKE) { estado.webAbiertos.push(u); return { ok: true }; }
    try { await shell.openExternal(u); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
  });
  // Qué se ve: los de la app, los de Windows o los dos (Windows nunca se toca en el smoke).
  manejar('vista:estado', () => estadoVista());
  manejar('vista:fijar', (modo) => {
    if (!vistaMod.MODOS.includes(modo)) throw new Error('Modo no válido');
    return fijarVista(modo);
  });
}

function fijarIgnorar(l, v) {
  if (!vivo(l)) return;
  l.ignorando = v;
  l.win.setIgnoreMouseEvents(v, v ? { forward: true } : undefined);
}

// Sondeo del cursor: sobre una zona interactiva la ventana recibe el ratón aunque Windows esté
// en medio de un arrastre (iconos del escritorio o del Explorador), cuando el renderer no ve mousemove.
function iniciarSondeoCursor() {
  if (SMOKE || estado.sondeoCursor) return;
  estado.sondeoCursor = setInterval(() => {
    let cursor;
    try { cursor = screen.getCursorScreenPoint(); } catch (_) { return; }
    for (const l of lienzosVivos()) {
      if (!l.win.isVisible()) continue;
      try {
        const v = zonasMod.debeIgnorar({ cursor, limites: l.win.getBounds(), zonas: l.zonas, capturando: l.capturando });
        if (v !== l.ignorando) fijarIgnorar(l, v);
      } catch (_) { /* se reintenta en el siguiente tic */ }
    }
  }, 60);
}

// ---------------------------------------------------------------- varios monitores

function otrasPantallas(l) {
  return lienzosVivos().filter((x) => x !== l).map((x) => ({ clave: x.clave, nombre: x.nombre }));
}

let contadorPedidos = 0;

// Pide al lienzo destino que acomode el elemento; true si lo aceptó (hay lugar). El origen lo quita
// de su lista solo después, así un elemento nunca se pierde si el otro monitor está lleno.
async function moverAPantalla(origen, p) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string') return { ok: false, error: 'Pedido no válido' };
  const el = pantallasMod.deLaPantalla(estado.datos.elementos, origen.clave, estado.conectadas, estado.principal).find((e) => e.id === p.id);
  if (!el) return { ok: false, error: 'No se encontró el elemento' };
  let destino = null;
  let punto = null;
  if (typeof p.destino === 'string') destino = estado.lienzos.get(p.destino) || null;
  else {
    const c = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(c);
    destino = lienzosVivos().find((x) => x.display.id === d.id) || null;
    if (destino) {
      const b = destino.win.getBounds();
      const off = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(2000, v)) : 0);
      punto = { x: c.x - b.x - off(p.offX), y: c.y - b.y - off(p.offY) };
    }
  }
  if (!vivo(destino) || destino === origen) return { ok: false, error: 'misma' };
  const pid = 'p' + (++contadorPedidos);
  const aceptado = new Promise((resolve) => {
    estado.pedidos.set(pid, resolve);
    setTimeout(() => { if (estado.pedidos.delete(pid)) resolve(false); }, 5000);
  });
  enviarA(destino, 'pantalla:recibir', { pid, elemento: el, punto });
  const ok = await aceptado;
  return ok ? { ok: true, nombre: destino.nombre } : { ok: false, error: 'No hay lugar libre en ' + destino.nombre };
}

function listaParaBuscar() {
  const nombreDe = new Map(lienzosVivos().map((l) => [l.clave, l.nombre]));
  const salida = [];
  for (const e of estado.datos.elementos) {
    const clave = pantallasMod.claveEfectiva(e, estado.conectadas, estado.principal);
    const pantalla = estado.lienzos.size > 1 ? (nombreDe.get(clave) || null) : null;
    if (e.tipo === 'acceso') salida.push({ ruta: e.ruta, nombre: e.nombre, carpeta: '', pantalla });
    else if (e.tipo === 'carpeta') for (const h of e.hijos) salida.push({ ruta: h.ruta, nombre: h.nombre, carpeta: e.nombre, pantalla });
  }
  return salida;
}

// Abre el buscador en el monitor donde está el ratón (desde la bandeja).
function abrirBuscador() {
  mostrarAlFrente();
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const l = lienzosVivos().find((x) => x.display.id === d.id) || lienzoPrincipal();
  enviarA(l, 'escritorio:buscar', true);
}

// Iconos del escritorio de Windows (del usuario y el público). Solo se leen las rutas:
// no se mueve ni se borra nada; Windows los sigue mostrando hasta que el usuario los oculte.
async function iconosDelEscritorio() {
  const dirs = [app.getPath('desktop'), path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop')];
  const lista = [];
  for (const d of dirs) {
    let nombres = [];
    try { nombres = await fs.promises.readdir(d); } catch (_) { continue; }
    for (const n of nombres) {
      if (/^desktop\.ini$/i.test(n) || n.startsWith('~$') || n.startsWith('.')) continue;
      lista.push(path.join(d, n));
    }
  }
  const salida = [];
  for (let i = 0; i < lista.length; i += 100) salida.push(...await resolverRutas(lista.slice(i, i + 100)));
  return salida;
}

// ---------------------------------------------------------------- bandeja

function construirMenuBandeja(modo) {
  const actual = modo || estadoVista().modo;
  const opcionVista = (m, label) => ({ label, type: 'radio', checked: actual === m, click: () => fijarVista(m) });
  const menu = Menu.buildFromTemplate([
    { label: 'Mostrar widgets', accelerator: ATAJO, click: alternar },
    { label: 'Buscar…', click: abrirBuscador },
    { type: 'separator' },
    opcionVista('ambos', 'Ver los de la app y los de Windows'),
    opcionVista('app', 'Ver solo los de la app'),
    opcionVista('windows', 'Ver solo los de Windows'),
    { type: 'separator' },
    {
      label: 'Agregar acceso…',
      click: async () => {
        const lista = await resolverRutas(await elegirRutas('archivos'));
        if (lista.length) enviar('escritorio:rutas-nuevas', lista);
      },
    },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() },
  ]);
  return menu;
}

function crearBandeja() {
  const img = nativeImage.createFromBuffer(icono.generarPng());
  if (img.isEmpty()) throw new Error('El icono generado está vacío');
  estado.tray = new Tray(img);
  estado.tray.setToolTip('Escritorio Widgets');
  estado.tray.on('click', alternar);
  // El menú se arma al abrirlo: Windows también se cambia desde su propio menú (Ver → Mostrar
  // iconos del escritorio), así que la marca del modo actual se relee cada vez.
  estado.tray.on('right-click', () => estado.tray.popUpContextMenu(construirMenuBandeja()));
}

// ---------------------------------------------------------------- ventana

// Monitores a cubrir. En el smoke solo el principal (las pruebas no deben depender de la HDMI).
function pantallasActuales() {
  const todas = pantallasMod.listar(screen.getAllDisplays(), screen.getPrimaryDisplay().id);
  return SMOKE || process.env.ESCRITORIO_SOLO_PRINCIPAL === '1' ? todas.filter((p) => p.principal) : todas;
}

function crearVentana(p) {
  const a = p.display.workArea;
  const l = { clave: p.clave, nombre: p.nombre, display: p.display, principal: p.principal, win: null, ignorando: true, zonas: [], capturando: false };
  const w = new BrowserWindow({
    x: Math.round(a.x) || 0, y: Math.round(a.y) || 0, width: a.width, height: a.height,
    show: false, frame: false, thickFrame: false, transparent: true, hasShadow: false,
    resizable: false, movable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: false, // NO siempre encima: ver NOTAS-TECNICAS.md
    title: 'Escritorio Widgets',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      spellcheck: false, devTools: !!process.env.ESCRITORIO_DEVTOOLS,
    },
  });
  l.win = w;
  estado.lienzos.set(l.clave, l);
  w.setMenu(null);
  w.setIgnoreMouseEvents(true, { forward: true });
  w.on('close', (e) => { if (!estado.saliendo && !l.quitando) e.preventDefault(); });
  // Al pasar de un monitor al otro el foco cambia entre ventanas nuestras: eso no cuenta.
  w.on('blur', () => {
    if (!estado.alFrente) return;
    setTimeout(() => { if (estado.alFrente && !lienzosVivos().some((x) => x.win.isFocused())) mandarAlFondo(); }, 60);
  });
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.webContents.on('will-attach-webview', (e) => e.preventDefault());
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('console-message', (e) => {
    if (SMOKE && (e.level === 'error' || e.level === 2 || e.level === 3)) console.error('[renderer]', e.message);
  });
  const cargado = new Promise((resolve) => w.webContents.once('did-finish-load', resolve));
  w.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return cargado.then(() => l);
}

async function abrirLienzo(p) {
  const l = await crearVentana(p);
  colocarLienzo(l);
  if (vivo(l)) l.win.showInactive();
  return l;
}

// Se conectó, quitó o cambió un monitor: crea o cierra lienzos y avisa a todos, porque los
// elementos de un monitor desconectado pasan a verse en el principal (y regresan al reconectarlo).
async function sincronizarPantallas() {
  const lista = pantallasActuales();
  estado.principal = (lista.find((p) => p.principal) || lista[0]).clave;
  estado.conectadas = new Set(lista.map((p) => p.clave));
  for (const l of lienzosVivos()) {
    if (estado.conectadas.has(l.clave)) continue;
    l.quitando = true;
    estado.lienzos.delete(l.clave);
    l.win.destroy();
  }
  for (const p of lista) {
    const l = estado.lienzos.get(p.clave);
    if (vivo(l)) {
      Object.assign(l, { nombre: p.nombre, display: p.display, principal: p.principal });
      colocarLienzo(l);
    } else await abrirLienzo(p);
  }
  for (const l of lienzosVivos()) enviarA(l, 'escritorio:pantalla', { area: l.display.workArea, otras: otrasPantallas(l), datos: datosPara(l) });
}

let temporizadorPantallas = null;
function alCambiarMonitores() {
  clearTimeout(temporizadorPantallas);
  temporizadorPantallas = setTimeout(() => { sincronizarPantallas().catch((e) => console.error('Monitores:', e.message)); }, 600);
}

function endurecerSesion() {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, _permiso, cb) => cb(false));
  s.setPermissionCheckHandler(() => false);
}

function iniciarOrdenZ() {
  if (SMOKE || process.env.ESCRITORIO_SIN_ORDENZ === '1') return;
  try {
    estado.orden = require('./orden-z').crear(() => lienzosVivos().map((l) => l.win.getNativeWindowHandle()));
    if (estado.orden) estado.orden.iniciar();
  } catch (e) {
    estado.orden = null;
    console.error('Sin control del orden z (koffi no cargó):', e.message);
  }
}

// ---------------------------------------------------------------- arranque

function arrancar() {
  if (!SMOKE && !app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', () => mostrarAlFrente());

  app.whenReady().then(async () => {
    estado.archivo = path.join(DIR_DATOS || app.getPath('userData'), 'escritorio.json');
    const c = datos.cargar(estado.archivo);
    estado.datos = c.datos;
    estado.rotoEn = c.roto;
    estado.archivoVista = path.join(path.dirname(estado.archivo), 'vista.json');
    estado.appOculta = vistaMod.cargar(estado.archivoVista).appOculta;
    recordarRutas();
    endurecerSesion();
    registrarIpc();
    const lista = pantallasActuales();
    estado.principal = (lista.find((p) => p.principal) || lista[0]).clave;
    estado.conectadas = new Set(lista.map((p) => p.clave));
    // El principal primero: el smoke y la bandeja usan ese.
    for (const p of [...lista].sort((a, b) => b.principal - a.principal)) await abrirLienzo(p);
    iniciarOrdenZ();
    iniciarSondeoCursor();
    if (!SMOKE) {
      crearBandeja();
      try { estado.atajoRegistrado = globalShortcut.register(ATAJO, alternar); } catch (_) { estado.atajoRegistrado = false; }
      if (!estado.atajoRegistrado) console.error(`No se pudo registrar el atajo ${ATAJO} (otra app lo usa).`);
      for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, alCambiarMonitores);
    }
    resolverListo(true);
  });

  app.on('before-quit', () => { estado.saliendo = true; if (estado.orden) estado.orden.detener(); });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); });
  app.on('window-all-closed', () => { /* vive en la bandeja */ });
}

arrancar();

module.exports = {
  listo,
  get ventana() { const l = lienzoPrincipal(); return l ? l.win : null; },
  estado,
  mostrarAlFrente,
  mandarAlFondo,
};
