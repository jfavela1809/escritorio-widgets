'use strict';
// Varias pantallas: un lienzo (ventana) por monitor. Cada elemento del escritorio guarda en
// `pantalla` la clave del monitor donde vive. Lógica pura, sin importar electron.
//
// La clave no usa display.id (Windows lo deriva de \\.\DISPLAYn, que cambia al conectar en otro
// orden): usa el nombre del monitor y su resolución física, p. ej. "HDMI|1920x1080".
// Un elemento cuya pantalla no está conectada se muestra en la principal y conserva su clave,
// así regresa a su monitor cuando se vuelve a conectar.

const MAX_CLAVE = 80;

const claveValida = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_CLAVE && !/[\u0000-\u001f]/.test(v);

// displays: los de screen.getAllDisplays(). Devuelve [{ clave, display, principal, nombre }].
function listar(displays, idPrincipal) {
  const orden = [...displays].sort((a, b) => (a.bounds.x - b.bounds.x) || (a.bounds.y - b.bounds.y));
  const usadas = new Map();
  const principal = orden.find((d) => d.id === idPrincipal) || orden[0];
  return orden.map((d) => {
    const f = Number(d.scaleFactor) || 1;
    const etiqueta = String(d.label || '').replace(/[|\u0000-\u001f]/g, '').trim().slice(0, 40) || 'interna';
    const base = `${etiqueta}|${Math.round(d.bounds.width * f)}x${Math.round(d.bounds.height * f)}`;
    const n = (usadas.get(base) || 0) + 1;
    usadas.set(base, n);
    const clave = n === 1 ? base : `${base}#${n}`;
    let nombre;
    if (d === principal) nombre = 'la pantalla principal';
    else if (d.bounds.x + d.bounds.width <= principal.bounds.x) nombre = 'la pantalla de la izquierda';
    else if (d.bounds.x >= principal.bounds.x + principal.bounds.width) nombre = 'la pantalla de la derecha';
    else if (d.bounds.y < principal.bounds.y) nombre = 'la pantalla de arriba';
    else nombre = 'la pantalla de abajo';
    if (d.label && d !== principal) nombre += ` (${etiqueta})`;
    return { clave, display: d, principal: d === principal, nombre };
  });
}

// Clave del monitor donde se dibuja un elemento.
function claveEfectiva(el, conectadas, principal) {
  return el && claveValida(el.pantalla) && conectadas.has(el.pantalla) ? el.pantalla : principal;
}

function deLaPantalla(elementos, clave, conectadas, principal) {
  return elementos.filter((e) => claveEfectiva(e, conectadas, principal) === clave);
}

// Reemplaza los elementos de una pantalla por los que mandó su lienzo. Si un id llega de esta
// pantalla, se quita de las demás (así, al pasar un elemento de un monitor a otro, nunca queda doble).
function fusionar(elementos, clave, propios, conectadas, principal) {
  const ids = new Set(propios.map((e) => e && e.id));
  const otros = elementos.filter((e) => claveEfectiva(e, conectadas, principal) !== clave && !ids.has(e.id));
  const marcados = propios.map((e) => {
    // Un elemento de un monitor desconectado que se ve aquí conserva su clave para volver a él.
    if (claveValida(e.pantalla) && e.pantalla !== clave && !conectadas.has(e.pantalla)) return e;
    return { ...e, pantalla: clave };
  });
  return [...otros, ...marcados];
}

module.exports = { listar, claveEfectiva, deLaPantalla, fusionar, claveValida, MAX_CLAVE };
