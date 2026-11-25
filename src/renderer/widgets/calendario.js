'use strict';
// Calendario (2×2): mes actual con hoy resaltado; la semana empieza en lunes (es-MX).
// Se vuelve a dibujar a medianoche con un solo setTimeout.
(function () {
  const W = window.EscritorioWidgets;
  const F = window.EscritorioFormatos;

  W.registrar({
    id: 'calendario',
    nombre: 'Calendario',
    ancho: 2,
    alto: 2,

    montar(el, opciones, api) {
      this._activo = true;
      this._caja = W.crear('div', 'calendario');
      el.append(this._caja);
      this._pintar();
      if (!(api && api.vistaPrevia)) this._programar();
    },

    _pintar() {
      const hoy = new Date();
      const anio = hoy.getFullYear(); const mes = hoy.getMonth();
      this._caja.textContent = '';
      this._caja.append(W.crear('div', 'cal-titulo', F.mesAnio(anio, mes)));
      const rejilla = W.crear('div', 'cal-rejilla');
      F.LETRAS_SEMANA.forEach((l, i) => rejilla.append(W.crear('div', 'cal-letra' + (i === 6 ? ' cal-domingo' : ''), l)));
      for (const semana of F.matrizMes(anio, mes)) {
        semana.forEach((dia, i) => {
          const clase = 'cal-dia' + (i === 6 ? ' cal-domingo' : '') + (dia === hoy.getDate() ? ' cal-hoy' : '');
          rejilla.append(W.crear('div', clase, dia == null ? '' : String(dia)));
        });
      }
      this._caja.append(rejilla);
    },

    _programar() {
      clearTimeout(this._temporizador);
      this._temporizador = setTimeout(() => {
        if (!this._activo) return;
        this._pintar();
        this._programar();
      }, F.msHastaMedianoche(new Date()));
    },

    desmontar() {
      this._activo = false;
      clearTimeout(this._temporizador);
      this._temporizador = null;
    },
  });
}());
