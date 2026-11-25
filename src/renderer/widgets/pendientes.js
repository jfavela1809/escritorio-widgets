'use strict';
// Pendientes (2×2): lista con casillas. Enter agrega, clic en la casilla la marca, × la quita.
// La lista se guarda en las opciones del widget (escritorio.json), así cada widget tiene la suya.
(function () {
  const W = window.EscritorioWidgets;
  const MAX_ITEMS = 100;
  const MAX_TEXTO = 200;

  // Solo entra lo que tiene forma de pendiente: { t: texto, hecho: bool }.
  function limpiar(items) {
    const salida = [];
    for (const it of Array.isArray(items) ? items : []) {
      const t = it && typeof it.t === 'string' ? it.t.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_TEXTO) : '';
      if (t) salida.push({ t, hecho: it.hecho === true });
      if (salida.length >= MAX_ITEMS) break;
    }
    return salida;
  }

  W.registrar({
    id: 'pendientes',
    nombre: 'Pendientes',
    ancho: 2,
    alto: 2,
    limpiar,

    montar(el, opciones, api) {
      this._api = api;
      this._items = limpiar(opciones && opciones.items);
      const caja = W.crear('div', 'pend');
      const cab = W.crear('div', 'pend-titulo', 'Pendientes');
      this._cuenta = W.crear('span', 'pend-cuenta');
      cab.append(this._cuenta);
      this._lista = W.crear('div', 'pend-lista');
      this._campo = W.crear('input', 'pend-campo');
      this._campo.type = 'text'; this._campo.maxLength = MAX_TEXTO;
      this._campo.placeholder = '+ Agregar pendiente';
      this._campo.setAttribute('aria-label', 'Agregar pendiente');
      caja.append(cab, this._lista, this._campo);
      el.append(caja);
      if (api && api.vistaPrevia) {
        this._items = [{ t: 'Revisar pedido de la semana', hecho: true }, { t: 'Llamar al proveedor', hecho: false }, { t: 'Mandar el plano', hecho: false }];
        this._campo.disabled = true;
        this._pintar();
        return;
      }
      this._campo.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const t = this._campo.value.replace(/[\u0000-\u001f]/g, ' ').trim();
          if (!t) return;
          if (this._items.length >= MAX_ITEMS) { api.avisar('La lista ya tiene ' + MAX_ITEMS + ' pendientes'); return; }
          this._items.push({ t: t.slice(0, MAX_TEXTO), hecho: false });
          this._campo.value = '';
          this._guardar();
          this._lista.scrollTop = this._lista.scrollHeight;
        } else if (e.key === 'Escape') this._campo.blur();
      });
      this._pintar();
    },

    _pintar() {
      this._lista.textContent = '';
      const faltan = this._items.filter((x) => !x.hecho).length;
      this._cuenta.textContent = this._items.length ? String(faltan) : '';
      if (!this._items.length) { this._lista.append(W.crear('div', 'pend-vacio', 'Sin pendientes')); return; }
      this._items.forEach((it, i) => {
        const fila = W.crear('div', 'pend-fila' + (it.hecho ? ' hecho' : ''));
        const caja = W.crear('button', 'pend-check', it.hecho ? '✓' : '');
        caja.type = 'button';
        caja.setAttribute('role', 'checkbox');
        caja.setAttribute('aria-checked', it.hecho ? 'true' : 'false');
        caja.setAttribute('aria-label', it.t);
        caja.addEventListener('click', () => { it.hecho = !it.hecho; this._guardar(); });
        const texto = W.crear('span', 'pend-texto', it.t);
        texto.title = it.t;
        const quitar = W.crear('button', 'pend-quitar', '×');
        quitar.type = 'button'; quitar.title = 'Quitar'; quitar.setAttribute('aria-label', 'Quitar ' + it.t);
        quitar.addEventListener('click', () => { this._items.splice(i, 1); this._guardar(); });
        fila.append(caja, texto, quitar);
        this._lista.append(fila);
      });
    },

    _guardar() {
      this._api.guardarOpciones({ items: this._items.map((x) => ({ t: x.t, hecho: x.hecho })) });
      this._pintar();
    },

    menu() {
      const hechos = this._items ? this._items.filter((x) => x.hecho).length : 0;
      return hechos ? [{ texto: 'Borrar los terminados (' + hechos + ')', accion: () => { this._items = this._items.filter((x) => !x.hecho); this._guardar(); } }] : [];
    },

    desmontar() {},
  });
}());
