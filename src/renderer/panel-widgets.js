'use strict';
// Panel "Agregar widget" tipo Android: una hoja con una miniatura de cada widget (dibujada con datos
// de ejemplo), su nombre y su tamaño. Un clic coloca el widget en la primera zona libre.
// Responde al evento cancelable 'escritorio:agregar-widget' que lanza app.js (menú y botón "+").
(function () {
  const W = window.EscritorioWidgets;
  const CELDA = window.Cuadricula.CELDA;
  const hoja = document.getElementById('hoja');
  const velo = document.getElementById('hoja-velo');
  const CAJA_ANCHO = 204; const CAJA_ALTO = 128; // espacio de la miniatura dentro de cada tarjeta

  let previas = []; // instancias montadas en miniatura (se desmontan al cerrar)

  const abierto = () => !hoja.hidden;

  function cerrar() {
    if (!abierto()) return;
    for (const p of previas) { try { p.desmontar(); } catch (_) { /* una miniatura rota no debe trabar el cierre */ } }
    previas = [];
    hoja.textContent = '';
    hoja.hidden = true; velo.hidden = true;
  }

  // Miniatura: el mismo aspecto que el widget real, reducido con transform (sin IPC ni temporizadores).
  function miniatura(mod) {
    const ancho = mod.ancho * CELDA; const alto = mod.alto * CELDA;
    const escala = Math.min(CAJA_ANCHO / ancho, CAJA_ALTO / alto, 1);
    const caja = W.crear('div', 'hoja-vista');
    const marco = W.crear('div', 'hoja-marco');
    marco.style.width = Math.round(ancho * escala) + 'px';
    marco.style.height = Math.round(alto * escala) + 'px';
    const nodo = W.crear('div', 'item widget hoja-widget widget-' + mod.id);
    nodo.style.width = ancho + 'px'; nodo.style.height = alto + 'px';
    nodo.style.transform = 'scale(' + escala + ')';
    const cuerpo = W.crear('div', 'widget-cuerpo');
    nodo.append(cuerpo);
    marco.append(nodo);
    caja.append(marco);
    const inst = Object.create(mod);
    try {
      inst.montar(cuerpo, {}, { ancho: mod.ancho, alto: mod.alto, vistaPrevia: true, guardarOpciones() {}, avisar() {} });
      previas.push(inst);
    } catch (_) { cuerpo.append(W.crear('div', 'widget-vacio', mod.nombre)); }
    return caja;
  }

  function colocar(mod) {
    cerrar();
    window.__escritorio.agregarWidget(mod.id, mod.ancho, mod.alto);
  }

  function abrir() {
    cerrar();
    const cab = W.crear('div', 'hoja-cabecera');
    const cerrarBtn = W.crear('button', 'hoja-cerrar', '×');
    cerrarBtn.type = 'button'; cerrarBtn.title = 'Cerrar'; cerrarBtn.setAttribute('aria-label', 'Cerrar');
    cerrarBtn.addEventListener('click', cerrar);
    cab.append(W.crear('div', 'hoja-titulo', 'Agregar widget'), cerrarBtn);
    const rejilla = W.crear('div', 'hoja-rejilla');
    for (const mod of W.lista) {
      const tarjeta = W.crear('button', 'hoja-tarjeta');
      tarjeta.type = 'button';
      tarjeta.dataset.widget = mod.id;
      tarjeta.append(
        miniatura(mod),
        W.crear('div', 'hoja-nombre', mod.nombre),
        W.crear('div', 'hoja-tamano', `${mod.ancho} × ${mod.alto}`),
      );
      tarjeta.addEventListener('click', () => colocar(mod));
      rejilla.append(tarjeta);
    }
    hoja.append(cab, rejilla);
    velo.hidden = false; hoja.hidden = false;
    window.__escritorio.fijarIgnorar(false);
  }

  document.addEventListener('escritorio:agregar-widget', (e) => { e.preventDefault(); abrir(); });
  velo.addEventListener('pointerdown', cerrar);
  velo.addEventListener('contextmenu', (e) => { e.preventDefault(); cerrar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierto()) cerrar(); });
  window.addEventListener('blur', cerrar);
}());
