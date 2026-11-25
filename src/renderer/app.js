'use strict';
// Lienzo del escritorio: cuadrícula de accesos, carpetas tipo Android, menú contextual y widgets.
// Todo el texto del usuario se pone con textContent (nunca innerHTML). La lógica pura vive en
// cuadricula.js y carpetas.js; aquí solo hay DOM y eventos.
(function () {
  const api = window.escritorio;
  const Cuad = window.Cuadricula;
  const Carp = window.Carpetas;
  const Widgets = window.EscritorioWidgets;
  const Hist = window.Historial;
  const Busc = window.Buscar;
  const CELDA = Cuad.CELDA;
  const UMBRAL = 6;          // px que hay que mover para que un clic se vuelva arrastre
  const RADIO_SOLTAR = 42;   // px del centro de un elemento para contar como "soltar sobre él"

  const lienzo = document.getElementById('lienzo');
  const botonMas = document.getElementById('boton-mas');
  const velo = document.getElementById('velo');
  const ventanita = document.getElementById('ventanita');
  const cortina = document.getElementById('cortina');
  const menu = document.getElementById('menu');
  const aviso = document.getElementById('aviso');

  const estado = {
    datos: null, cols: 1, filas: 1,
    info: new Map(),        // ruta en minúsculas -> { existe, esCarpeta, icono }
    abierta: null,          // id de la carpeta cuya ventanita está abierta
    arrastre: null,
    montados: new Map(),    // id de widget -> { mod, nodo }
    editando: false,
    temporizadorAviso: null,
    clave: '',              // monitor de este lienzo (hay un lienzo por monitor)
    otras: [],              // los otros monitores: [{ clave, nombre }]
    redim: null,            // cambio de tamaño de un widget en curso
    vista: { appOculta: false, modo: 'ambos' }, // qué se ve: los de la app, los de Windows o los dos
    historial: Hist.crear(), // deshacer / rehacer (Ctrl+Z / Ctrl+Y)
    buscador: null,          // { telon, caja, campo, lista, todos, resultados, sel } mientras está abierto
  };

  // ------------------------------------------------------------ utilidades DOM

  function h(etiqueta, clase, texto) {
    const e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  const nuevoId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clave = (ruta) => String(ruta).toLowerCase();
  const infoDe = (ruta) => estado.info.get(clave(ruta)) || null;

  function mostrarAviso(texto, ms = 3200) {
    aviso.textContent = texto;
    aviso.hidden = false;
    clearTimeout(estado.temporizadorAviso);
    estado.temporizadorAviso = setTimeout(() => { aviso.hidden = true; aviso.textContent = ''; }, ms);
  }

  // Aviso con un botón (p. ej. "Deshacer"); el botón recibe el ratón aunque el aviso no.
  function avisoConAccion(texto, etiqueta, accion, ms = 8000) {
    mostrarAviso(texto, ms);
    const b = h('button', 'aviso-accion interactivo', etiqueta);
    b.type = 'button';
    b.addEventListener('click', () => { aviso.hidden = true; aviso.textContent = ''; accion(); });
    aviso.append(' ', b);
  }

  async function persistir() {
    try { await api.guardar(estado.datos); } catch (e) { mostrarAviso('No se pudo guardar el escritorio: ' + (e && e.message ? e.message : e)); }
  }

  // ------------------------------------------------------------ clic a través

  let ignorando = true;
  function fijarIgnorar(v) {
    if (v === ignorando) return;
    ignorando = v;
    api.ignorarRaton(v);
  }
  // El ratón solo se captura sobre lo que tiene la clase "interactivo" (elementos, botón +, ventanita, menú).
  document.addEventListener('mousemove', (e) => {
    if ((estado.arrastre && estado.arrastre.activo) || estado.redim) { fijarIgnorar(false); return; }
    const t = e.target;
    fijarIgnorar(!(t && t.closest && t.closest('.interactivo')));
  }, true);
  document.documentElement.addEventListener('mouseleave', () => {
    if (!(estado.arrastre && estado.arrastre.activo) && !estado.redim) fijarIgnorar(true);
  });

  // Zonas interactivas para el proceso principal (ver src/main/zonas.js). Se recalculan como
  // mucho cada 100 ms cuando cambia el DOM o el tamaño de la ventana.
  let zonasPendiente = false;
  let zonasUltimo = '';
  function calcularZonas() {
    const zonas = [];
    for (const el of document.querySelectorAll('.interactivo')) {
      if (el.closest('[hidden]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) zonas.push([Math.floor(r.left), Math.floor(r.top), Math.ceil(r.width), Math.ceil(r.height)]);
    }
    return zonas;
  }
  function reportarZonas() {
    if (zonasPendiente) return;
    zonasPendiente = true;
    setTimeout(() => requestAnimationFrame(() => {
      zonasPendiente = false;
      const capturando = !!((estado.arrastre && estado.arrastre.activo) || estado.editando || estado.redim);
      const zonas = calcularZonas();
      const clave = JSON.stringify(zonas) + capturando;
      if (clave === zonasUltimo) return;
      zonasUltimo = clave;
      api.reportarZonas(zonas, capturando);
    }), 100);
  }
  new MutationObserver(reportarZonas).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  window.addEventListener('resize', reportarZonas);

  // ------------------------------------------------------------ cuadrícula y datos

  function calcularDimensiones() {
    const d = Cuad.dimensiones(window.innerWidth, window.innerHeight);
    estado.cols = d.cols; estado.filas = d.filas;
  }

  const posicionesIguales = (a, b) => a.length === b.length && a.every((e, i) => e.col === b[i].col && e.fila === b[i].fila);

  function acomodarTodo() {
    const nuevo = Cuad.acomodar(estado.datos.elementos, estado.cols, estado.filas);
    if (!posicionesIguales(nuevo, estado.datos.elementos)) {
      estado.datos = { ...estado.datos, elementos: nuevo };
      return true;
    }
    return false;
  }

  function rutasDe(elementos) {
    const r = [];
    for (const e of elementos) {
      if (e.tipo === 'acceso') r.push(e.ruta);
      else if (e.tipo === 'carpeta') for (const hj of e.hijos) r.push(hj.ruta);
    }
    return r;
  }

  // Pide al proceso principal si existen las rutas y sus iconos (solo las que aún no se conocen,
  // o todas con forzar). Devuelve true si algo cambió.
  async function cargarInfo(rutas, forzar = false) {
    const pedir = [...new Set(rutas)].filter((r) => forzar || !estado.info.has(clave(r)));
    if (!pedir.length) return false;
    let cambio = false;
    try {
      const res = await api.infoRutas(pedir);
      for (const r of res) {
        const antes = estado.info.get(clave(r.ruta));
        if (!antes || antes.existe !== r.existe || antes.icono !== r.icono) cambio = true;
        estado.info.set(clave(r.ruta), { existe: r.existe, esCarpeta: r.esCarpeta, icono: r.icono });
      }
    } catch (_) { /* sin info: los iconos salen genéricos */ }
    return cambio;
  }

  // que: texto para "Deshacer …" (null = no se puede deshacer, p. ej. pasar a otro monitor).
  async function cambiar(resultado, que = 'el último cambio') {
    if (!resultado || resultado.ok === false) return false;
    if (que !== null) estado.historial.registrar(estado.datos.elementos, que);
    estado.datos = { ...estado.datos, elementos: resultado.elementos };
    render();
    refrescarVentanita();
    persistir();
    return true;
  }

  // ------------------------------------------------------------ dibujo

  // Los widgets llevan un margen de MARGEN_WIDGET px por lado dentro de sus celdas para
  // no tocarse entre sí ni con el borde de la pantalla (como en Android).
  const MARGEN_WIDGET = 6;

  function ponerPos(nodo, el) {
    const m = el.tipo === 'widget' ? MARGEN_WIDGET : 0;
    nodo.style.left = (el.col * CELDA + m) + 'px';
    nodo.style.top = (el.fila * CELDA + m) + 'px';
  }

  function iconoDe(ruta, nombre) {
    const inf = infoDe(ruta);
    if (inf && inf.icono) {
      const img = h('img', 'icono');
      img.src = inf.icono;
      img.alt = '';
      img.draggable = false;
      return img;
    }
    return h('div', 'icono-vacio', (nombre || '?').trim().charAt(0).toUpperCase() || '?');
  }

  function crearAcceso(el, extra = '') {
    const nodo = h('div', 'item acceso interactivo arrastrable ' + extra);
    nodo.dataset.id = el.id;
    const inf = infoDe(el.ruta);
    if (inf && !inf.existe) nodo.classList.add('inexistente');
    nodo.title = inf && !inf.existe ? 'No se encontró: ' + el.ruta : el.ruta;
    nodo.append(iconoDe(el.ruta, el.nombre), h('div', 'nombre', el.nombre));
    return nodo;
  }

  function crearCarpeta(el) {
    const nodo = h('div', 'item carpeta interactivo arrastrable');
    nodo.dataset.id = el.id;
    nodo.title = el.nombre;
    const icono = h('div', 'carpeta-icono');
    if (el.color) icono.dataset.color = el.color;
    for (const hj of Carp.miniaturas(el)) {
      const inf = infoDe(hj.ruta);
      if (inf && inf.icono) {
        const img = h('img', 'mini');
        img.src = inf.icono; img.alt = ''; img.draggable = false;
        icono.append(img);
      } else icono.append(h('div', 'mini mini-vacio'));
    }
    nodo.append(icono, h('div', 'nombre', el.nombre));
    return nodo;
  }

  function montarWidget(el) {
    const nodo = h('div', 'item widget interactivo arrastrable widget-' + String(el.widget).replace(/[^a-z0-9_-]/gi, ''));
    nodo.dataset.id = el.id;
    const cuerpo = h('div', 'widget-cuerpo');
    const asa = h('div', 'asa-tamano');
    asa.title = 'Arrastra para cambiar el tamaño';
    nodo.append(cuerpo, asa);
    const mod = Widgets.buscar(el.widget);
    if (!mod) {
      cuerpo.append(h('div', 'widget-vacio', 'Widget no disponible: ' + el.widget));
      return { mod: null, inst: null, nodo, cuerpo };
    }
    const apiWidget = {
      ancho: el.ancho, alto: el.alto,
      guardarOpciones(op) {
        const w = estado.datos.elementos.find((x) => x.id === el.id);
        if (!w || op === null || typeof op !== 'object') return;
        w.opciones = op;
        persistir();
      },
      avisar: mostrarAviso,
      vistaPrevia: false,
    };
    // Una instancia por widget colocado: el estado (temporizadores, nodos) vive en `this`.
    const inst = Object.create(mod);
    try { inst.montar(cuerpo, el.opciones || {}, apiWidget); } catch (e) {
      cuerpo.textContent = '';
      cuerpo.append(h('div', 'widget-vacio', 'Error en el widget: ' + (e && e.message ? e.message : e)));
    }
    return { mod, inst, nodo, cuerpo };
  }

  // Tamaño del widget en pantalla. El contenido se escala (CSS zoom) según cuánto creció respecto
  // a su tamaño de fábrica: un reloj de 4x4 se ve el doble de grande que uno de 2x2; si solo se
  // ensancha, el contenido gana espacio sin agrandar la letra.
  function ajustarTamano(m, ancho, alto) {
    const W = ancho * CELDA - 2 * MARGEN_WIDGET;
    const H = alto * CELDA - 2 * MARGEN_WIDGET;
    m.nodo.style.width = W + 'px';
    m.nodo.style.height = H + 'px';
    const baseA = (m.mod && m.mod.ancho) || ancho;
    const baseL = (m.mod && m.mod.alto) || alto;
    const z = Math.min(4, Math.max(0.4, Math.min(ancho / baseA, alto / baseL)));
    m.cuerpo.style.zoom = String(z);
    m.cuerpo.style.width = ((W - 2) / z) + 'px';   // 2 = el borde de 1 px del widget
    m.cuerpo.style.height = ((H - 2) / z) + 'px';
  }

  function render() {
    // Accesos y carpetas se redibujan; los widgets montados se conservan entre dibujos.
    for (const hijo of [...lienzo.children]) if (!hijo.classList.contains('widget')) hijo.remove();
    const vivos = new Set();
    for (const el of estado.datos.elementos) {
      if (el.tipo === 'widget') {
        // Con la app oculta los widgets se desmontan (dejan de pedir datos) y se montan al volver.
        if (estado.vista.appOculta) continue;
        vivos.add(el.id);
        let m = estado.montados.get(el.id);
        if (!m) { m = montarWidget(el); estado.montados.set(el.id, m); lienzo.append(m.nodo); }
        ajustarTamano(m, el.ancho, el.alto);
        ponerPos(m.nodo, el);
      } else {
        const nodo = el.tipo === 'carpeta' ? crearCarpeta(el) : crearAcceso(el);
        ponerPos(nodo, el);
        lienzo.append(nodo);
      }
    }
    for (const [id, m] of [...estado.montados]) {
      if (vivos.has(id)) continue;
      try { if (m.inst) m.inst.desmontar(); } catch (_) { /* un widget roto no debe tumbar el lienzo */ }
      m.nodo.remove();
      estado.montados.delete(id);
    }
  }

  // ------------------------------------------------------------ ventanita de carpeta

  function posicionarVentanita(carpeta) {
    const ancho = 408;
    const alto = ventanita.offsetHeight || 220;
    let x = carpeta.col * CELDA + CELDA / 2 - ancho / 2;
    let y = (carpeta.fila + 1) * CELDA + 6;
    if (y + alto > window.innerHeight - 10) y = carpeta.fila * CELDA - alto - 6;
    x = Math.min(Math.max(10, x), window.innerWidth - ancho - 10);
    y = Math.min(Math.max(10, y), Math.max(10, window.innerHeight - alto - 10));
    ventanita.style.left = Math.round(x) + 'px';
    ventanita.style.top = Math.round(y) + 'px';
  }

  function dibujarVentanita() {
    const r = Carp.buscar(estado.datos.elementos, estado.abierta);
    if (!r || r.elemento.tipo !== 'carpeta') { cerrarVentanita(); return; }
    const carpeta = r.elemento;
    ventanita.textContent = '';
    if (carpeta.color) ventanita.dataset.color = carpeta.color; else delete ventanita.dataset.color;
    const cab = h('div', 'vent-cabecera');
    const nombre = h('input', 'vent-nombre');
    nombre.type = 'text'; nombre.maxLength = Carp.MAX_NOMBRE; nombre.value = carpeta.nombre;
    nombre.setAttribute('aria-label', 'Nombre de la carpeta');
    nombre.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') nombre.blur();
      if (e.key === 'Escape') { nombre.value = carpeta.nombre; cerrarVentanita(); }
    });
    nombre.addEventListener('change', () => {
      cambiar(Carp.renombrar(estado.datos.elementos, carpeta.id, nombre.value), 'renombrar la carpeta');
    });
    const mas = h('button', 'vent-mas', '+');
    mas.type = 'button'; mas.title = 'Agregar acceso a la carpeta'; mas.setAttribute('aria-label', 'Agregar acceso a la carpeta');
    mas.addEventListener('click', () => agregarDesdeDialogo('archivos', { carpetaId: carpeta.id }));
    cab.append(nombre, mas);
    const grid = h('div', 'vent-grid');
    for (const hj of carpeta.hijos) {
      const nodo = crearAcceso(hj, 'hijo');
      grid.append(nodo);
    }
    ventanita.append(cab, grid);
  }

  function abrirVentanita(id) {
    estado.abierta = id;
    velo.hidden = false; ventanita.hidden = false;
    velo.classList.remove('oculta'); ventanita.classList.remove('oculta');
    dibujarVentanita();
    const r = Carp.buscar(estado.datos.elementos, id);
    if (r) posicionarVentanita(r.elemento);
    fijarIgnorar(false);
  }

  function refrescarVentanita() {
    if (estado.abierta) dibujarVentanita();
  }

  function cerrarVentanita() {
    estado.abierta = null;
    delete ventanita.dataset.color;
    velo.hidden = true; ventanita.hidden = true;
    velo.classList.remove('oculta'); ventanita.classList.remove('oculta');
    ventanita.textContent = '';
  }

  // Clic fuera de la ventanita (sobre el velo) la cierra.
  velo.addEventListener('pointerdown', (e) => { if (e.button === 0) cerrarVentanita(); });

  // ------------------------------------------------------------ abrir accesos

  async function abrirAcceso(el) {
    const inf = infoDe(el.ruta);
    if (inf && !inf.existe) { mostrarAviso('No se encontró: ' + el.ruta); return; }
    try {
      const r = await api.abrir(el.ruta);
      if (!r || !r.ok) mostrarAviso('No se pudo abrir ' + el.nombre + (r && r.error ? ': ' + r.error : ''));
    } catch (e) { mostrarAviso('No se pudo abrir ' + el.nombre); }
  }

  function alHacerClic(id) {
    const r = Carp.buscar(estado.datos.elementos, id);
    if (!r) return;
    if (r.elemento.tipo === 'carpeta') abrirVentanita(id);
    else if (r.elemento.tipo === 'acceso') {
      if (r.carpeta) cerrarVentanita();
      abrirAcceso(r.elemento);
    }
  }

  // ------------------------------------------------------------ arrastrar y soltar (ratón)

  function esControlInterno(t) {
    return !!(t && t.closest && t.closest('input, textarea, select, button, a, [contenteditable="true"]'));
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || estado.arrastre || estado.editando || estado.redim) return;
    const asa = e.target.closest && e.target.closest('.asa-tamano');
    if (asa) { e.preventDefault(); e.stopPropagation(); iniciarRedim(asa.closest('.widget[data-id]'), e); return; }
    const nodo = e.target.closest && e.target.closest('.arrastrable[data-id]');
    if (!nodo || esControlInterno(e.target)) return;
    const id = nodo.dataset.id;
    const r = Carp.buscar(estado.datos.elementos, id);
    if (!r) return;
    const rect = nodo.getBoundingClientRect();
    estado.arrastre = {
      id, nodo, activo: false, x0: e.clientX, y0: e.clientY,
      offX: e.clientX - rect.left, offY: e.clientY - rect.top, ancho: rect.width, alto: rect.height,
      desdeCarpeta: r.carpeta ? r.carpeta.id : null, tipo: r.elemento.tipo,
      fantasma: null, sombra: null, objetivo: null, rectVentanita: null,
    };
  }, true);

  function iniciarArrastre(a) {
    a.activo = true;
    a.fantasma = a.nodo.cloneNode(true);
    a.fantasma.classList.add('fantasma');
    a.fantasma.classList.remove('arrastrando', 'objetivo');
    a.fantasma.style.width = a.ancho + 'px';
    a.fantasma.style.height = a.alto + 'px';
    a.fantasma.style.left = '0px'; a.fantasma.style.top = '0px';
    document.body.append(a.fantasma);
    a.sombra = h('div', 'sombra');
    a.sombra.hidden = true;
    lienzo.append(a.sombra);
    a.nodo.classList.add('arrastrando');
    if (a.desdeCarpeta) {
      // Dentro de la ventanita se reordena; al salir de ella se esconde para soltar en el escritorio.
      a.rectVentanita = ventanita.getBoundingClientRect();
      a.indice = null;
    }
    fijarIgnorar(false);
  }

  // Elemento de la cuadrícula (acceso o carpeta) sobre el que se va a soltar, si el puntero está cerca de su centro.
  function objetivoBajo(a, x, y) {
    const bajo = document.elementFromPoint(x, y);
    const nodo = bajo && bajo.closest ? bajo.closest('#lienzo > .item[data-id]') : null;
    if (!nodo || nodo.dataset.id === a.id || nodo.classList.contains('widget')) return null;
    if (a.tipo !== 'acceso') return null; // solo los accesos se sueltan sobre otros
    const r = nodo.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2); const dy = y - (r.top + r.height / 2);
    return Math.hypot(dx, dy) <= RADIO_SOLTAR ? nodo : null;
  }

  function celdaDestino(a, x, y) {
    const col = Math.round((x - a.offX) / CELDA);
    const fila = Math.round((y - a.offY) / CELDA);
    const esWidget = a.tipo === 'widget';
    const el = esWidget ? Carp.buscar(estado.datos.elementos, a.id).elemento : null;
    const ancho = esWidget ? el.ancho : 1; const alto = esWidget ? el.alto : 1;
    const lim = Cuad.limitar(col, fila, ancho, alto, estado.cols, estado.filas);
    const resto = estado.datos.elementos.filter((e) => e.id !== a.id);
    const sitio = Cuad.celdaLibreMasCercana(resto, lim.col, lim.fila, estado.cols, estado.filas, null, ancho, alto);
    return { sitio, col: lim.col, fila: lim.fila, ancho, alto };
  }

  window.addEventListener('pointermove', (e) => {
    const a = estado.arrastre;
    if (!a) return;
    if (!a.activo) {
      if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < UMBRAL) return;
      iniciarArrastre(a);
    }
    a.fantasma.style.left = (e.clientX - a.offX) + 'px';
    a.fantasma.style.top = (e.clientY - a.offY) + 'px';
    if (a.desdeCarpeta) {
      if (dentroDe(a.rectVentanita, e)) {
        ventanita.classList.remove('oculta'); velo.classList.remove('oculta');
        if (a.objetivo) a.objetivo.classList.remove('objetivo');
        a.objetivo = null; a.sombra.hidden = true;
        marcarOrden(a, indiceEnVentanita(e));
        return;
      }
      marcarOrden(a, null);
      ventanita.classList.add('oculta'); velo.classList.add('oculta');
    }
    if (fueraDeLaVentana(e)) {
      // Rumbo a otro monitor: sin sombra aquí; al soltar se pasa allá (ver terminarArrastre).
      if (a.objetivo) a.objetivo.classList.remove('objetivo');
      a.objetivo = null; a.sombra.hidden = true;
      return;
    }
    const objetivo = objetivoBajo(a, e.clientX, e.clientY);
    if (a.objetivo && a.objetivo !== objetivo) a.objetivo.classList.remove('objetivo');
    a.objetivo = objetivo;
    if (objetivo) { objetivo.classList.add('objetivo'); a.sombra.hidden = true; return; }
    const d = celdaDestino(a, e.clientX, e.clientY);
    if (d.sitio) {
      a.sombra.hidden = false;
      a.sombra.style.left = (d.sitio.col * CELDA) + 'px'; a.sombra.style.top = (d.sitio.fila * CELDA) + 'px';
      a.sombra.style.width = (d.ancho * CELDA) + 'px'; a.sombra.style.height = (d.alto * CELDA) + 'px';
    } else a.sombra.hidden = true;
  });

  const dentroDe = (r, e) => !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;

  // Posición (0 = primero) dentro de la cuadrícula de la ventanita bajo el puntero.
  function indiceEnVentanita(e) {
    const grid = ventanita.querySelector('.vent-grid');
    const n = grid ? grid.children.length : 0;
    if (!n) return null;
    const r = grid.getBoundingClientRect();
    if (e.clientY < r.top) return null; // sobre el nombre de la carpeta: no se reordena
    const col = Math.min(3, Math.max(0, Math.floor((e.clientX - r.left) / CELDA)));
    const fila = Math.max(0, Math.floor((e.clientY - r.top) / CELDA));
    return Math.min(n - 1, fila * 4 + col);
  }

  function marcarOrden(a, indice) {
    a.indice = indice;
    const grid = ventanita.querySelector('.vent-grid');
    if (!grid) return;
    [...grid.children].forEach((n, i) => n.classList.toggle('orden-objetivo', indice !== null && i === indice && n.dataset.id !== a.id));
  }

  function limpiarArrastre(a) {
    if (a.desdeCarpeta) marcarOrden(a, null);
    if (a.fantasma) a.fantasma.remove();
    if (a.sombra) a.sombra.remove();
    if (a.objetivo) a.objetivo.classList.remove('objetivo');
    a.nodo.classList.remove('arrastrando');
    estado.arrastre = null;
  }

  async function terminarArrastre(e, cancelado) {
    const a = estado.arrastre;
    if (!a) return;
    if (!a.activo) { limpiarArrastre(a); if (!cancelado) alHacerClic(a.id); return; }
    const objetivo = a.objetivo ? a.objetivo.dataset.id : null;
    const dentroDeVentanita = dentroDe(a.rectVentanita, e);
    const indice = a.indice;
    const d = cancelado ? null : celdaDestino(a, e.clientX, e.clientY);
    limpiarArrastre(a);
    if (a.desdeCarpeta) {
      if (cancelado || (dentroDeVentanita && !objetivo)) {
        ventanita.classList.remove('oculta'); velo.classList.remove('oculta');
        if (!cancelado && indice !== null && indice !== undefined) {
          await cambiar(Carp.reordenar(estado.datos.elementos, a.desdeCarpeta, a.id, indice), 'ordenar la carpeta');
        }
        return;
      }
      cerrarVentanita();
      if (objetivo) await cambiar(Carp.soltarSobre(estado.datos.elementos, a.id, objetivo, nuevoId), 'pasar a otra carpeta');
      else if (d) await cambiar(Carp.sacarDeCarpeta(estado.datos.elementos, a.id, d.col, d.fila, estado.cols, estado.filas), 'sacar de la carpeta');
      return;
    }
    if (cancelado) return;
    if (estado.otras.length && fueraDeLaVentana(e)) { await pasarAPantalla(a.id, null, a.offX, a.offY); return; }
    if (objetivo) await cambiar(Carp.soltarSobre(estado.datos.elementos, a.id, objetivo, nuevoId), 'juntar en carpeta');
    else await cambiar(Carp.mover(estado.datos.elementos, a.id, d.col, d.fila, estado.cols, estado.filas), 'mover');
  }

  const fueraDeLaVentana = (e) => e.clientX < 0 || e.clientY < 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;

  // ------------------------------------------------------------ varios monitores

  // Pasa un elemento de este monitor a otro (destino = clave, o null = el monitor donde quedó el
  // ratón). El otro lienzo lo acomoda primero; solo si hubo lugar se quita de aquí.
  async function pasarAPantalla(id, destino, offX = 0, offY = 0) {
    let r = null;
    try { r = await api.moverAPantalla(id, destino, offX, offY); } catch (_) { r = null; }
    if (!r || !r.ok) {
      if (!r || r.error !== 'misma') mostrarAviso(r && r.error ? r.error : 'No se pudo pasar a la otra pantalla');
      return false;
    }
    const lista = estado.datos.elementos.filter((x) => x.id !== id);
    // Lo de antes ya no cuadra con el otro monitor: no se puede deshacer más atrás de esto.
    estado.historial.limpiar();
    await cambiar({ ok: true, elementos: lista }, null);
    mostrarAviso('Se pasó a ' + r.nombre);
    return true;
  }

  // Llega un elemento desde otro monitor: punto = dónde se soltó (en px de esta ventana) o null.
  async function recibirElemento(d) {
    if (!d || !d.elemento || !estado.datos) return false;
    const nuevo = { ...d.elemento };
    delete nuevo.pantalla;
    const t = Cuad.tamano(nuevo);
    const resto = estado.datos.elementos.filter((x) => x.id !== nuevo.id);
    let sitio;
    if (d.punto && Number.isFinite(d.punto.x) && Number.isFinite(d.punto.y)) {
      const lim = Cuad.limitar(Math.round(d.punto.x / CELDA), Math.round(d.punto.y / CELDA), t.ancho, t.alto, estado.cols, estado.filas);
      sitio = Cuad.celdaLibreMasCercana(resto, lim.col, lim.fila, estado.cols, estado.filas, null, t.ancho, t.alto);
    } else {
      sitio = Cuad.primeraZonaLibre(resto, t.ancho, t.alto, estado.cols, estado.filas);
    }
    if (!sitio) return false;
    nuevo.col = sitio.col; nuevo.fila = sitio.fila;
    await cargarInfo(rutasDe([nuevo]));
    estado.historial.limpiar();
    await cambiar({ ok: true, elementos: [...resto, nuevo] }, null);
    return true;
  }
  api.alRecibirElemento(recibirElemento);

  // Quitar (acceso, carpeta con todo lo que tiene, o widget) se puede deshacer unos segundos.
  async function quitarConDeshacer(id) {
    const antes = estado.datos.elementos;
    const r = Carp.buscar(antes, id);
    if (!r) return;
    const el = r.elemento;
    const que = el.tipo === 'widget' ? 'el widget' : el.tipo === 'carpeta' ? 'la carpeta "' + el.nombre + '"' : '"' + el.nombre + '"';
    if (!(await cambiar(Carp.quitar(antes, id), 'quitar ' + que))) return;
    const despues = estado.datos.elementos;
    avisoConAccion('Se quitó ' + que + ' (tus archivos no se tocan).', 'Deshacer', async () => {
      if (estado.datos.elementos !== despues) { mostrarAviso('Ya no se puede deshacer: cambió algo más'); return; }
      await deshacer();
    });
  }

  function opcionesPantallas(id) {
    if (!estado.otras.length) return [];
    return ['-', ...estado.otras.map((o) => ({ texto: 'Pasar a ' + o.nombre, accion: () => pasarAPantalla(id, o.clave) }))];
  }

  // ------------------------------------------------------------ cambiar el tamaño de un widget

  function iniciarRedim(nodo, e) {
    if (!nodo) return;
    const r = Carp.buscar(estado.datos.elementos, nodo.dataset.id);
    const m = estado.montados.get(nodo.dataset.id);
    if (!r || r.elemento.tipo !== 'widget' || !m) return;
    const el = r.elemento;
    const sombra = h('div', 'sombra');
    sombra.style.left = (el.col * CELDA) + 'px'; sombra.style.top = (el.fila * CELDA) + 'px';
    lienzo.append(sombra);
    nodo.classList.add('redimensionando');
    estado.redim = { id: el.id, m, nodo, sombra, x0: e.clientX, y0: e.clientY, ancho0: el.ancho, alto0: el.alto, ancho: el.ancho, alto: el.alto, ok: true };
    pintarRedim();
    fijarIgnorar(false);
    reportarZonas();
  }

  function pintarRedim() {
    const z = estado.redim;
    const prueba = Carp.redimensionar(estado.datos.elementos, z.id, z.ancho, z.alto, estado.cols, estado.filas);
    z.ok = prueba.ok || (z.ancho === z.ancho0 && z.alto === z.alto0);
    z.sombra.style.width = (z.ancho * CELDA) + 'px'; z.sombra.style.height = (z.alto * CELDA) + 'px';
    z.sombra.classList.toggle('invalida', !z.ok);
    ajustarTamano(z.m, z.ancho, z.alto);
  }

  window.addEventListener('pointermove', (e) => {
    const z = estado.redim;
    if (!z) return;
    const r = Carp.buscar(estado.datos.elementos, z.id);
    if (!r) return;
    const max = Carp.MAX_TAMANO;
    const ancho = Math.min(max, estado.cols - r.elemento.col, Math.max(1, z.ancho0 + Math.round((e.clientX - z.x0) / CELDA)));
    const alto = Math.min(max, estado.filas - r.elemento.fila, Math.max(1, z.alto0 + Math.round((e.clientY - z.y0) / CELDA)));
    if (ancho === z.ancho && alto === z.alto) return;
    z.ancho = ancho; z.alto = alto;
    pintarRedim();
  });

  async function terminarRedim(cancelado) {
    const z = estado.redim;
    if (!z) return;
    estado.redim = null;
    z.sombra.remove();
    z.nodo.classList.remove('redimensionando');
    reportarZonas();
    if (!cancelado && z.ok && (z.ancho !== z.ancho0 || z.alto !== z.alto0)) {
      if (await cambiar(Carp.redimensionar(estado.datos.elementos, z.id, z.ancho, z.alto, estado.cols, estado.filas), 'cambiar el tamaño')) return;
    } else if (!cancelado && !z.ok) mostrarAviso('No cabe de ese tamaño: hay algo en medio');
    ajustarTamano(z.m, z.ancho0, z.alto0);
  }

  window.addEventListener('pointerup', (e) => { if (e.button === 0 && estado.redim) terminarRedim(false); });
  window.addEventListener('pointercancel', () => terminarRedim(true));

  window.addEventListener('pointerup', (e) => { if (e.button === 0) terminarArrastre(e, false); });
  window.addEventListener('pointercancel', (e) => terminarArrastre(e, true));
  window.addEventListener('blur', () => {
    if (estado.redim) terminarRedim(true);
    if (estado.arrastre) terminarArrastre({ clientX: 0, clientY: 0 }, true);
    cerrarMenu();
  });

  // ------------------------------------------------------------ agregar accesos

  // `nuevos`: [{ruta, nombre}] ya resueltos por el proceso principal (existen).
  async function agregarRutas(nuevos, { destinoId = null, carpetaId = null } = {}) {
    await asegurarAppVisible();
    if (!Array.isArray(nuevos) || !nuevos.length) return false;
    await cargarInfo(nuevos.map((n) => n.ruta));
    let elementos = estado.datos.elementos;
    let carpeta = carpetaId;
    let primero = true;
    let algo = false;
    for (const n of nuevos) {
      if (carpeta) {
        const r = Carp.agregarAHijos(elementos, carpeta, n, nuevoId);
        if (r.ok) { elementos = r.elementos; algo = true; }
        continue;
      }
      const r = Carp.agregarAcceso(elementos, n, primero ? destinoId : null, estado.cols, estado.filas, nuevoId);
      if (!r.ok) { mostrarAviso('No hay lugar libre en el escritorio'); break; }
      elementos = r.elementos; algo = true;
      if (primero && destinoId) {
        // Si cayó sobre un acceso se creó una carpeta: el resto de los archivos entran en ella.
        const hallado = Carp.buscar(elementos, r.id);
        if (hallado && hallado.carpeta) carpeta = hallado.carpeta.id;
        else if (Carp.buscar(elementos, destinoId) && Carp.buscar(elementos, destinoId).elemento.tipo === 'carpeta') carpeta = destinoId;
      }
      primero = false;
    }
    if (!algo) return false;
    await cambiar({ elementos, ok: true }, nuevos.length === 1 ? 'agregar "' + (nuevos[0].nombre || 'acceso') + '"' : 'agregar ' + nuevos.length + ' accesos');
    return true;
  }

  async function agregarDesdeDialogo(tipo, opciones = {}) {
    let lista = [];
    try { lista = await api.elegir(tipo); } catch (_) { mostrarAviso('No se pudo abrir el selector'); return; }
    if (lista.length) await agregarRutas(lista, opciones);
  }

  // Archivos soltados desde el Explorador. Ojo: con el clic a través, la ventana solo recibe el
  // soltar si el ratón ya estaba sobre un elemento o sobre el botón "+" (ver NOTAS-TECNICAS.md).
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    const rutas = api.rutasDeArchivos(e.dataTransfer && e.dataTransfer.files);
    if (!rutas.length) return;
    let resueltas = [];
    try { resueltas = await api.resolverRutas(rutas); } catch (_) { resueltas = []; }
    if (!resueltas.length) { mostrarAviso('No se encontraron los archivos soltados'); return; }
    const t = e.target;
    const opciones = {};
    if (t && t.closest) {
      const dentroVentanita = t.closest('#ventanita');
      const nodo = t.closest('.item[data-id]');
      if (dentroVentanita && estado.abierta) opciones.carpetaId = estado.abierta;
      else if (nodo && !nodo.classList.contains('widget')) opciones.destinoId = nodo.dataset.id;
    }
    await agregarRutas(resueltas, opciones);
  });

  api.alRecibirRutas((lista) => { if (Array.isArray(lista)) agregarRutas(lista, estado.abierta ? { carpetaId: estado.abierta } : {}); });

  // Al tocar un campo de texto el lienzo pide el teclado (si no, Windows lo deja en otra ventana).
  document.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.closest && e.target.closest('input, textarea')) pedirTeclado();
  }, true);
  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.matches && e.target.matches('input, textarea') && !document.hasFocus()) pedirTeclado();
  });

  // ------------------------------------------------------------ renombrar en el lugar

  function renombrarEnLugar(id) {
    const r = Carp.buscar(estado.datos.elementos, id);
    if (!r || r.elemento.tipo === 'widget') return;
    const nodo = document.querySelector('.item[data-id="' + CSS.escape(id) + '"]');
    const etiqueta = nodo && nodo.querySelector('.nombre');
    if (!etiqueta) return;
    estado.editando = true;
    const campo = h('input', 'nombre-editar');
    campo.type = 'text'; campo.maxLength = Carp.MAX_NOMBRE; campo.value = r.elemento.nombre;
    etiqueta.replaceWith(campo);
    fijarIgnorar(false);
    pedirTeclado();
    campo.focus(); campo.select();
    let hecho = false;
    const terminar = (guardar) => {
      if (hecho) return; hecho = true;
      estado.editando = false;
      if (guardar) cambiar(Carp.renombrar(estado.datos.elementos, id, campo.value), 'renombrar');
      else { render(); refrescarVentanita(); }
    };
    campo.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') terminar(true);
      else if (e.key === 'Escape') terminar(false);
    });
    campo.addEventListener('blur', () => terminar(true));
  }

  // ------------------------------------------------------------ menú contextual

  function cerrarMenu() {
    menu.hidden = true; cortina.hidden = true; menu.textContent = '';
  }

  function abrirMenuEn(x, y, opciones) {
    menu.textContent = '';
    for (const op of opciones) {
      if (op === '-') { menu.append(h('div', 'menu-sep')); continue; }
      if (op.colores) {
        const fila = h('div', 'menu-colores');
        fila.append(h('span', 'menu-colores-titulo', 'Color'));
        for (const c of op.colores) {
          const b = h('button', 'color-op' + (c === op.actual ? ' marcado' : ''));
          b.type = 'button'; b.dataset.color = c || 'normal';
          b.title = c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Normal';
          b.setAttribute('aria-label', 'Color ' + b.title);
          b.addEventListener('click', () => { cerrarMenu(); op.accion(c); });
          fila.append(b);
        }
        menu.append(fila);
        continue;
      }
      const b = h('button', 'menu-op' + (op.marca ? ' con-marca' : '') + (op.marcado ? ' marcado' : ''), op.texto);
      b.type = 'button';
      b.setAttribute('role', op.marca ? 'menuitemradio' : 'menuitem');
      if (op.marca) b.setAttribute('aria-checked', op.marcado ? 'true' : 'false');
      if (op.desactivado) b.disabled = true;
      b.addEventListener('click', () => { cerrarMenu(); op.accion(); });
      menu.append(b);
    }
    cortina.hidden = false; menu.hidden = false;
    const w = menu.offsetWidth; const hh = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - hh - 4)) + 'px';
    fijarIgnorar(false);
  }

  // Aviso para el paso 3: "Agregar widget…" lanza este evento; si nadie lo atiende, se avisa.
  function pedirAgregarWidget() {
    const evento = new CustomEvent('escritorio:agregar-widget', { cancelable: true, detail: { api: window.__escritorio } });
    const sinAtender = document.dispatchEvent(evento);
    if (sinAtender) mostrarAviso(Widgets.lista.length ? 'El panel de widgets todavía no está disponible' : 'Todavía no hay widgets instalados');
  }

  // Copia (solo las rutas) los iconos del escritorio de Windows a la app; omite los que ya están.
  async function traerIconosDeWindows() {
    let lista = [];
    try { lista = await api.iconosDeWindows(); } catch (_) { mostrarAviso('No se pudieron leer los iconos del escritorio'); return; }
    const ya = new Set();
    for (const e of estado.datos.elementos) {
      if (e.tipo === 'acceso') ya.add(e.ruta.toLowerCase());
      else if (e.tipo === 'carpeta') for (const hh of e.hijos) ya.add(hh.ruta.toLowerCase());
    }
    const nuevos = lista.filter((n) => !ya.has(n.ruta.toLowerCase()));
    if (!nuevos.length) { mostrarAviso('No hay iconos nuevos en el escritorio de Windows'); return; }
    await agregarRutas(nuevos);
    mostrarAviso(nuevos.length + ' accesos agregados. Para no verlos dobles: + → Ver solo los de la app', 6000);
  }

  // ------------------------------------------------------------ deshacer / rehacer

  async function aplicarHistorial(r, verbo, otro, accionOtro) {
    if (!r) { mostrarAviso(verbo === 'Se deshizo' ? 'No hay nada que deshacer' : 'No hay nada que rehacer'); return false; }
    estado.datos = { ...estado.datos, elementos: r.elementos };
    await cargarInfo(rutasDe(r.elementos));
    calcularDimensiones();
    acomodarTodo();
    render();
    refrescarVentanita();
    persistir();
    avisoConAccion(verbo + ': ' + r.texto, otro, accionOtro, 6000);
    return true;
  }
  const deshacer = () => aplicarHistorial(estado.historial.deshacer(estado.datos.elementos), 'Se deshizo', 'Rehacer', () => rehacer());
  const rehacer = () => aplicarHistorial(estado.historial.rehacer(estado.datos.elementos), 'Se rehízo', 'Deshacer', () => deshacer());

  function opcionesHistorial() {
    const d = estado.historial.siguienteDeshacer();
    const r = estado.historial.siguienteRehacer();
    const ops = [];
    if (d) ops.push({ texto: 'Deshacer: ' + d + '   (Ctrl+Z)', accion: deshacer });
    if (r) ops.push({ texto: 'Rehacer: ' + r + '   (Ctrl+Y)', accion: rehacer });
    return ops;
  }

  // ------------------------------------------------------------ buscador (Ctrl+F)

  // El lienzo necesita el teclado para escribir: se pide al proceso principal.
  function pedirTeclado() { try { api.enfocar(); } catch (_) { /* sin foco: se escribe al hacer clic */ } }

  function cerrarBuscador() {
    const b = estado.buscador;
    if (!b) return;
    estado.buscador = null;
    b.telon.remove(); b.caja.remove();
  }

  async function abrirBuscador() {
    if (estado.vista.appOculta) await asegurarAppVisible();
    cerrarMenu();
    if (estado.abierta) cerrarVentanita();
    if (estado.buscador) { estado.buscador.campo.focus(); return; }
    const telon = h('div', 'buscador-telon interactivo');
    const caja = h('div', 'buscar-panel interactivo');
    caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-label', 'Buscar');
    const campo = h('input', 'buscar-campo');
    campo.type = 'text'; campo.maxLength = 80; campo.placeholder = 'Buscar programa o archivo…';
    campo.setAttribute('aria-label', 'Buscar programa o archivo');
    const lista = h('div', 'buscar-lista');
    lista.setAttribute('role', 'listbox');
    const nota = h('div', 'buscador-nota', 'Escribe parte del nombre. Enter abre el primero.');
    caja.append(campo, lista, nota);
    document.body.append(telon, caja);
    const b = { telon, caja, campo, lista, nota, todos: [], resultados: [], sel: 0 };
    estado.buscador = b;
    telon.addEventListener('pointerdown', cerrarBuscador);
    telon.addEventListener('contextmenu', (e) => { e.preventDefault(); cerrarBuscador(); });
    campo.addEventListener('input', () => pintarBusqueda());
    campo.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { cerrarBuscador(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!b.resultados.length) return;
        b.sel = (b.sel + (e.key === 'ArrowDown' ? 1 : -1) + b.resultados.length) % b.resultados.length;
        pintarBusqueda(true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (b.resultados[b.sel]) abrirResultado(b.resultados[b.sel]);
      }
    });
    fijarIgnorar(false);
    pedirTeclado();
    campo.focus();
    try { b.todos = await api.listaParaBuscar(); } catch (_) { b.todos = []; }
    if (estado.buscador !== b) return;
    if (!b.todos.length) nota.textContent = 'Todavía no hay accesos en el escritorio';
    await cargarInfo(b.todos.map((x) => x.ruta));
    if (estado.buscador === b && campo.value) pintarBusqueda();
  }

  function pintarBusqueda(soloSeleccion) {
    const b = estado.buscador;
    if (!b) return;
    if (!soloSeleccion) {
      b.resultados = Busc.filtrar(b.todos, b.campo.value, 8);
      b.sel = 0;
    }
    b.lista.textContent = '';
    b.resultados.forEach((r, i) => {
      const fila = h('button', 'buscar-opcion' + (i === b.sel ? ' sel' : ''));
      fila.type = 'button'; fila.setAttribute('role', 'option');
      fila.setAttribute('aria-selected', i === b.sel ? 'true' : 'false');
      const textos = h('span', 'buscar-textos');
      const detalle = [r.carpeta ? 'en ' + r.carpeta : '', r.pantalla || ''].filter(Boolean).join(' · ');
      textos.append(h('span', 'buscar-nombre', r.nombre), h('span', 'buscador-detalle', detalle || 'en el escritorio'));
      fila.append(iconoDe(r.ruta, r.nombre), textos);
      fila.addEventListener('click', () => abrirResultado(r));
      b.lista.append(fila);
    });
    const hay = b.campo.value.trim();
    b.nota.textContent = !hay ? 'Escribe parte del nombre. Enter abre el primero.' : (b.resultados.length ? '' : 'No se encontró nada con ese nombre');
  }

  async function abrirResultado(r) {
    cerrarBuscador();
    await abrirAcceso(r);
  }

  // ------------------------------------------------------------ qué se ve (app / Windows)

  // Esconde o muestra los elementos de la app en este lienzo (el botón + se queda para volver).
  function aplicarAppOculta(v) {
    const antes = estado.vista.appOculta;
    estado.vista.appOculta = v === true;
    document.body.classList.toggle('app-oculta', estado.vista.appOculta);
    if (antes !== estado.vista.appOculta && estado.datos) render();
    if (estado.vista.appOculta) {
      if (estado.redim) terminarRedim(true);
      if (estado.arrastre) terminarArrastre({ clientX: 0, clientY: 0 }, true);
      if (estado.abierta) cerrarVentanita();
    }
  }

  async function refrescarVista() {
    try {
      const r = await api.estadoVista();
      if (r) { estado.vista.modo = r.modo; aplicarAppOculta(r.appOculta); }
    } catch (_) { /* se queda lo último conocido */ }
  }

  async function verVista(modo, callado) {
    let r = null;
    try { r = await api.fijarVista(modo); } catch (_) { r = null; }
    if (!r) { mostrarAviso('No se pudo cambiar lo que se ve'); return false; }
    estado.vista.modo = r.modo;
    aplicarAppOculta(r.appOculta);
    if (callado) return true;
    if (r.windows === null && modo !== 'ambos') {
      mostrarAviso(modo === 'windows'
        ? 'No se encontró el escritorio de Windows: la app se queda visible'
        : 'No se pudieron ocultar los iconos de Windows: usa clic derecho en el escritorio → Ver → Mostrar iconos del escritorio', 6000);
    } else if (modo === 'windows') {
      mostrarAviso('Solo se ven los iconos de Windows. Para volver: botón + o el icono de la bandeja', 6000);
    } else if (modo === 'app') {
      mostrarAviso('Solo se ven los de la app (tus archivos siguen en el escritorio de Windows)', 5000);
    } else {
      mostrarAviso('Se ven los de la app y los de Windows');
    }
    return true;
  }

  // Agregar algo con la app oculta: primero se vuelve a mostrar, si no lo nuevo no se vería.
  async function asegurarAppVisible() {
    if (!estado.vista.appOculta) return;
    await verVista('ambos', true);
    mostrarAviso('Se volvieron a mostrar los de la app');
  }

  function opcionesVista() {
    const m = estado.vista.modo;
    const op = (modo, texto) => ({ texto, marca: true, marcado: m === modo, accion: () => verVista(modo) });
    return [
      op('ambos', 'Ver los de la app y los de Windows'),
      op('app', 'Ver solo los de la app'),
      op('windows', 'Ver solo los de Windows'),
    ];
  }

  function opcionesAgregar(carpetaId) {
    const hist = carpetaId ? [] : opcionesHistorial();
    return [
      ...(carpetaId ? [] : [{ texto: 'Buscar…   (Ctrl+F)', accion: abrirBuscador }, ...hist, '-']),
      { texto: 'Agregar acceso…', accion: () => agregarDesdeDialogo('archivos', carpetaId ? { carpetaId } : {}) },
      { texto: 'Agregar carpeta de Windows…', accion: () => agregarDesdeDialogo('carpeta', carpetaId ? { carpetaId } : {}) },
      { texto: 'Agregar widget…', accion: pedirAgregarWidget },
      ...(carpetaId ? [] : ['-',
        { texto: 'Traer iconos del escritorio de Windows', accion: traerIconosDeWindows },
        '-', ...opcionesVista(),
      ]),
    ];
  }

  function abrirMenuDe(e) {
    const t = e.target;
    const nodo = t.closest ? t.closest('.item[data-id]') : null;
    let opciones;
    if (nodo) {
      const id = nodo.dataset.id;
      const r = Carp.buscar(estado.datos.elementos, id);
      if (!r) return;
      const el = r.elemento;
      if (el.tipo === 'widget') {
        const m = estado.montados.get(id);
        const propias = m && m.inst && typeof m.inst.menu === 'function' ? m.inst.menu() : [];
        const mod = Widgets.buscar(el.widget);
        const original = mod && mod.ancho && mod.alto && (mod.ancho !== el.ancho || mod.alto !== el.alto);
        opciones = [
          ...propias, ...(propias.length ? ['-'] : []),
          { texto: 'Cambiar tamaño…', accion: () => mostrarAviso('Arrastra la esquina de abajo a la derecha del widget (aparece al pasar el ratón)', 6000) },
          ...(original ? [{ texto: 'Tamaño original (' + mod.ancho + '×' + mod.alto + ')', accion: async () => {
            if (!(await cambiar(Carp.redimensionar(estado.datos.elementos, id, mod.ancho, mod.alto, estado.cols, estado.filas), 'cambiar el tamaño'))) mostrarAviso('No cabe de ese tamaño: hay algo en medio');
          } }] : []),
          { texto: 'Quitar widget', accion: () => quitarConDeshacer(id) },
          ...opcionesPantallas(id),
          '-', ...opcionesAgregar(null),
        ];
      } else if (el.tipo === 'carpeta') {
        opciones = [
          { texto: 'Abrir carpeta', accion: () => abrirVentanita(id) },
          { texto: 'Renombrar', accion: () => renombrarEnLugar(id) },
          { texto: 'Ordenar por nombre', accion: async () => {
            if (!(await cambiar(Carp.ordenarPorNombre(estado.datos.elementos, id), 'ordenar la carpeta'))) mostrarAviso('Ya está ordenada por nombre');
          } },
          { colores: Carp.COLORES, actual: el.color || '', accion: (c) => cambiar(Carp.colorear(estado.datos.elementos, id, c), 'cambiar el color') },
          { texto: 'Quitar del escritorio', accion: () => quitarConDeshacer(id) },
          ...opcionesPantallas(id),
          '-', ...opcionesAgregar(null),
        ];
      } else {
        const enCarpeta = !!r.carpeta;
        opciones = [
          { texto: 'Abrir', accion: () => alHacerClic(id) },
          { texto: 'Renombrar', accion: () => renombrarEnLugar(id) },
          { texto: 'Abrir ubicación', accion: () => api.mostrarEnCarpeta(el.ruta).then((x) => { if (!x || !x.ok) mostrarAviso('No se pudo abrir la ubicación'); }) },
          { texto: enCarpeta ? 'Quitar de la carpeta' : 'Quitar del escritorio', accion: () => quitarConDeshacer(id) },
          ...(enCarpeta ? [] : opcionesPantallas(id)),
          '-', ...opcionesAgregar(r.carpeta ? r.carpeta.id : null),
        ];
      }
    } else if (t.closest && (t.closest('#boton-mas') || t.closest('#ventanita'))) {
      opciones = opcionesAgregar(t.closest('#ventanita') ? estado.abierta : null);
    } else {
      return;
    }
    abrirMenuEn(e.clientX, e.clientY, opciones);
  }

  document.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    if (estado.editando || (e.target.closest && e.target.closest('input'))) return;
    cerrarMenu();
    await refrescarVista(); // Windows también se cambia desde su propio menú
    abrirMenuDe(e);
  }, true);
  cortina.addEventListener('pointerdown', cerrarMenu);
  cortina.addEventListener('contextmenu', (e) => { e.preventDefault(); cerrarMenu(); });

  botonMas.addEventListener('click', async (e) => {
    await refrescarVista();
    const r = botonMas.getBoundingClientRect();
    abrirMenuEn(Math.min(e.clientX, r.right), r.top, opcionesAgregar(null));
    menu.style.top = Math.max(4, r.top - menu.offsetHeight - 6) + 'px';
  });

  // ------------------------------------------------------------ teclado y ventana

  document.addEventListener('keydown', (e) => {
    const enCampo = e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]');
    if (e.ctrlKey && !e.altKey && !enCampo) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); rehacer(); return; }
      if (k === 'f') { e.preventDefault(); abrirBuscador(); return; }
    }
    if (e.key !== 'Escape') return;
    if (estado.buscador) { cerrarBuscador(); return; }
    if (!menu.hidden) { cerrarMenu(); return; }
    if (estado.redim) { terminarRedim(true); return; }
    if (estado.arrastre) { terminarArrastre({ clientX: 0, clientY: 0 }, true); return; }
    if (estado.abierta) cerrarVentanita();
  });

  window.addEventListener('resize', () => {
    calcularDimensiones();
    if (estado.datos && acomodarTodo()) { render(); refrescarVentanita(); persistir(); }
  });

  // Revisa si siguen existiendo las rutas (p. ej. una unidad de red que vuelve) al recuperar el foco.
  async function refrescarExistencia() {
    if (!estado.datos || estado.arrastre || estado.editando) return;
    if (await cargarInfo(rutasDe(estado.datos.elementos), true)) { render(); refrescarVentanita(); }
  }
  window.addEventListener('focus', refrescarExistencia);
  setInterval(refrescarExistencia, 60000);

  // ------------------------------------------------------------ arranque

  async function iniciar() {
    const r = await api.cargar();
    estado.datos = r.datos;
    estado.clave = r.clave || '';
    estado.otras = Array.isArray(r.otras) ? r.otras : [];
    aplicarAppOculta(r.appOculta === true);
    calcularDimensiones();
    const movido = acomodarTodo();
    await cargarInfo(rutasDe(estado.datos.elementos));
    render();
    if (movido) persistir();
    if (r.rotoEn) mostrarAviso('El archivo de datos estaba dañado; se guardó una copia y se empezó vacío.', 8000);
    document.documentElement.dataset.listo = '1';
  }

  // Cambió algún monitor: llegan los otros monitores y los elementos de este (si se desconectó uno,
  // sus elementos se ven aquí hasta que vuelva).
  api.alCambiarPantalla(async (d) => {
    if (!estado.datos) return;
    if (d && Array.isArray(d.otras)) estado.otras = d.otras;
    if (d && d.datos && Array.isArray(d.datos.elementos) && !estado.arrastre && !estado.redim) {
      estado.datos = { ...estado.datos, elementos: d.datos.elementos };
      await cargarInfo(rutasDe(estado.datos.elementos));
    }
    calcularDimensiones();
    if (acomodarTodo()) persistir();
    render();
    refrescarVentanita();
  });

  api.alPedirBuscar(() => { abrirBuscador(); });

  // Cambió desde otro monitor o desde la bandeja.
  api.alCambiarVista((d) => { if (d) { aplicarAppOculta(d.appOculta === true); refrescarVista(); } });

  // Gancho para pruebas (smoke) y para el paso 3 (panel "Agregar widget").
  window.__escritorio = {
    estado, fijarIgnorar, agregarRutas, abrirVentanita, cerrarVentanita, renombrarEnLugar, render, pasarAPantalla, verVista,
    deshacer, rehacer, abrirBuscador, pedirTeclado,
    async agregarWidget(id, ancho, alto, opciones) {
      await asegurarAppVisible();
      const r = Carp.agregarWidget(estado.datos.elementos, id, ancho, alto, estado.cols, estado.filas, nuevoId, opciones);
      if (!r.ok) { mostrarAviso('No hay lugar libre para el widget'); return null; }
      cambiar(r, 'agregar el widget');
      return r.id;
    },
    mostrarAviso,
  };

  iniciar().catch((e) => mostrarAviso('Error al iniciar: ' + (e && e.message ? e.message : e), 10000));
}());
