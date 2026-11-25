'use strict';
// Lógica pura de la cuadrícula del lienzo (celdas de 96 px). Sin DOM ni electron:
// se carga como <script> en el renderer (global Cuadricula) y con require() en las pruebas.
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Cuadricula = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  const CELDA = 96;

  // Cuántas columnas y filas caben en un área de ancho x alto píxeles.
  function dimensiones(ancho, alto, celda = CELDA) {
    return {
      cols: Math.max(1, Math.floor(ancho / celda)),
      filas: Math.max(1, Math.floor(alto / celda)),
    };
  }

  // Celda que contiene un punto (en píxeles del lienzo).
  function celdaDePunto(x, y, celda = CELDA) {
    return { col: Math.floor(x / celda), fila: Math.floor(y / celda) };
  }

  function tamano(el) {
    return { ancho: el.tipo === 'widget' ? (el.ancho || 1) : 1, alto: el.tipo === 'widget' ? (el.alto || 1) : 1 };
  }

  // ¿Se traslapan dos rectángulos de celdas?
  function traslapa(a, b) {
    return a.col < b.col + b.ancho && b.col < a.col + a.ancho
      && a.fila < b.fila + b.alto && b.fila < a.fila + a.alto;
  }

  function rectDe(el) {
    const t = tamano(el);
    return { col: el.col, fila: el.fila, ancho: t.ancho, alto: t.alto };
  }

  // Devuelve el primer elemento que choca con el rectángulo dado (o null).
  function colision(elementos, rect, ignorarId) {
    for (const el of elementos) {
      if (el.id === ignorarId) continue;
      if (traslapa(rect, rectDe(el))) return el;
    }
    return null;
  }

  function cabe(rect, cols, filas) {
    return rect.col >= 0 && rect.fila >= 0 && rect.col + rect.ancho <= cols && rect.fila + rect.alto <= filas;
  }

  // Celda libre más cercana a (col, fila) para un bloque de ancho x alto.
  // Orden de empate: más cerca, luego fila menor, luego columna menor. Null si no hay lugar.
  function celdaLibreMasCercana(elementos, col, fila, cols, filas, ignorarId, ancho = 1, alto = 1) {
    let mejor = null;
    let mejorD = Infinity;
    for (let f = 0; f + alto <= filas; f++) {
      for (let c = 0; c + ancho <= cols; c++) {
        const d = (c - col) * (c - col) + (f - fila) * (f - fila);
        if (d > mejorD) continue;
        if (d === mejorD && mejor && (f > mejor.fila || (f === mejor.fila && c > mejor.col))) continue;
        if (colision(elementos, { col: c, fila: f, ancho, alto }, ignorarId)) continue;
        mejor = { col: c, fila: f };
        mejorD = d;
      }
    }
    return mejor;
  }

  // Primera zona libre leyendo por columnas de arriba abajo (como el escritorio de Windows).
  function primeraZonaLibre(elementos, ancho, alto, cols, filas) {
    for (let c = 0; c + ancho <= cols; c++) {
      for (let f = 0; f + alto <= filas; f++) {
        if (!colision(elementos, { col: c, fila: f, ancho, alto })) return { col: c, fila: f };
      }
    }
    return null;
  }

  // Ajusta una posición pedida para que el bloque quede dentro de la pantalla.
  function limitar(col, fila, ancho, alto, cols, filas) {
    return {
      col: Math.min(Math.max(0, col), Math.max(0, cols - ancho)),
      fila: Math.min(Math.max(0, fila), Math.max(0, filas - alto)),
    };
  }

  // Asegura que todos los elementos queden dentro de la pantalla y sin choques.
  // Devuelve una copia: los que ya están bien no se mueven; los demás van a la celda libre
  // más cercana. Si ya no hay lugar, se dejan donde están (nunca se descartan datos).
  function acomodar(elementos, cols, filas) {
    const copia = elementos.map((e) => ({ ...e }));
    const colocados = [];
    const pendientes = [];
    for (const el of copia) {
      const r = rectDe(el);
      if (cabe(r, cols, filas) && !colision(colocados, r)) colocados.push(el);
      else pendientes.push(el);
    }
    for (const el of pendientes) {
      const t = tamano(el);
      const lim = limitar(el.col, el.fila, t.ancho, t.alto, cols, filas);
      const sitio = celdaLibreMasCercana(colocados, lim.col, lim.fila, cols, filas, null, t.ancho, t.alto);
      if (sitio) { el.col = sitio.col; el.fila = sitio.fila; }
      colocados.push(el);
    }
    return copia;
  }

  return {
    CELDA, dimensiones, celdaDePunto, tamano, traslapa, rectDe, colision, cabe,
    celdaLibreMasCercana, primeraZonaLibre, acomodar, limitar,
  };
}));
