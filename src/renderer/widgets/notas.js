'use strict';
// Notas (2×2): texto libre. Se guarda 500 ms después de dejar de escribir (campo notas.texto de
// escritorio.json, vía el proceso principal). Al quitar el widget se guarda lo pendiente de inmediato.
(function () {
  const W = window.EscritorioWidgets;
  const ESPERA_MS = 500;

  W.registrar({
    id: 'notas',
    nombre: 'Notas',
    ancho: 2,
    alto: 2,

    montar(el, opciones, api) {
      this._activo = true;
      this._pendiente = false;
      this._api = api;
      const caja = W.crear('div', 'notas');
      // El título es zona de arrastre; el cuadro de texto no (ahí se hace clic para escribir).
      caja.append(W.crear('div', 'notas-titulo', 'Notas'));
      this._area = W.crear('textarea', 'notas-texto');
      this._area.spellcheck = false;
      this._area.maxLength = 20000;
      this._area.placeholder = 'Escribe aquí…';
      this._area.setAttribute('aria-label', 'Notas');
      caja.append(this._area);
      el.append(caja);

      if (api && api.vistaPrevia) {
        this._area.value = 'Llamar al proveedor\nRevisar pedido de la semana\nJunta 3:00 p. m.';
        this._area.disabled = true;
        return;
      }
      this._area.disabled = true;
      window.escritorio.notas.leer().then((t) => {
        if (!this._activo) return;
        this._area.value = typeof t === 'string' ? t : '';
        this._area.disabled = false;
      }).catch(() => { if (this._activo) { this._area.disabled = false; api.avisar('No se pudieron leer las notas'); } });

      this._area.addEventListener('input', () => {
        this._pendiente = true;
        clearTimeout(this._temporizador);
        this._temporizador = setTimeout(() => this._guardar(), ESPERA_MS);
      });
      this._area.addEventListener('blur', () => this._guardar());
      this._area.addEventListener('keydown', (e) => e.stopPropagation());
    },

    _guardar() {
      clearTimeout(this._temporizador);
      this._temporizador = null;
      if (!this._pendiente) return;
      this._pendiente = false;
      const texto = this._area.value;
      window.escritorio.notas.guardar(texto).catch(() => {
        this._pendiente = true;
        if (this._activo) this._api.avisar('No se pudieron guardar las notas');
      });
    },

    desmontar() {
      if (this._pendiente) this._guardar();
      this._activo = false;
      clearTimeout(this._temporizador);
      this._temporizador = null;
    },
  });
}());
