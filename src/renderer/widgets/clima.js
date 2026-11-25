'use strict';
// Clima (4×1): píldora azul con icono, temperatura, ciudad y hora del atardecer.
// El renderer no hace fetch: pide todo al proceso principal (window.escritorio.clima), que consulta
// Open-Meteo, guarda el último dato con su hora y lo devuelve aunque no haya red.
// Se refresca cada 30 min mientras el widget está montado. "Cambiar ciudad…" abre un cuadro de búsqueda.
(function () {
  const W = window.EscritorioWidgets;
  const F = window.EscritorioFormatos;
  const REFRESCO_MS = 30 * 60 * 1000;
  const REPINTAR_MS = 60 * 1000; // para que "actualizado hace X" avance

  W.registrar({
    id: 'clima',
    nombre: 'Clima',
    ancho: 4,
    alto: 1,

    montar(el, opciones, api) {
      this._activo = true;
      this._api = api;
      this._n = 0;
      this._r = null;
      this._icono = W.crear('div', 'clima-icono', '🌡️');
      this._temp = W.crear('div', 'clima-temp', '--°');
      this._ciudad = W.crear('div', 'clima-ciudad', 'Cargando…');
      this._atardecer = W.crear('div', 'clima-atardecer');
      this._estado = W.crear('div', 'clima-estado');
      const texto = W.crear('div', 'clima-texto');
      texto.append(this._ciudad, this._atardecer, this._estado);
      const caja = W.crear('div', 'clima');
      caja.append(this._icono, this._temp, texto);
      el.append(caja);
      this._el = el;

      if (api && api.vistaPrevia) {
        this._icono.textContent = '⛅'; this._temp.textContent = '15°';
        this._ciudad.textContent = 'Ciudad Juárez';
        this._atardecer.textContent = 'Atardecer a las 5:02 p. m.';
        return;
      }
      this._cargar(false);
      this._temporizador = setInterval(() => this._cargar(false), REFRESCO_MS);
      this._repintador = setInterval(() => this._pintar(), REPINTAR_MS);
    },

    async _cargar(forzar) {
      const n = ++this._n;
      let r;
      try { r = await window.escritorio.clima.obtener(forzar); } catch (_) {
        r = { ciudad: this._r ? this._r.ciudad : '', dato: this._r ? this._r.dato : null, error: 'Sin conexión', desactualizado: !!(this._r && this._r.dato) };
      }
      if (!this._activo || n !== this._n) return;
      this._r = r;
      this._pintar();
    },

    _pintar() {
      const r = this._r;
      if (!r || !this._activo) return;
      this._ciudad.textContent = r.ciudad || '';
      const d = r.dato;
      this._icono.textContent = d ? d.icono : '🌡️';
      this._temp.textContent = d ? d.temperatura + '°' : '--°';
      this._atardecer.textContent = d ? d.atardecer : '';
      if (!d) this._atardecer.textContent = r.error ? 'Sin datos del clima' : '';
      let estado = '';
      if (r.error) estado = d ? `${r.error} · ${F.textoActualizado(d.actualizado, Date.now())}` : r.error;
      this._estado.textContent = estado;
      this._estado.hidden = !estado;
      if (d) this._el.title = d.descripcion;
    },

    menu() {
      return [
        { texto: 'Cambiar ciudad…', accion: () => this._abrirBuscador() },
        { texto: 'Actualizar clima', accion: () => this._cargar(true) },
      ];
    },

    // ------------------------------------------------------------ buscador de ciudad
    _abrirBuscador() {
      if (this._buscador || !this._activo) return;
      const telon = W.crear('div', 'buscador-telon interactivo');
      const caja = W.crear('div', 'buscador interactivo');
      const campo = W.crear('input', 'buscador-campo');
      campo.type = 'text'; campo.maxLength = 60; campo.placeholder = 'Buscar ciudad…';
      campo.setAttribute('aria-label', 'Buscar ciudad');
      const boton = W.crear('button', 'buscador-boton', 'Buscar');
      boton.type = 'button';
      const fila = W.crear('div', 'buscador-fila');
      fila.append(campo, boton);
      const lista = W.crear('div', 'buscador-lista');
      const nota = W.crear('div', 'buscador-nota', 'Escribe el nombre y pulsa Enter');
      caja.append(fila, lista, nota);
      document.body.append(telon, caja);
      const r = this._el.getBoundingClientRect();
      const ancho = 340;
      caja.style.width = ancho + 'px';
      caja.style.left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)) + 'px';
      const abajo = r.bottom + 8;
      caja.style.top = (abajo + 220 > window.innerHeight ? Math.max(8, r.top - 8 - caja.offsetHeight) : abajo) + 'px';
      this._buscador = { telon, caja };

      const buscar = async () => {
        const t = campo.value.trim();
        if (t.length < 2) { nota.textContent = 'Escribe al menos 2 letras'; return; }
        nota.textContent = 'Buscando…'; lista.textContent = '';
        let res;
        try { res = await window.escritorio.clima.buscar(t); } catch (_) { res = { ciudades: [], error: 'No se pudo buscar' }; }
        if (this._buscador == null) return;
        if (res.error) { nota.textContent = res.error === 'Sin conexión' ? 'Sin conexión: no se puede buscar ahora' : res.error; return; }
        if (!res.ciudades.length) { nota.textContent = 'No se encontró esa ciudad'; return; }
        nota.textContent = '';
        for (const c of res.ciudades) {
          const b = W.crear('button', 'buscador-opcion');
          b.type = 'button';
          b.append(W.crear('span', 'buscador-nombre', c.nombre), W.crear('span', 'buscador-detalle', c.detalle));
          b.addEventListener('click', async () => {
            this._cerrarBuscador();
            try {
              const nuevo = await window.escritorio.clima.fijarCiudad({ nombre: c.nombre, lat: c.lat, lon: c.lon });
              if (!this._activo) return;
              this._n++;
              this._r = nuevo;
              this._pintar();
            } catch (_) { this._api.avisar('No se pudo cambiar la ciudad'); }
          });
          lista.append(b);
        }
      };
      boton.addEventListener('click', buscar);
      campo.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') buscar();
        else if (e.key === 'Escape') this._cerrarBuscador();
      });
      telon.addEventListener('pointerdown', () => this._cerrarBuscador());
      telon.addEventListener('contextmenu', (e) => { e.preventDefault(); this._cerrarBuscador(); });
      campo.focus();
    },

    _cerrarBuscador() {
      const b = this._buscador;
      if (!b) return;
      this._buscador = null;
      b.telon.remove(); b.caja.remove();
    },

    desmontar() {
      this._activo = false;
      this._cerrarBuscador();
      clearInterval(this._temporizador);
      clearInterval(this._repintador);
      this._temporizador = null; this._repintador = null;
    },
  });
}());
