'use strict';
// Reloj y fecha (2×2): día de la semana, "24 NOV" y la hora grande con a. m./p. m.
// Se sincroniza al minuto: un solo setTimeout al inicio del siguiente minuto (no hay intervalos de 100 ms).
(function () {
  const W = window.EscritorioWidgets;
  const F = window.EscritorioFormatos;

  W.registrar({
    id: 'reloj',
    nombre: 'Reloj y fecha',
    ancho: 2,
    alto: 2,

    montar(el, opciones, api) {
      this._activo = true;
      this._dia = W.crear('div', 'reloj-dia');
      this._fecha = W.crear('div', 'reloj-fecha');
      this._hora = W.crear('span', 'reloj-hora');
      this._sufijo = W.crear('span', 'reloj-sufijo');
      const fila = W.crear('div', 'reloj-fila');
      fila.append(this._hora, this._sufijo);
      const caja = W.crear('div', 'reloj');
      caja.append(this._dia, this._fecha, fila);
      el.append(caja);
      this._pintar();
      if (!(api && api.vistaPrevia)) this._programar();
    },

    _pintar() {
      const ahora = new Date();
      const h = F.hora12(ahora);
      this._dia.textContent = F.diaSemana(ahora);
      this._fecha.textContent = F.fechaCorta(ahora);
      this._hora.textContent = h.hora;
      this._sufijo.textContent = h.sufijo;
    },

    _programar() {
      clearTimeout(this._temporizador);
      this._temporizador = setTimeout(() => {
        if (!this._activo) return;
        this._pintar();
        this._programar();
      }, F.msHastaSiguienteMinuto(Date.now()));
    },

    desmontar() {
      this._activo = false;
      clearTimeout(this._temporizador);
      this._temporizador = null;
    },
  });
}());
