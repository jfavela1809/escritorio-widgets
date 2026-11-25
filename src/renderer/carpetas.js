'use strict';
// Operaciones puras sobre la lista de elementos del escritorio (carpetas tipo Android).
// Nunca tocan archivos: solo mueven rutas dentro de la lista. Cada función devuelve
// { elementos, ok, ... } con listas nuevas (no modifica la que recibe).
// Se carga como <script> (global Carpetas) y con require() en las pruebas.
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./cuadricula'));
  else raiz.Carpetas = fabrica(raiz.Cuadricula);
}(typeof self !== 'undefined' ? self : this, function (Cuadricula) {
  const NOMBRE_CARPETA = 'Carpeta';
  const MAX_NOMBRE = 60;

  const clonar = (lista) => lista.map((e) => (e.tipo === 'carpeta' ? { ...e, hijos: e.hijos.map((h) => ({ ...h })) } : { ...e }));

  const limpiarNombre = (n, defecto) => {
    const t = String(n == null ? '' : n).replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_NOMBRE);
    return t || defecto;
  };

  // Busca un elemento por id. Devuelve { elemento, carpeta } (carpeta = el padre si es hijo) o null.
  function buscar(elementos, id) {
    for (const el of elementos) {
      if (el.id === id) return { elemento: el, carpeta: null };
      if (el.tipo === 'carpeta') {
        const h = el.hijos.find((x) => x.id === id);
        if (h) return { elemento: h, carpeta: el };
      }
    }
    return null;
  }

  // Una carpeta con un solo hijo se deshace (el hijo ocupa su celda); vacía se borra.
  function deshacerCarpetas(elementos) {
    const salida = [];
    for (const el of elementos) {
      if (el.tipo !== 'carpeta') { salida.push(el); continue; }
      if (el.hijos.length === 0) continue;
      if (el.hijos.length === 1) { salida.push({ ...el.hijos[0], col: el.col, fila: el.fila }); continue; }
      salida.push(el);
    }
    return salida;
  }

  // Quita un elemento (de la cuadrícula o de dentro de una carpeta) de una copia de la lista y lo devuelve.
  function extraer(elementos, id) {
    const lista = clonar(elementos);
    const idx = lista.findIndex((e) => e.id === id);
    if (idx >= 0) return { lista, quitado: lista.splice(idx, 1)[0] };
    for (const c of lista) {
      if (c.tipo !== 'carpeta') continue;
      const i = c.hijos.findIndex((h) => h.id === id);
      if (i >= 0) return { lista, quitado: c.hijos.splice(i, 1)[0] };
    }
    return { lista, quitado: null };
  }

  const comoHijo = (a) => ({ id: a.id, tipo: 'acceso', ruta: a.ruta, nombre: a.nombre });

  // Suelta el acceso `idOrigen` (de la cuadrícula o de dentro de una carpeta) sobre `idDestino`.
  //  - destino acceso  -> nueva carpeta "Carpeta" con los dos, en la celda del destino.
  //  - destino carpeta -> el acceso entra a la carpeta.
  // Las carpetas y los widgets no se sueltan sobre otros elementos. Devuelve { elementos, ok, carpetaId }.
  function soltarSobre(elementos, idOrigen, idDestino, nuevoId) {
    const igual = { elementos, ok: false, carpetaId: null };
    const o = buscar(elementos, idOrigen);
    const d = buscar(elementos, idDestino);
    if (!o || !d || idOrigen === idDestino) return igual;
    if (o.elemento.tipo !== 'acceso') return igual;
    if (d.carpeta || d.elemento.tipo === 'widget') return igual; // el destino debe estar en la cuadrícula
    if (o.carpeta && o.carpeta.id === idDestino) return igual;   // soltar un hijo sobre su propia carpeta
    const { lista, quitado } = extraer(elementos, idOrigen);
    if (!quitado) return igual;
    const destino = lista.find((e) => e.id === idDestino);
    if (!destino) return igual;
    let carpetaId;
    let resultado;
    if (destino.tipo === 'carpeta') {
      destino.hijos.push(comoHijo(quitado));
      carpetaId = destino.id;
      resultado = lista;
    } else {
      carpetaId = nuevoId();
      const carpeta = {
        id: carpetaId, tipo: 'carpeta', nombre: NOMBRE_CARPETA, col: destino.col, fila: destino.fila,
        hijos: [comoHijo(destino), comoHijo(quitado)],
      };
      resultado = lista.map((e) => (e.id === idDestino ? carpeta : e));
    }
    return { elementos: deshacerCarpetas(resultado), ok: true, carpetaId };
  }

  // Saca un hijo de su carpeta y lo deja en la cuadrícula en la celda libre más cercana a (col, fila).
  // Si la carpeta queda con un solo hijo, se deshace.
  function sacarDeCarpeta(elementos, idHijo, col, fila, cols, filas) {
    const o = buscar(elementos, idHijo);
    if (!o || !o.carpeta) return { elementos, ok: false };
    const { lista, quitado } = extraer(elementos, idHijo);
    const base = deshacerCarpetas(lista);
    const lim = Cuadricula.limitar(col, fila, 1, 1, cols, filas);
    const sitio = Cuadricula.celdaLibreMasCercana(base, lim.col, lim.fila, cols, filas, null);
    if (!sitio) return { elementos, ok: false };
    return { elementos: [...base, { ...comoHijo(quitado), col: sitio.col, fila: sitio.fila }], ok: true };
  }

  // Mueve un elemento de la cuadrícula a la celda libre más cercana a (col, fila).
  function mover(elementos, id, col, fila, cols, filas) {
    const lista = clonar(elementos);
    const el = lista.find((e) => e.id === id);
    if (!el) return { elementos, ok: false };
    const t = Cuadricula.tamano(el);
    const lim = Cuadricula.limitar(col, fila, t.ancho, t.alto, cols, filas);
    const sitio = Cuadricula.celdaLibreMasCercana(lista, lim.col, lim.fila, cols, filas, id, t.ancho, t.alto);
    if (!sitio) return { elementos, ok: false };
    el.col = sitio.col; el.fila = sitio.fila;
    return { elementos: lista, ok: true };
  }

  // Quita del escritorio un acceso, carpeta o widget (solo de la lista; el archivo no se toca).
  function quitar(elementos, id) {
    const { lista, quitado } = extraer(elementos, id);
    if (!quitado) return { elementos, ok: false };
    return { elementos: deshacerCarpetas(lista), ok: true };
  }

  function renombrar(elementos, id, nombre) {
    const lista = clonar(elementos);
    const o = buscar(lista, id);
    if (!o || o.elemento.tipo === 'widget') return { elementos, ok: false };
    o.elemento.nombre = limpiarNombre(nombre, o.elemento.tipo === 'carpeta' ? NOMBRE_CARPETA : o.elemento.nombre);
    return { elementos: lista, ok: true };
  }

  // Agrega un acceso nuevo ({ruta, nombre}). Con destino acceso -> carpeta; destino carpeta -> entra;
  // sin destino -> primera celda libre. Devuelve { elementos, ok, id }.
  function agregarAcceso(elementos, nuevo, idDestino, cols, filas, nuevoId) {
    const id = nuevoId();
    const acceso = { id, tipo: 'acceso', ruta: nuevo.ruta, nombre: limpiarNombre(nuevo.nombre, nuevo.ruta) };
    if (idDestino) {
      const d = buscar(elementos, idDestino);
      if (d && !d.carpeta && d.elemento.tipo !== 'widget') {
        const lista = [...clonar(elementos), { ...acceso, col: -1, fila: -1 }];
        const r = soltarSobre(lista, id, idDestino, nuevoId);
        if (r.ok) return { elementos: r.elementos, ok: true, id };
      }
    }
    const sitio = Cuadricula.primeraZonaLibre(elementos, 1, 1, cols, filas);
    if (!sitio) return { elementos, ok: false, id: null };
    return { elementos: [...clonar(elementos), { ...acceso, col: sitio.col, fila: sitio.fila }], ok: true, id };
  }

  // Agrega un acceso directamente dentro de una carpeta.
  function agregarAHijos(elementos, idCarpeta, nuevo, nuevoId) {
    const lista = clonar(elementos);
    const c = lista.find((e) => e.id === idCarpeta && e.tipo === 'carpeta');
    if (!c) return { elementos, ok: false, id: null };
    const id = nuevoId();
    c.hijos.push({ id, tipo: 'acceso', ruta: nuevo.ruta, nombre: limpiarNombre(nuevo.nombre, nuevo.ruta) });
    return { elementos: lista, ok: true, id };
  }

  // Agrega un widget en la primera zona libre (lo usará el paso 3).
  function agregarWidget(elementos, widget, ancho, alto, cols, filas, nuevoId, opciones) {
    const sitio = Cuadricula.primeraZonaLibre(elementos, ancho, alto, cols, filas);
    if (!sitio) return { elementos, ok: false, id: null };
    const id = nuevoId();
    return {
      elementos: [...clonar(elementos), { id, tipo: 'widget', widget, col: sitio.col, fila: sitio.fila, ancho, alto, opciones: opciones || {} }],
      ok: true, id,
    };
  }

  // Cambia el tamaño de un widget (en celdas, de 1 a MAX_TAMANO por lado) sin moverlo de su
  // esquina superior izquierda. Falla si se sale de la pantalla o choca con otro elemento.
  const MAX_TAMANO = 8;
  function redimensionar(elementos, id, ancho, alto, cols, filas) {
    const lista = clonar(elementos);
    const el = lista.find((e) => e.id === id);
    if (!el || el.tipo !== 'widget') return { elementos, ok: false, motivo: 'no-widget' };
    const a = Math.min(MAX_TAMANO, Math.max(1, Math.round(Number(ancho)) || 1));
    const l = Math.min(MAX_TAMANO, Math.max(1, Math.round(Number(alto)) || 1));
    const rect = { col: el.col, fila: el.fila, ancho: a, alto: l };
    if (!Cuadricula.cabe(rect, cols, filas)) return { elementos, ok: false, motivo: 'fuera' };
    if (Cuadricula.colision(lista, rect, id)) return { elementos, ok: false, motivo: 'choca' };
    el.ancho = a; el.alto = l;
    return { elementos: lista, ok: true };
  }

  // Mueve un hijo a otra posición dentro de su carpeta (índice 0 = el primero).
  function reordenar(elementos, idCarpeta, idHijo, indice) {
    const lista = clonar(elementos);
    const c = lista.find((e) => e.id === idCarpeta && e.tipo === 'carpeta');
    if (!c) return { elementos, ok: false };
    const de = c.hijos.findIndex((h) => h.id === idHijo);
    if (de < 0) return { elementos, ok: false };
    const a = Math.min(c.hijos.length - 1, Math.max(0, Math.round(Number(indice)) || 0));
    if (a === de) return { elementos, ok: false };
    const [h] = c.hijos.splice(de, 1);
    c.hijos.splice(a, 0, h);
    return { elementos: lista, ok: true };
  }

  // Ordena los hijos de una carpeta por nombre (sin distinguir mayúsculas ni acentos).
  function ordenarPorNombre(elementos, idCarpeta) {
    const lista = clonar(elementos);
    const c = lista.find((e) => e.id === idCarpeta && e.tipo === 'carpeta');
    if (!c) return { elementos, ok: false };
    const antes = c.hijos.map((h) => h.id).join('|');
    c.hijos.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es', { sensitivity: 'base', numeric: true }));
    return { elementos: lista, ok: c.hijos.map((h) => h.id).join('|') !== antes };
  }

  // Colores de carpeta ('' = el de siempre). Los mismos nombres valida datos.js.
  const COLORES = ['', 'azul', 'verde', 'amarillo', 'naranja', 'rojo', 'morado', 'rosa', 'gris'];
  function colorear(elementos, idCarpeta, color) {
    if (!COLORES.includes(color)) return { elementos, ok: false };
    const lista = clonar(elementos);
    const c = lista.find((e) => e.id === idCarpeta && e.tipo === 'carpeta');
    if (!c || (c.color || '') === color) return { elementos, ok: false };
    if (color) c.color = color; else delete c.color;
    return { elementos: lista, ok: true };
  }

  // Los primeros 4 hijos de una carpeta (para el icono 2x2).
  function miniaturas(carpeta) { return carpeta.hijos.slice(0, 4); }

  return {
    NOMBRE_CARPETA, MAX_NOMBRE, buscar, deshacerCarpetas, soltarSobre, sacarDeCarpeta, mover,
    quitar, renombrar, agregarAcceso, agregarAHijos, agregarWidget, redimensionar, MAX_TAMANO, miniaturas, limpiarNombre,
    reordenar, ordenarPorNombre, colorear, COLORES,
  };
}));
