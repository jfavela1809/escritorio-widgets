'use strict';
// Registro de widgets del escritorio. Cada módulo de esta carpeta (reloj.js, clima.js, ...) llama a
// EscritorioWidgets.registrar({...}) y se carga con un <script> en index.html antes de app.js.
// app.js crea una instancia por widget colocado (Object.create(modulo)), así que montar() y
// desmontar() pueden guardar su estado en `this` y varios widgets del mismo tipo no se pisan.
//
// Interfaz de cada widget:
//   {
//     id: 'reloj',                 // identificador estable (se guarda en escritorio.json)
//     nombre: 'Reloj y fecha',     // nombre para el panel "Agregar widget"
//     ancho: 2, alto: 2,           // tamaño en celdas de 96 px
//     montar(el, opciones, api),   // dibuja el widget dentro de `el` (usar textContent, nunca innerHTML con datos)
//     desmontar(),                 // libera temporizadores y eventos
//     menu()                       // opcional: opciones extra del menú contextual [{ texto, accion }]
//   }
// `api` (la crea app.js): { guardarOpciones(obj), avisar(texto), ancho, alto, vistaPrevia }.
// vistaPrevia = true cuando se dibuja en miniatura en el panel "Agregar widget": hay que mostrar datos
// de ejemplo, sin IPC ni temporizadores.
// Los widgets que necesiten sistema o red lo piden al proceso principal por IPC (el renderer
// no hace fetch: la CSP es default-src 'self').
(function (raiz) {
  const widgets = [];

  function registrar(modulo) {
    if (!modulo || typeof modulo.id !== 'string' || typeof modulo.montar !== 'function'
        || typeof modulo.desmontar !== 'function') {
      throw new Error('Widget no válido: faltan id, montar o desmontar');
    }
    if (widgets.some((w) => w.id === modulo.id)) throw new Error('Widget repetido: ' + modulo.id);
    widgets.push(modulo);
  }

  function buscar(id) { return widgets.find((w) => w.id === id) || null; }

  // Crea un elemento con clase y texto (textContent: nunca innerHTML).
  function crear(etiqueta, clase, texto) {
    const e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  raiz.EscritorioWidgets = { lista: widgets, registrar, buscar, crear };
}(typeof self !== 'undefined' ? self : this));
