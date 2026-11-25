'use strict';
// Deshacer / rehacer cambios del escritorio (una pila por lienzo). Guarda copias de la lista de
// elementos de antes de cada cambio, con un texto ("mover "Excel"") para el menú y los avisos.
// Las opciones de los widgets (p. ej. la lista de pendientes) no se deshacen: al regresar a una
// copia vieja se conservan las opciones actuales de cada widget que sigue existiendo.
// Se carga como <script> (global Historial) y con require() en las pruebas.
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Historial = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  const MAX = 30;

  function conOpcionesActuales(copia, actual) {
    const opciones = new Map();
    for (const e of actual) if (e.tipo === 'widget') opciones.set(e.id, e.opciones);
    return copia.map((e) => (e.tipo === 'widget' && opciones.has(e.id) ? { ...e, opciones: opciones.get(e.id) } : e));
  }

  function crear(max = MAX) {
    let atras = [];
    let adelante = [];
    return {
      // Antes de aplicar un cambio: se guarda cómo estaba. Un cambio nuevo borra lo que se podía rehacer.
      registrar(antes, texto) {
        atras.push({ elementos: antes, texto: texto || 'el último cambio' });
        if (atras.length > max) atras.shift();
        adelante = [];
      },
      // Devuelve { elementos, texto } para dejar el escritorio como estaba, o null si no hay nada.
      deshacer(actual) {
        const p = atras.pop();
        if (!p) return null;
        adelante.push({ elementos: actual, texto: p.texto });
        return { elementos: conOpcionesActuales(p.elementos, actual), texto: p.texto };
      },
      rehacer(actual) {
        const p = adelante.pop();
        if (!p) return null;
        atras.push({ elementos: actual, texto: p.texto });
        return { elementos: conOpcionesActuales(p.elementos, actual), texto: p.texto };
      },
      siguienteDeshacer() { return atras.length ? atras[atras.length - 1].texto : null; },
      siguienteRehacer() { return adelante.length ? adelante[adelante.length - 1].texto : null; },
      tamano() { return atras.length; },
      // Tras pasar algo a otro monitor las copias de este ya no cuadran con el otro: se olvidan.
      limpiar() { atras = []; adelante = []; },
    };
  }

  return { crear, conOpcionesActuales, MAX };
}));
