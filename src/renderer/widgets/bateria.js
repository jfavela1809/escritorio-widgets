'use strict';
// Batería (2×1): porcentaje, si está cargando y el tiempo que le queda. Lo lee el proceso
// principal (GetSystemPowerStatus) cada 30 s, solo mientras el widget está montado.
(function () {
  const W = window.EscritorioWidgets;
  const INTERVALO_MS = 30000;

  function tiempo(min) {
    if (!(min > 0)) return '';
    const hh = Math.floor(min / 60); const mm = min % 60;
    return hh ? `${hh} h ${String(mm).padStart(2, '0')} min` : `${mm} min`;
  }

  // Texto de estado a partir de lo que devuelve bateria:leer.
  function estadoTexto(b) {
    if (!b || !b.hay) return 'Sin batería';
    if (b.cargando) return 'Cargando';
    if (b.enchufada) return 'Conectada';
    // Solo el tiempo ("3 h 05 min"): en 2×1 no cabe más; el detalle va en el title.
    return tiempo(b.minutos) || 'Con batería';
  }

  W.registrar({
    id: 'bateria',
    nombre: 'Batería',
    ancho: 2,
    alto: 1,
    estadoTexto,

    montar(el, opciones, api) {
      this._activo = true;
      const caja = W.crear('div', 'bat');
      const pila = W.crear('div', 'bat-pila');
      this._relleno = W.crear('div', 'bat-relleno');
      pila.append(this._relleno);
      this._rayo = W.crear('div', 'bat-rayo', '⚡');
      pila.append(this._rayo);
      const textos = W.crear('div', 'bat-textos');
      this._pct = W.crear('div', 'bat-pct', '--%');
      this._estado = W.crear('div', 'bat-estado', '');
      textos.append(this._pct, this._estado);
      caja.append(pila, textos);
      el.append(caja);
      if (api && api.vistaPrevia) { this._pintar({ hay: true, porcentaje: 64, enchufada: false, cargando: false, minutos: 185 }); return; }
      this._leer();
    },

    async _leer() {
      let b = null;
      try { b = await window.escritorio.bateria.leer(); } catch (_) { b = null; }
      if (!this._activo) return;
      this._pintar(b);
      this._temporizador = setTimeout(() => this._leer(), INTERVALO_MS);
    },

    _pintar(b) {
      const hay = !!(b && b.hay);
      const pct = hay ? b.porcentaje : 0;
      this._pct.textContent = hay ? pct + '%' : '—';
      this._estado.textContent = estadoTexto(b);
      const t = hay && !b.enchufada ? tiempo(b.minutos) : '';
      this._pct.parentNode.title = hay ? pct + '% · ' + (t ? 'quedan ' + t : estadoTexto(b)) : 'Sin batería';
      this._relleno.style.width = pct + '%';
      this._relleno.className = 'bat-relleno' + (pct <= 20 ? ' bajo' : pct <= 50 ? ' medio' : '');
      this._rayo.hidden = !(hay && (b.cargando || b.enchufada));
    },

    desmontar() {
      this._activo = false;
      clearTimeout(this._temporizador);
      this._temporizador = null;
    },
  });
}());
