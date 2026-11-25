'use strict';
// Prueba de humo: con datos temporales crea dos accesos a archivos temporales, los junta en una
// carpeta arrastrando (ratón real simulado con sendInputEvent), abre la ventanita, agrega y saca
// hijos, prueba el menú y la regla de no tocar archivos; agrega los cinco widgets desde el panel
// "Agregar widget", los mueve y los quita; guarda capturas PNG en scripts/ y sale.
// El clima usa un fetch falso (en SMOKE main.js nunca llama a internet).
// Se ejecuta con: electron scripts/smoke.js  (npm run smoke). No toca los datos reales.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');

const RAIZ = path.resolve(__dirname, '..');
// Electron mantiene bloqueada su carpeta userData hasta salir: al arrancar se borran las de corridas anteriores.
for (const n of fs.readdirSync(os.tmpdir())) {
  if (/^escritorio-smoke-/.test(n)) { try { fs.rmSync(path.join(os.tmpdir(), n), { recursive: true, force: true }); } catch (_) { /* en uso */ } }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'escritorio-smoke-'));
const dirDatos = path.join(tmp, 'datos');
const dirArchivos = path.join(tmp, 'archivos');
fs.mkdirSync(dirDatos, { recursive: true });
fs.mkdirSync(dirArchivos, { recursive: true });

process.env.ESCRITORIO_SMOKE = '1';
process.env.ESCRITORIO_DATA_DIR = dirDatos;

const archivos = {
  a: path.join(dirArchivos, 'Informe de ventas.txt'),
  b: path.join(dirArchivos, 'Lista de pendientes.txt'),
  c: path.join(dirArchivos, 'Presupuesto.txt'),
  d: path.join(dirArchivos, 'Extra.txt'),
  e: path.join(dirArchivos, 'Otro.txt'),
};
const contenidos = {};
for (const [k, ruta] of Object.entries(archivos)) {
  contenidos[k] = `contenido de prueba ${k}\n`;
  fs.writeFileSync(ruta, contenidos[k]);
}
const rutaFantasma = 'C:\\CarpetaQueNoExiste\\Fantasma.lnk';

// Datos previos: un acceso a una ruta inexistente (debe verse gris).
fs.writeFileSync(path.join(dirDatos, 'escritorio.json'), JSON.stringify({
  version: 1, celda: 96,
  elementos: [{ id: 'fantasma', tipo: 'acceso', ruta: rutaFantasma, nombre: 'Fantasma', col: 6, fila: 0 }],
}));

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, descripcion, tope = 8000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > tope) throw new Error('Tiempo agotado esperando: ' + descripcion);
    await esperar(40);
  }
}
const verificar = (cond, msg) => { if (!cond) throw new Error('FALLÓ: ' + msg); console.log('ok  -', msg); };

function limpiar() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* no crítico */ } }

async function principal() {
  const m = require('../src/main/main.js');
  await m.listo;
  const win = m.ventana;
  const wc = win.webContents;
  const js = (codigo) => wc.executeJavaScript(codigo);
  await hasta(() => js('document.documentElement.dataset.listo === "1"'), 'renderer listo');

  // Fondo de color solo para las capturas (la ventana real es transparente).
  const conFondo = async (fn) => {
    await js('document.body.style.background = "#2d4468"');
    await esperar(120);
    await fn();
    await js('document.body.style.background = ""');
  };
  const capturar = async (nombre) => conFondo(async () => {
    const img = await wc.capturePage();
    const png = img.toPNG();
    fs.writeFileSync(path.join(RAIZ, 'scripts', nombre), png);
    console.log(`captura scripts/${nombre}: ${png.length} bytes, ${img.getSize().width}x${img.getSize().height}`);
    if (png.length < 5000) throw new Error(nombre + ' es demasiado pequeña');
  });

  // Cualquier error de consola del renderer (CSP, excepciones) hace fallar el smoke.
  const erroresRenderer = [];
  wc.on('console-message', (e) => { if (e.level === 'error' || e.level === 2 || e.level === 3) erroresRenderer.push(e.message); });

  const datosEnDisco = () => JSON.parse(fs.readFileSync(m.estado.archivo, 'utf8'));
  const elementos = () => js('JSON.parse(JSON.stringify(window.__escritorio.estado.datos.elementos))');
  const rect = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const rectDeId = (id) => rect(`.item[data-id="${id}"]`);

  // Ratón real simulado.
  const mover = async (x, y) => { wc.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) }); await esperar(30); };
  const abajo = async (x, y) => { wc.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }); await esperar(30); };
  const arriba = async (x, y) => { wc.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }); await esperar(80); };
  const clic = async (x, y) => { await mover(x, y); await abajo(x, y); await arriba(x, y); };
  async function arrastrar(de, a) {
    await mover(de.x, de.y); await abajo(de.x, de.y);
    const pasos = 8;
    for (let i = 1; i <= pasos; i++) await mover(de.x + (a.x - de.x) * i / pasos, de.y + (a.y - de.y) * i / pasos);
    await esperar(60);
    await arriba(a.x, a.y);
    await esperar(150);
  }

  // -------- ventana
  const wa = require('electron').screen.getPrimaryDisplay().workArea;
  const b = win.getBounds();
  verificar(JSON.stringify(b) === JSON.stringify(wa), `ventana del tamaño del área de trabajo (${b.width}x${b.height})`);
  verificar(win.isAlwaysOnTop() === false, 'la ventana no es siempre encima');
  verificar(await js('window.escritorio !== undefined && typeof require === "undefined" && typeof process === "undefined"'), 'aislamiento: sin require/process en el renderer');
  const ids = await js('window.EscritorioWidgets.lista.map((w) => w.id)');
  verificar(JSON.stringify(ids) === JSON.stringify(['reloj', 'clima', 'uso-pc', 'notas', 'calendario', 'bateria', 'pendientes', 'enlaces']), 'registro con los 8 widgets: ' + ids.join(', '));

  // -------- datos previos y ruta inexistente en gris
  verificar((await js('document.querySelectorAll(".item.acceso").length')) === 1, 'se cargó el acceso previo');
  verificar(await js('!!document.querySelector(".item.acceso.inexistente")'), 'la ruta inexistente se ve en gris');

  // -------- dos accesos a archivos temporales
  const resueltas = await js(`window.escritorio.resolverRutas(${JSON.stringify([archivos.a, archivos.b])})`);
  verificar(resueltas.length === 2 && resueltas[0].nombre === 'Informe de ventas.txt', 'resolverRutas devuelve los dos archivos con su nombre');
  await js(`window.__escritorio.agregarRutas(${JSON.stringify(resueltas)})`);
  let els = await elementos();
  verificar(els.length === 3 && els.filter((e) => e.tipo === 'acceso').length === 3, 'hay 3 accesos en el escritorio');
  const idA = els.find((e) => e.ruta === archivos.a).id;
  const idB = els.find((e) => e.ruta === archivos.b).id;
  await hasta(() => js('document.querySelectorAll(".item.acceso img.icono").length >= 2'), 'iconos de los accesos reales');
  verificar(true, 'los accesos reales tienen icono de app.getFileIcon');

  // -------- juntar en carpeta arrastrando A sobre B
  await arrastrar(await rectDeId(idA), await rectDeId(idB));
  els = await hasta(async () => { const e = await elementos(); return e.some((x) => x.tipo === 'carpeta') && e; }, 'carpeta creada');
  const carpeta = els.find((e) => e.tipo === 'carpeta');
  verificar(carpeta.hijos.length === 2 && els.filter((e) => e.tipo === 'acceso').length === 1, 'soltar un acceso sobre otro creó una carpeta con 2 hijos');
  verificar(carpeta.nombre === 'Carpeta', 'la carpeta se llama "Carpeta"');
  verificar(await js('document.querySelectorAll(".item.carpeta .carpeta-icono .mini").length === 2'), 'el icono de carpeta muestra la vista 2x2 con los iconos de sus hijos');
  await esperar(200);
  verificar(datosEnDisco().elementos.some((e) => e.tipo === 'carpeta'), 'la carpeta quedó guardada en escritorio.json');
  await capturar('smoke-lienzo.png');

  // -------- soltar un archivo del Explorador (simulado) sobre la carpeta
  const [rd] = await js(`window.escritorio.resolverRutas(${JSON.stringify([archivos.c])})`);
  await js(`window.__escritorio.agregarRutas(${JSON.stringify([rd])}, { destinoId: ${JSON.stringify(carpeta.id)} })`);
  els = await elementos();
  verificar(els.find((e) => e.id === carpeta.id).hijos.length === 3, 'soltar un archivo sobre la carpeta lo añadió');

  // -------- clic en la carpeta abre la ventanita
  await clic(...Object.values(await rectDeId(carpeta.id)).slice(0, 2));
  await hasta(() => js('!document.getElementById("ventanita").hidden'), 'ventanita abierta');
  verificar((await js('document.querySelectorAll("#ventanita .vent-grid .hijo").length')) === 3, 'la ventanita muestra 3 hijos');
  const cols = await js('getComputedStyle(document.querySelector("#ventanita .vent-grid")).gridTemplateColumns.split(" ").length');
  verificar(cols === 4, 'la ventanita tiene 4 columnas');
  await capturar('smoke-carpeta.png');

  // -------- renombrar la carpeta desde la ventanita
  await js(`(() => { const i = document.querySelector("#ventanita .vent-nombre"); i.value = "Oficina"; i.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await hasta(async () => (await elementos()).find((e) => e.id === carpeta.id).nombre === 'Oficina', 'renombrar carpeta');
  verificar(true, 'el nombre de la carpeta es editable (Oficina)');

  // -------- botón + de la ventanita (diálogo simulado)
  process.env.ESCRITORIO_DIALOGO = JSON.stringify([archivos.d]);
  const mas = await rect('#ventanita .vent-mas');
  await clic(mas.x, mas.y);
  await hasta(async () => (await elementos()).find((e) => e.id === carpeta.id).hijos.length === 4, 'agregar con el botón +');
  verificar(true, 'el botón + de la ventanita agregó un acceso (4 hijos)');

  // -------- Esc cierra; clic fuera cierra
  await js('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
  await hasta(() => js('document.getElementById("ventanita").hidden'), 'Esc cierra');
  verificar(true, 'Esc cierra la ventanita');
  await clic(...Object.values(await rectDeId(carpeta.id)).slice(0, 2));
  await hasta(() => js('!document.getElementById("ventanita").hidden'), 'reabrir');
  await clic(window_x(wa), window_y(wa));
  await hasta(() => js('document.getElementById("ventanita").hidden'), 'clic fuera cierra');
  verificar(true, 'clic fuera cierra la ventanita');

  // -------- clic en un acceso inexistente avisa y no abre nada
  els = await elementos();
  await clic(...Object.values(await rectDeId('fantasma')).slice(0, 2));
  verificar(await js('!document.getElementById("aviso").hidden && /No se encontró/.test(document.getElementById("aviso").textContent)'), 'clic en un acceso gris avisa "No se encontró"');
  verificar(m.estado.abiertos.length === 0, 'y no intenta abrirlo');

  // -------- menú contextual
  const objetivoMenu = els.find((e) => e.tipo === 'carpeta');
  const rm = await rectDeId(objetivoMenu.id);
  await js(`document.querySelector('.item[data-id="${objetivoMenu.id}"]').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${Math.round(rm.x)}, clientY: ${Math.round(rm.y)} }))`);
  const opcionesCarpeta = await js('[...document.querySelectorAll("#menu .menu-op")].map((b) => b.textContent)');
  verificar(['Renombrar', 'Quitar del escritorio', 'Agregar acceso…', 'Agregar widget…'].every((t) => opcionesCarpeta.includes(t)), 'menú de carpeta: ' + opcionesCarpeta.join(' | '));
  await capturar('smoke-menu.png');
  // Agregar widget… abre el panel con una miniatura, nombre y tamaño de cada widget.
  await js('[...document.querySelectorAll("#menu .menu-op")].find((b) => b.textContent === "Agregar widget…").click()');
  await hasta(() => js('!document.getElementById("hoja").hidden'), 'panel de widgets abierto');
  const tarjetas = await js('[...document.querySelectorAll("#hoja .hoja-tarjeta")].map((t) => ({ id: t.dataset.widget, nombre: t.querySelector(".hoja-nombre").textContent, tam: t.querySelector(".hoja-tamano").textContent, vista: !!t.querySelector(".hoja-vista .widget .widget-cuerpo *") }))');
  verificar(tarjetas.length === 8 && tarjetas.every((t) => t.vista), 'el panel muestra 8 tarjetas con miniatura: ' + tarjetas.map((t) => `${t.nombre} ${t.tam}`).join(' | '));
  verificar(tarjetas.find((t) => t.id === 'clima').tam === '4 × 1' && tarjetas.find((t) => t.id === 'reloj').tam === '2 × 2', 'las tarjetas dicen su tamaño');
  await capturar('smoke-panel.png');
  await js('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
  await hasta(() => js('document.getElementById("hoja").hidden'), 'Esc cierra el panel');
  verificar(true, 'Esc cierra el panel de widgets');

  // Acceso: abrir ubicación y abrir.
  const idFantasma = 'fantasma';
  const rf = await rectDeId(idFantasma);
  await js(`document.querySelector('.item[data-id="${idFantasma}"]').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${Math.round(rf.x)}, clientY: ${Math.round(rf.y)} }))`);
  const opcionesAcceso = await js('[...document.querySelectorAll("#menu .menu-op")].map((b) => b.textContent)');
  verificar(['Abrir', 'Renombrar', 'Abrir ubicación', 'Quitar del escritorio'].every((t) => opcionesAcceso.includes(t)), 'menú de acceso: ' + opcionesAcceso.join(' | '));
  await js('document.getElementById("cortina").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))');

  // -------- sacar hijos arrastrando: la carpeta de 1 hijo se deshace
  await clic(...Object.values(await rectDeId(objetivoMenu.id)).slice(0, 2));
  await hasta(() => js('!document.getElementById("ventanita").hidden'), 'ventanita para sacar hijos');
  // Clic en un hijo: abre (solo se registra) y cierra la ventanita.
  const primerHijo = await rect('#ventanita .hijo');
  await clic(primerHijo.x, primerHijo.y);
  await hasta(() => js('document.getElementById("ventanita").hidden'), 'abrir un hijo cierra la ventanita');
  verificar(m.estado.abiertos.length === 1 && Object.values(archivos).includes(m.estado.abiertos[0]), 'clic en un acceso lo manda a shell.openPath (registrado: ' + path.basename(m.estado.abiertos[0] || '') + ')');

  const destinos = [{ x: 700, y: 400 }, { x: 800, y: 500 }, { x: 900, y: 300 }];
  let n = 0;
  for (;;) {
    els = await elementos();
    const c = els.find((e) => e.id === objetivoMenu.id);
    if (!c) break;
    await clic(...Object.values(await rectDeId(c.id)).slice(0, 2));
    await hasta(() => js('!document.getElementById("ventanita").hidden'), 'ventanita abierta para sacar');
    const hijoRect = await rect('#ventanita .hijo');
    await arrastrar(hijoRect, destinos[n % destinos.length]);
    n++;
    if (n > 6) throw new Error('La carpeta no se deshizo');
    await esperar(150);
  }
  els = await elementos();
  verificar(!els.some((e) => e.tipo === 'carpeta'), `la carpeta se deshizo al quedar con 1 hijo (tras sacar ${n} hijos)`);
  verificar(els.filter((e) => e.tipo === 'acceso').length === 5, 'los 4 hijos de la carpeta + el acceso fantasma quedaron en el escritorio');
  verificar(await js('document.getElementById("ventanita").hidden'), 'la ventanita se cerró al deshacerse la carpeta');

  // -------- quitar del escritorio no toca archivos
  const rq = await rectDeId(idFantasma);
  await js(`document.querySelector('.item[data-id="${idFantasma}"]').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${Math.round(rq.x)}, clientY: ${Math.round(rq.y)} }))`);
  await js('[...document.querySelectorAll("#menu .menu-op")].find((b) => b.textContent === "Quitar del escritorio").click()');
  await hasta(async () => !(await elementos()).some((e) => e.id === idFantasma), 'quitar acceso');
  verificar(true, '"Quitar del escritorio" quitó el acceso de la lista');

  // -------- mover un acceso a otra celda libre (arrastre sin soltar sobre otro)
  els = await elementos();
  const mov = els[0];
  const rMov = await rectDeId(mov.id);
  await arrastrar(rMov, { x: rMov.x + 96 * 5, y: rMov.y + 96 * 3 });
  const tras = (await elementos()).find((e) => e.id === mov.id);
  verificar(tras.col !== mov.col || tras.fila !== mov.fila, `arrastrar a una celda libre mueve el acceso (${mov.col},${mov.fila}) -> (${tras.col},${tras.fila})`);

  // ================================================================ widgets
  const PX = 96;
  const idDeWidget = async (nombre) => (await elementos()).find((e) => e.tipo === 'widget' && e.widget === nombre);
  const textoDe = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ""`);
  const abrirPanel = () => js('document.dispatchEvent(new CustomEvent("escritorio:agregar-widget", { cancelable: true }))');

  async function agregarDesdePanel(id) {
    await abrirPanel();
    await hasta(() => js('!document.getElementById("hoja").hidden'), 'panel abierto para ' + id);
    const r = await rect(`#hoja .hoja-tarjeta[data-widget="${id}"]`);
    verificar(!!r, `la tarjeta de ${id} está en el panel`);
    await clic(r.x, r.y);
    await hasta(async () => !!(await idDeWidget(id)), 'widget ' + id + ' colocado');
    verificar(await js('document.getElementById("hoja").hidden'), `al elegir ${id} el panel se cierra`);
    await esperar(150);
  }

  // El botón "+" también ofrece "Agregar widget…".
  const botonMas = await rect('#boton-mas');
  await clic(botonMas.x, botonMas.y);
  await hasta(() => js('!document.getElementById("menu").hidden'), 'menú del botón +');
  verificar(await js('[...document.querySelectorAll("#menu .menu-op")].some((b) => b.textContent === "Agregar widget…")'), 'el botón + ofrece "Agregar widget…"');
  await js('document.getElementById("cortina").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))');

  for (const id of ['reloj', 'clima', 'uso-pc', 'notas', 'calendario']) await agregarDesdePanel(id);
  els = await elementos();
  const widgets = els.filter((e) => e.tipo === 'widget');
  verificar(widgets.length === 5, 'los 5 widgets quedaron en el escritorio');

  // Cada uno se ve con el tamaño de su ocupación en celdas.
  const tam = { reloj: [2, 2], clima: [4, 1], 'uso-pc': [2, 1], notas: [2, 2], calendario: [2, 2] };
  for (const w of widgets) {
    const r = await rectDeId(w.id);
    const [a, l] = tam[w.widget];
    // Los widgets llevan 6 px de margen por lado dentro de sus celdas (MARGEN_WIDGET en app.js).
    verificar(r && Math.abs(r.w - (a * PX - 12)) < 2 && Math.abs(r.h - (l * PX - 12)) < 2 && w.ancho === a && w.alto === l, `${w.widget} se ve de ${a}x${l} celdas menos el margen (${Math.round(r.w)}x${Math.round(r.h)} px)`);
  }
  // Sin choques entre elementos.
  const rects = [];
  for (const e of await elementos()) {
    const r = await rectDeId(e.id);
    rects.push({ id: e.id, x0: r.x - r.w / 2, y0: r.y - r.h / 2, x1: r.x + r.w / 2, y1: r.y + r.h / 2 });
  }
  const choca = rects.some((a, i) => rects.slice(i + 1).some((b) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1));
  verificar(!choca, 'ningún elemento se encima con otro');

  // Reloj
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  verificar(dias.includes(await textoDe('.reloj-dia')), 'reloj: día de la semana "' + await textoDe('.reloj-dia') + '"');
  verificar(/^\d{1,2} [A-Z]{3}$/.test(await textoDe('.reloj-fecha')), 'reloj: fecha "' + await textoDe('.reloj-fecha') + '"');
  verificar(/^\d{1,2}:\d{2}$/.test(await textoDe('.reloj-hora')) && /^(a|p)\. m\.$/.test(await textoDe('.reloj-sufijo')), 'reloj: hora grande "' + await textoDe('.reloj-hora') + ' ' + await textoDe('.reloj-sufijo') + '"');

  // Clima (con fetch falso: nunca internet)
  await hasta(async () => (await textoDe('.clima-temp')) === '15°', 'clima cargado');
  verificar(await textoDe('.clima-ciudad') === 'Ciudad Juárez', 'clima: ciudad por defecto Ciudad Juárez');
  verificar(await textoDe('.clima-atardecer') === 'Atardecer a las 5:02 p. m.', 'clima: "' + await textoDe('.clima-atardecer') + '"');
  verificar(await textoDe('.clima-icono') === '⛅', 'clima: icono de parcialmente nublado');
  verificar(m.estado.climaFalso && m.estado.climaFalso.llamadas.length === 1 && m.estado.climaFalso.llamadas[0].includes('latitude=31.69'), 'clima: una sola petición (falsa) con las coordenadas de Ciudad Juárez');
  await esperar(250);
  const cacheDisco = datosEnDisco().clima.cache;
  verificar(cacheDisco && cacheDisco.temperatura === 14.6 && cacheDisco.actualizado > 0, 'clima: el último dato quedó guardado en escritorio.json con su hora');

  // Uso de PC: las tres barras se llenan y la lectura se repite cada 2 s mientras está montado
  await hasta(async () => (await js('[...document.querySelectorAll(".uso-valor")].map((e) => e.textContent)')).every((t) => /^\d+ %$/.test(t)), 'barras de uso de PC', 6000);
  const usos = await js('[...document.querySelectorAll(".uso-valor")].map((e) => e.textContent)');
  verificar(true, 'uso de PC: RAM, CPU y C: = ' + usos.join(', '));
  const lecturas0 = m.estado.lecturasSistema;
  await esperar(4300);
  verificar(m.estado.lecturasSistema >= lecturas0 + 2, `uso de PC: se actualiza cada 2 s (${m.estado.lecturasSistema - lecturas0} lecturas en 4.3 s)`);

  // Notas: texto con espera de 500 ms
  const idNotas = (await idDeWidget('notas')).id;
  await js('(() => { const t = document.querySelector(".notas-texto"); t.value = "Llamar al proveedor\\nRevisar pedido 2087"; t.dispatchEvent(new Event("input", { bubbles: true })); })()');
  await esperar(150);
  verificar(datosEnDisco().notas.texto === '', 'notas: no se guarda antes de los 500 ms');
  await hasta(() => datosEnDisco().notas.texto === 'Llamar al proveedor\nRevisar pedido 2087', 'notas guardadas', 3000);
  verificar(true, 'notas: se guardó en escritorio.json (campo notas.texto) tras la espera');

  // Calendario: mes actual con hoy resaltado y la semana en lunes
  const hoy = new Date();
  verificar((await textoDe('.cal-hoy')) === String(hoy.getDate()), 'calendario: hoy resaltado (' + hoy.getDate() + ')');
  verificar(/^[A-Za-zéÉ]+ \d{4}$/.test(await textoDe('.cal-titulo')), 'calendario: título "' + await textoDe('.cal-titulo') + '"');
  verificar((await js('[...document.querySelectorAll(".cal-letra")].map((e) => e.textContent).join("")')) === 'LMMJVSD', 'calendario: la semana empieza en lunes');
  await capturar('smoke-widgets.png');

  // Mover un widget arrastrándolo (el reloj, desde su texto)
  const reloj0 = await idDeWidget('reloj');
  const rr = await rectDeId(reloj0.id);
  await arrastrar({ x: rr.x, y: rr.y - 40 }, { x: rr.x + PX * 5, y: rr.y - 40 + PX * 2 });
  const reloj1 = await idDeWidget('reloj');
  verificar(reloj1.col !== reloj0.col || reloj1.fila !== reloj0.fila, `mover: el reloj pasó de (${reloj0.col},${reloj0.fila}) a (${reloj1.col},${reloj1.fila})`);
  verificar(reloj1.ancho === 2 && reloj1.alto === 2, 'mover: conserva su tamaño 2x2');
  const rr1 = await rectDeId(reloj1.id);
  verificar(Math.abs((rr1.x - rr1.w / 2) - (reloj1.col * PX + 6)) < 2, 'mover: el nodo quedó en su celda nueva');

  // Cambiar el tamaño: arrastrar la esquina del reloj una celda a la derecha (2x2 -> 3x2).
  const asa = await js(`(() => { const r = document.querySelector('.item[data-id="${reloj1.id}"] .asa-tamano').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await arrastrar(asa, { x: asa.x + PX, y: asa.y });
  const reloj2 = await hasta(async () => { const w = await idDeWidget('reloj'); return w.ancho === 3 && w; }, 'reloj de 3x2');
  verificar(reloj2.alto === 2 && reloj2.col === reloj1.col && reloj2.fila === reloj1.fila, 'tamaño: el reloj quedó de 3x2 sin moverse');
  const rr2 = await rectDeId(reloj2.id);
  verificar(Math.abs(rr2.w - (3 * PX - 12)) < 2 && Math.abs(rr2.h - (2 * PX - 12)) < 2, `tamaño: el nodo mide 3x2 celdas (${Math.round(rr2.w)}x${Math.round(rr2.h)} px)`);
  const zoomReloj = () => js(`getComputedStyle(document.querySelector('.item[data-id="${reloj2.id}"] .widget-cuerpo')).zoom`);
  verificar((await zoomReloj()) === '1', 'tamaño: solo más ancho, la letra no cambia');
  await esperar(200);
  verificar(datosEnDisco().elementos.find((e) => e.id === reloj2.id).ancho === 3, 'tamaño: quedó guardado');
  // Hacia abajo choca con un acceso: no cambia y avisa.
  const asa2 = await js(`(() => { const r = document.querySelector('.item[data-id="${reloj2.id}"] .asa-tamano').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await arrastrar(asa2, { x: asa2.x, y: asa2.y + PX * 2 });
  verificar((await idDeWidget('reloj')).alto === 2 && /No cabe/.test(await js('document.getElementById("aviso").textContent')), 'tamaño: si choca con otro elemento no cambia y avisa');
  // 4x4 (el doble del de fábrica): el contenido se ve al doble (solo en pantalla; se regresa).
  await js(`(() => { const e = window.__escritorio.estado.datos.elementos.find((x) => x.id === "${reloj2.id}"); e.ancho = 4; e.alto = 4; window.__escritorio.render(); })()`);
  verificar((await zoomReloj()) === '2', 'tamaño: un reloj de 4x4 se dibuja al doble');
  await js(`(() => { const e = window.__escritorio.estado.datos.elementos.find((x) => x.id === "${reloj2.id}"); e.ancho = 3; e.alto = 2; window.__escritorio.render(); })()`);

  // Menú del clima: Cambiar ciudad… con el cuadro de búsqueda dentro del lienzo
  const climaId = (await idDeWidget('clima')).id;
  const abrirMenuWidget = async (id) => {
    const r = await rectDeId(id);
    await js(`document.querySelector('.item[data-id="${id}"]').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${Math.round(r.x)}, clientY: ${Math.round(r.y)} }))`);
    return js('[...document.querySelectorAll("#menu .menu-op")].map((b) => b.textContent)');
  };
  const opcionesClima = await abrirMenuWidget(climaId);
  verificar(['Cambiar ciudad…', 'Actualizar clima', 'Quitar widget', 'Agregar widget…'].every((t) => opcionesClima.includes(t)), 'menú del clima: ' + opcionesClima.join(' | '));
  await js('[...document.querySelectorAll("#menu .menu-op")].find((b) => b.textContent === "Cambiar ciudad…").click()');
  await hasta(() => js('!!document.querySelector(".buscador .buscador-campo")'), 'cuadro de búsqueda');
  await js('(() => { const c = document.querySelector(".buscador-campo"); c.value = "Chihuahua"; c.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()');
  await hasta(async () => (await js('document.querySelectorAll(".buscador-opcion").length')) === 2, 'resultados de la búsqueda');
  verificar((await textoDe('.buscador-opcion .buscador-detalle')) === 'Chihuahua, México', 'búsqueda de ciudad: resultados con estado y país');
  const ob = await rect('.buscador-opcion');
  await clic(ob.x, ob.y);
  await hasta(async () => (await textoDe('.clima-ciudad')) === 'Chihuahua', 'ciudad cambiada');
  verificar(await js('!document.querySelector(".buscador")'), 'el cuadro de búsqueda se cierra al elegir');
  await esperar(250);
  const dc = datosEnDisco().clima;
  verificar(dc.nombre === 'Chihuahua' && Math.abs(dc.lat - 28.63528) < 1e-6 && dc.cache && dc.cache.lat === dc.lat, 'la ciudad nueva y su caché quedaron en escritorio.json');
  verificar(m.estado.climaFalso.llamadas.every((u) => u.startsWith('https://api.open-meteo.com/') || u.startsWith('https://geocoding-api.open-meteo.com/')), 'el clima solo llamó a los dos hosts de Open-Meteo (todo falso)');

  // Sin red: "Actualizar clima" conserva el último dato y avisa cuándo fue
  m.estado.climaFalso.fallar = true;
  await abrirMenuWidget(climaId);
  await js('[...document.querySelectorAll("#menu .menu-op")].find((b) => b.textContent === "Actualizar clima").click()');
  await hasta(async () => /Sin conexión/.test(await textoDe('.clima-estado')), 'aviso sin conexión');
  verificar(/actualizado/.test(await textoDe('.clima-estado')) && (await textoDe('.clima-temp')) === '15°', 'sin red: muestra el último dato y "' + await textoDe('.clima-estado') + '"');
  m.estado.climaFalso.fallar = false;

  // Quitar widgets: se detienen sus temporizadores
  const idUso = (await idDeWidget('uso-pc')).id;
  const opcionesUso = await abrirMenuWidget(idUso);
  verificar(opcionesUso.includes('Quitar widget') && !opcionesUso.includes('Cambiar ciudad…'), 'menú del widget de uso: ' + opcionesUso.join(' | '));
  await js('[...document.querySelectorAll("#menu .menu-op")].find((b) => b.textContent === "Quitar widget").click()');
  await hasta(async () => !(await idDeWidget('uso-pc')), 'uso de PC quitado');
  verificar(await js('!document.querySelector(".uso") && window.__escritorio.estado.montados.size === 4'), 'quitar: el widget sale del lienzo y de los montados');
  await esperar(300);
  const lecturasFin = m.estado.lecturasSistema;
  await esperar(2600);
  verificar(m.estado.lecturasSistema === lecturasFin, 'quitar: el widget de uso dejó de pedir lecturas (temporizador detenido)');

  // Quitar las notas guarda lo pendiente
  await js('(() => { const t = document.querySelector(".notas-texto"); t.value += "\\nY comprar café"; t.dispatchEvent(new Event("input", { bubbles: true })); })()');
  await abrirMenuWidget(idNotas);
  await js('[...document.querySelectorAll("#menu .menu-op")].find((b) => b.textContent === "Quitar widget").click()');
  await hasta(async () => !(await idDeWidget('notas')), 'notas quitado');
  await esperar(200);
  verificar(/Y comprar café$/.test(datosEnDisco().notas.texto), 'quitar notas: lo escrito sin guardar se guarda al desmontar');
  verificar(!datosEnDisco().elementos.some((e) => e.widget === 'uso-pc' || e.widget === 'notas'), 'los widgets quitados ya no están en escritorio.json');
  // -------- qué se ve: "Ver solo los de Windows" esconde la app (Windows no se toca en el smoke)
  const opsMas = await js('(async () => { document.getElementById("boton-mas").click(); await new Promise((r) => setTimeout(r, 150)); return [...document.querySelectorAll("#menu .menu-op")].map((b) => b.textContent + (b.classList.contains("marcado") ? " ✓" : "")); })()');
  verificar(opsMas.includes('Ver los de la app y los de Windows ✓') && opsMas.includes('Ver solo los de la app') && opsMas.includes('Ver solo los de Windows'), 'menú del +: los tres modos, marcado "los dos": ' + opsMas.join(' | '));
  await js('[...document.querySelectorAll("#menu .menu-op")].find((b) => b.textContent === "Ver solo los de Windows").click()');
  await hasta(async () => js('document.body.classList.contains("app-oculta")'), 'app oculta');
  await esperar(400);
  const zonasOcultas = await js('(() => { const r = document.getElementById("boton-mas").getBoundingClientRect(); return { visibles: [...document.querySelectorAll(".item")].filter((n) => n.getBoundingClientRect().width > 0).length, mas: r.width > 0 }; })()');
  verificar(zonasOcultas.visibles === 0 && zonasOcultas.mas, 'solo Windows: no se ve ningún elemento de la app y el + se queda');
  verificar(await js('window.__escritorio.estado.montados.size === 0'), 'solo Windows: los widgets se desmontan (dejan de pedir datos)');
  verificar(m.estado.lienzos.get(m.estado.principal).zonas.length === 1, 'solo Windows: la única zona que recibe el ratón es el +');
  verificar(JSON.parse(fs.readFileSync(path.join(path.dirname(m.estado.archivo), 'vista.json'), 'utf8')).appOculta === true, 'el modo queda guardado en vista.json');
  const elementosAntes = JSON.stringify(datosEnDisco().elementos);
  await js('window.__escritorio.verVista("ambos")');
  await hasta(async () => !(await js('document.body.classList.contains("app-oculta")')), 'app visible otra vez');
  await esperar(250);
  verificar(JSON.stringify(datosEnDisco().elementos) === elementosAntes && (await js('[...document.querySelectorAll(".item")].filter((n) => n.getBoundingClientRect().width > 0).length')) > 0, 'volver a "los dos": todo regresa igual');
  // ================================================================ deshacer, carpetas, buscador y widgets nuevos
  const tecla = (key, extra = {}, sel = null) => js(`(${sel ? `document.querySelector(${JSON.stringify(sel)})` : 'document'}).dispatchEvent(new KeyboardEvent("keydown", ${JSON.stringify({ key, bubbles: true, ...extra })}))`);
  const posDe = async (id) => { const e = (await elementos()).find((x) => x.id === id); return e ? e.col + ',' + e.fila : null; };
  const menuDe = async (id) => {
    const r = await rectDeId(id);
    await js(`document.querySelector('.item[data-id="${id}"]').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${Math.round(r.x)}, clientY: ${Math.round(r.y)} }))`);
    await hasta(() => js('!document.getElementById("menu").hidden'), 'menú abierto');
    return js('[...document.querySelectorAll("#menu .menu-op")].map((b) => b.textContent)');
  };

  // Ctrl+Z / Ctrl+Y
  let accs = (await elementos()).filter((e) => e.tipo === 'acceso');
  const mv = accs[0];
  const posAntes = await posDe(mv.id);
  await arrastrar(await rectDeId(mv.id), { x: window_x(wa), y: window_y(wa) });
  const posMovido = await posDe(mv.id);
  verificar(posMovido !== posAntes, `se movió un acceso para probar Deshacer (${posAntes} -> ${posMovido})`);
  const opsFondo = await menuDe(accs[1].id);
  verificar(opsFondo.some((t) => t.startsWith('Deshacer: mover')), 'el menú ofrece "Deshacer: mover"');
  await js('document.getElementById("cortina").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))');
  await tecla('z', { ctrlKey: true });
  await hasta(async () => (await posDe(mv.id)) === posAntes, 'Ctrl+Z regresa el acceso');
  verificar(/Se deshizo: mover/.test(await textoDe('#aviso')) && await js('!!document.querySelector("#aviso .aviso-accion")'), 'Ctrl+Z deshace y el aviso ofrece Rehacer: ' + await textoDe('#aviso'));
  await tecla('y', { ctrlKey: true });
  await hasta(async () => (await posDe(mv.id)) === posMovido, 'Ctrl+Y rehace');
  verificar(true, 'Ctrl+Y lo vuelve a mover');
  await tecla('z', { ctrlKey: true });
  await hasta(async () => (await posDe(mv.id)) === posAntes, 'deshacer otra vez');
  await esperar(250);
  verificar(datosEnDisco().elementos.find((e) => e.id === mv.id).col + ',' + datosEnDisco().elementos.find((e) => e.id === mv.id).fila === posAntes, 'lo deshecho también queda guardado');

  // Carpeta nueva con 3 accesos: ordenar por nombre, color y reordenar arrastrando
  accs = (await elementos()).filter((e) => e.tipo === 'acceso');
  await arrastrar(await rectDeId(accs[1].id), await rectDeId(accs[2].id));
  let nueva = await hasta(async () => (await elementos()).find((e) => e.tipo === 'carpeta'), 'carpeta para ordenar');
  await arrastrar(await rectDeId(accs[3].id), await rectDeId(nueva.id));
  nueva = await hasta(async () => { const c = (await elementos()).find((e) => e.id === nueva.id); return c && c.hijos.length === 3 && c; }, 'tercer acceso en la carpeta');
  const opsCarpeta = await menuDe(nueva.id);
  verificar(opsCarpeta.includes('Ordenar por nombre') && await js('document.querySelectorAll("#menu .color-op").length === 9'), 'menú de carpeta: "Ordenar por nombre" y 9 colores');
  await js('[...document.querySelectorAll("#menu .menu-op")].find((b) => b.textContent === "Ordenar por nombre").click()');
  await esperar(200);
  const ordenados = (await elementos()).find((e) => e.id === nueva.id).hijos.map((h) => h.nombre);
  verificar(JSON.stringify(ordenados) === JSON.stringify([...ordenados].sort((x, y) => x.localeCompare(y, 'es', { sensitivity: 'base', numeric: true }))), 'ordenar por nombre: ' + ordenados.join(', '));
  await menuDe(nueva.id);
  await js('document.querySelector("#menu .color-op[data-color=verde]").click()');
  await hasta(async () => (await elementos()).find((e) => e.id === nueva.id).color === 'verde', 'color verde');
  await esperar(200);
  verificar(await js(`document.querySelector('.item[data-id="${nueva.id}"] .carpeta-icono').dataset.color === "verde"`) && datosEnDisco().elementos.find((e) => e.id === nueva.id).color === 'verde', 'la carpeta se ve verde y el color quedó guardado');
  await clic(...Object.values(await rectDeId(nueva.id)).slice(0, 2));
  await hasta(() => js('!document.getElementById("ventanita").hidden'), 'ventanita para reordenar');
  verificar(await js('document.getElementById("ventanita").dataset.color === "verde"'), 'la ventanita lleva el color de la carpeta');
  const hijosR = await js('[...document.querySelectorAll("#ventanita .hijo")].map((n) => { const r = n.getBoundingClientRect(); return { id: n.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })');
  await arrastrar(hijosR[2], hijosR[0]);
  await hasta(async () => (await elementos()).find((e) => e.id === nueva.id).hijos[0].id === hijosR[2].id, 'reordenar arrastrando');
  verificar(await js('!document.getElementById("ventanita").hidden && document.querySelector("#ventanita .hijo").dataset.id === ' + JSON.stringify(hijosR[2].id)), 'arrastrar dentro de la ventanita cambia el orden y la deja abierta');
  await tecla('Escape');
  await tecla('z', { ctrlKey: true });
  await hasta(async () => (await elementos()).find((e) => e.id === nueva.id).hijos[0].id === hijosR[0].id, 'deshacer el orden');
  verificar(true, 'Ctrl+Z regresa el orden de la carpeta');

  // Buscador
  await tecla('f', { ctrlKey: true });
  await hasta(() => js('!!document.querySelector(".buscar-panel")'), 'Ctrl+F abre el buscador');
  await js('(() => { const c = document.querySelector(".buscar-campo"); c.value = "presu"; c.dispatchEvent(new Event("input", { bubbles: true })); })()');
  await hasta(() => js('document.querySelectorAll(".buscar-opcion").length >= 1'), 'resultados del buscador');
  const res = await js('[...document.querySelectorAll(".buscar-opcion")].map((b) => b.textContent)');
  verificar(res.length === 1 && res[0].startsWith('Presupuesto.txt'), 'buscar "presu" encuentra Presupuesto.txt: ' + res.join(' | '));
  const abiertosAntes = m.estado.abiertos.length;
  await tecla('Enter', {}, '.buscar-campo');
  await hasta(() => m.estado.abiertos.length > abiertosAntes, 'Enter abre el resultado');
  verificar(m.estado.abiertos[m.estado.abiertos.length - 1] === archivos.c && await js('!document.querySelector(".buscar-panel")'), 'Enter abre Presupuesto.txt y cierra el buscador');
  await js('window.__escritorio.abrirBuscador()');
  await hasta(() => js('!!document.querySelector(".buscar-panel")'), 'buscador otra vez');
  await js('(() => { const c = document.querySelector(".buscar-campo"); c.value = "oficina zzz"; c.dispatchEvent(new Event("input", { bubbles: true })); })()');
  await esperar(100);
  verificar(/No se encontró/.test(await textoDe('.buscar-panel .buscador-nota')), 'sin resultados lo dice');
  await tecla('Escape', {}, '.buscar-campo');
  await hasta(() => js('!document.querySelector(".buscar-panel")'), 'Esc cierra el buscador');
  verificar(true, 'Esc cierra el buscador');

  // Widgets nuevos
  await agregarDesdePanel('bateria');
  await hasta(async () => (await textoDe('.bat-pct')) === '64%', 'batería pintada');
  verificar((await textoDe('.bat-estado')) === '3 h 05 min', 'batería: 64% y "' + await textoDe('.bat-estado') + '"');

  await agregarDesdePanel('pendientes');
  await js('(() => { const c = document.querySelector(".pend-campo"); c.value = "Comprar resina"; })()');
  await tecla('Enter', {}, '.pend-campo');
  await hasta(() => js('document.querySelectorAll(".pend-fila").length === 1'), 'pendiente agregado');
  await js('document.querySelector(".pend-check").click()');
  await esperar(250);
  const wPend = datosEnDisco().elementos.find((e) => e.widget === 'pendientes');
  verificar(JSON.stringify(wPend.opciones.items) === JSON.stringify([{ t: 'Comprar resina', hecho: true }]) && await js('document.querySelector(".pend-fila").classList.contains("hecho")'), 'pendientes: agregar con Enter, marcar y queda guardado');

  await agregarDesdePanel('enlaces');
  await js('document.querySelector(".enl-mas").click()');
  await hasta(() => js('!!document.querySelector(".buscador .buscador-campo")'), 'formulario de enlace');
  await js('(() => { const c = document.querySelector(".buscador .buscador-campo"); c.value = "google.com"; })()');
  await tecla('Enter', {}, '.buscador .buscador-campo');
  await hasta(() => js('document.querySelectorAll(".enl-item:not(.enl-mas)").length === 1'), 'enlace agregado');
  await js('document.querySelector(".enl-item:not(.enl-mas)").click()');
  await hasta(() => m.estado.webAbiertos.includes('https://google.com/'), 'enlace abierto');
  verificar(true, 'enlaces: agregar "google.com" y abrirlo en el navegador (registrado)');
  const malo = await js('window.escritorio.abrirWeb("https://otra-pagina.com/")');
  const archivo = await js('window.escritorio.abrirWeb("file:///C:/Windows/notepad.exe")');
  verificar(malo.ok === false && archivo.ok === false && m.estado.webAbiertos.length === 1, 'el proceso principal no abre enlaces que no estén guardados ni que no sean web');
  verificar(erroresRenderer.length === 0, 'sin errores de consola tras las mejoras' + (erroresRenderer.length ? ': ' + erroresRenderer.join(' | ') : ''));
  await capturar('smoke-mejoras.png');

  // -------- quitar se puede deshacer (una carpeta entera vuelve con todo lo que tenía)
  const antesQuitar = await elementos();
  const aQuitar = antesQuitar.find((e) => e.tipo === 'carpeta') || antesQuitar.find((e) => e.tipo === 'acceso');
  await abrirMenuWidget(aQuitar.id);
  await js('[...document.querySelectorAll("#menu .menu-op")].find((b) => b.textContent === "Quitar del escritorio").click()');
  await hasta(async () => !(await rectDeId(aQuitar.id)), 'elemento quitado');
  verificar(/Se quitó/.test(await textoDe('#aviso')) && await js('!!document.querySelector("#aviso .aviso-accion.interactivo")'), 'quitar muestra el aviso con "Deshacer": ' + await textoDe('#aviso'));
  await js('document.querySelector("#aviso .aviso-accion").click()');
  await hasta(async () => !!(await rectDeId(aQuitar.id)), 'elemento de regreso');
  await esperar(250);
  verificar(JSON.stringify(await elementos()) === JSON.stringify(antesQuitar), 'Deshacer regresa ' + aQuitar.tipo + ' "' + (aQuitar.nombre || '') + '" igual que antes');
  verificar(datosEnDisco().elementos.some((e) => e.id === aQuitar.id), 'Deshacer también queda guardado en escritorio.json');

  verificar(erroresRenderer.length === 0, 'sin errores de consola en el renderer' + (erroresRenderer.length ? ': ' + erroresRenderer.join(' | ') : ''));

  // -------- regla dura: los archivos no se tocaron
  for (const [k, ruta] of Object.entries(archivos)) {
    verificar(fs.existsSync(ruta) && fs.readFileSync(ruta, 'utf8') === contenidos[k], `el archivo ${path.basename(ruta)} sigue igual`);
  }
  verificar(fs.readdirSync(dirArchivos).length === Object.keys(archivos).length, 'no se crearon ni borraron archivos del usuario');

  // -------- persistencia
  await esperar(250);
  const enDisco = datosEnDisco();
  const enMemoria = await elementos();
  // En disco cada elemento lleva además el monitor donde vive (aquí, el principal).
  verificar(enDisco.elementos.every((e) => e.pantalla === m.estado.principal), `cada elemento guardado lleva su monitor (${m.estado.principal})`);
  const sinPantalla = enDisco.elementos.map((e) => { const c = { ...e }; delete c.pantalla; return c; });
  verificar(JSON.stringify(sinPantalla) === JSON.stringify(enMemoria), 'escritorio.json en disco coincide con lo que se ve');
  verificar(!fs.existsSync(m.estado.archivo + '.tmp'), 'no quedó archivo .tmp');
  await capturar('smoke-final.png');

  console.log('SMOKE OK');
}

// Un punto vacío del lienzo lejos de todo (para "clic fuera").
function window_x(wa) { return Math.round(wa.width * 0.75); }
function window_y(wa) { return Math.round(wa.height * 0.8); }

const tope = setTimeout(() => { console.error('SMOKE FALLÓ: tiempo total agotado'); limpiar(); app.exit(3); }, 120000);

principal().then(() => { clearTimeout(tope); limpiar(); app.exit(0); }).catch((e) => {
  console.error('SMOKE FALLÓ:', e && e.stack ? e.stack : e);
  clearTimeout(tope); limpiar(); app.exit(1);
});
