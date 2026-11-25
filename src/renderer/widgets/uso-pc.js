'use strict';
// Uso de PC (2×1): barras de RAM, CPU y disco C:. Pide los datos al proceso principal por IPC cada 2 s
// y solo mientras el widget está montado (un setTimeout encadenado: nunca se encima una lectura con otra).
(function () {
  const W = window.EscritorioWidgets;
  const INTERVALO_MS = 2000;

  function fila(nombre) {
    const raiz = W.crear('div', 'uso-fila');
    const barra = W.crear('div', 'uso-barra');
    const relleno = W.crear('div', 'uso-relleno');
    barra.append(relleno);
    const valor = W.crear('div', 'uso-valor', '—');
    raiz.append(W.crear('div', 'uso-nombre', nombre), barra, valor);
    return { raiz, relleno, valor };
  }

  function poner(f, pct, titulo) {
    if (pct == null) { f.relleno.style.width = '0%'; f.valor.textContent = '—'; f.raiz.title = ''; return; }
    const p = Math.max(0, Math.min(100, pct));
    f.relleno.style.width = p + '%';
    f.relleno.classList.toggle('alto', p >= 85);
    f.relleno.classList.toggle('medio', p >= 65 && p < 85);
    f.valor.textContent = Math.round(p) + ' %';
    f.raiz.title = titulo || '';
  }

  const gb = (n) => (n / 1024 ** 3).toFixed(1).replace(/\.0$/, '') + ' GB';

  W.registrar({
    id: 'uso-pc',
    nombre: 'Uso de PC',
    ancho: 2,
    alto: 1,

    montar(el, opciones, api) {
      this._activo = true;
      this._ram = fila('RAM'); this._cpu = fila('CPU'); this._disco = fila('C:');
      const caja = W.crear('div', 'uso');
      caja.append(this._ram.raiz, this._cpu.raiz, this._disco.raiz);
      el.append(caja);
      if (api && api.vistaPrevia) {
        poner(this._ram, 62); poner(this._cpu, 18); poner(this._disco, 71);
        return;
      }
      this._leer(true);
    },

    async _leer(reiniciar) {
      if (!this._activo) return;
      try {
        const r = await window.escritorio.sistema.leer(reiniciar);
        if (!this._activo) return;
        poner(this._ram, r.ram.pct, `RAM: ${gb(r.ram.usado)} de ${gb(r.ram.total)}`);
        poner(this._cpu, r.cpu.pct, 'Procesador');
        poner(this._disco, r.disco ? r.disco.pct : null, r.disco ? `Disco C: ${gb(r.disco.usado)} de ${gb(r.disco.total)} (${gb(r.disco.libre)} libres)` : '');
      } catch (_) { /* sin lectura: se conserva lo último */ }
      if (!this._activo) return;
      this._temporizador = setTimeout(() => this._leer(false), INTERVALO_MS);
    },

    desmontar() {
      this._activo = false;
      clearTimeout(this._temporizador);
      this._temporizador = null;
    },
  });
}());
