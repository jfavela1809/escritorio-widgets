'use strict';
// Enlaces (2×2): accesos a páginas web. Clic abre la página en el navegador de Windows (el
// proceso principal solo abre http/https guardados aquí). Sin internet: el icono es la inicial.
(function () {
  const W = window.EscritorioWidgets;
  const MAX_ITEMS = 12;
  const COLORES = ['#4f8ff7', '#34a853', '#f4a400', '#ea4335', '#a142f4', '#ff6d9b', '#12a4af', '#7a869a'];

  // "google.com" -> "https://google.com/". null si no es una página http/https.
  function normalizarUrl(t) {
    let s = String(t || '').trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch (_) { return null; }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname || (!u.hostname.includes('.') && u.hostname !== 'localhost')) return null;
    if (u.username || u.password) return null;
    return u.href.length <= 2000 ? u.href : null;
  }

  function nombreDeUrl(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').split('.')[0].replace(/^./, (c) => c.toUpperCase()); } catch (_) { return 'Página'; }
  }

  function limpiar(items) {
    const salida = [];
    for (const it of Array.isArray(items) ? items : []) {
      const url = normalizarUrl(it && it.url);
      if (!url) continue;
      const nombre = it && typeof it.nombre === 'string' ? it.nombre.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40) : '';
      salida.push({ nombre: nombre || nombreDeUrl(url), url });
      if (salida.length >= MAX_ITEMS) break;
    }
    return salida;
  }

  const colorDe = (t) => { let n = 0; for (const c of t) n = (n * 31 + c.charCodeAt(0)) >>> 0; return COLORES[n % COLORES.length]; };

  W.registrar({
    id: 'enlaces',
    nombre: 'Enlaces web',
    ancho: 2,
    alto: 2,
    normalizarUrl,
    limpiar,

    montar(el, opciones, api) {
      this._api = api;
      this._activo = true;
      this._previa = !!(api && api.vistaPrevia);
      this._items = this._previa
        ? limpiar([{ nombre: 'Google', url: 'google.com' }, { nombre: 'YouTube', url: 'youtube.com' }, { nombre: 'Gmail', url: 'mail.google.com' }])
        : limpiar(opciones && opciones.items);
      this._el = el;
      this._caja = W.crear('div', 'enl');
      el.append(this._caja);
      this._pintar();
    },

    _pintar() {
      this._caja.textContent = '';
      for (const [i, it] of this._items.entries()) {
        const b = W.crear('button', 'enl-item');
        b.type = 'button'; b.title = it.nombre + '\n' + it.url;
        const letra = W.crear('span', 'enl-letra', it.nombre.charAt(0).toUpperCase());
        letra.style.background = colorDe(it.url);
        const quitar = W.crear('span', 'enl-quitar', '×');
        quitar.title = 'Quitar enlace';
        b.append(letra, W.crear('span', 'enl-nombre', it.nombre), quitar);
        b.addEventListener('click', async (e) => {
          if (this._previa) return;
          if (e.target === quitar) { this._items.splice(i, 1); this._guardar(); return; }
          let r = null;
          try { r = await window.escritorio.abrirWeb(it.url); } catch (_) { r = null; }
          if (!r || !r.ok) this._api.avisar('No se pudo abrir ' + it.nombre);
        });
        this._caja.append(b);
      }
      if (this._items.length < MAX_ITEMS) {
        const mas = W.crear('button', 'enl-item enl-mas');
        mas.type = 'button'; mas.title = 'Agregar enlace';
        mas.append(W.crear('span', 'enl-letra', '+'), W.crear('span', 'enl-nombre', 'Agregar'));
        mas.addEventListener('click', () => { if (!this._previa) this._abrirFormulario(); });
        this._caja.append(mas);
      }
    },

    _guardar() {
      this._api.guardarOpciones({ items: this._items.map((x) => ({ nombre: x.nombre, url: x.url })) });
      this._pintar();
    },

    menu() {
      return this._items.length < MAX_ITEMS ? [{ texto: 'Agregar enlace…', accion: () => this._abrirFormulario() }] : [];
    },

    // Cuadro para escribir la dirección (y un nombre opcional).
    _abrirFormulario() {
      if (this._form || !this._activo) return;
      const telon = W.crear('div', 'buscador-telon interactivo');
      const caja = W.crear('div', 'buscador interactivo');
      const url = W.crear('input', 'buscador-campo');
      url.type = 'text'; url.maxLength = 2000; url.placeholder = 'Dirección, p. ej. google.com';
      url.setAttribute('aria-label', 'Dirección de la página');
      const nombre = W.crear('input', 'buscador-campo');
      nombre.type = 'text'; nombre.maxLength = 40; nombre.placeholder = 'Nombre (opcional)';
      nombre.setAttribute('aria-label', 'Nombre del enlace');
      const boton = W.crear('button', 'buscador-boton', 'Agregar');
      boton.type = 'button';
      const fila1 = W.crear('div', 'buscador-fila'); fila1.append(url);
      const fila2 = W.crear('div', 'buscador-fila enl-fila2'); fila2.append(nombre, boton);
      const nota = W.crear('div', 'buscador-nota', '');
      caja.append(fila1, fila2, nota);
      document.body.append(telon, caja);
      const r = this._el.getBoundingClientRect();
      const ancho = 340;
      caja.style.width = ancho + 'px';
      caja.style.left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)) + 'px';
      const abajo = r.bottom + 8;
      caja.style.top = (abajo + 140 > window.innerHeight ? Math.max(8, r.top - 8 - caja.offsetHeight) : abajo) + 'px';
      this._form = { telon, caja };
      const agregar = () => {
        const u = normalizarUrl(url.value);
        if (!u) { nota.textContent = 'Escribe una dirección web válida (p. ej. google.com)'; url.focus(); return; }
        const n = nombre.value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40) || nombreDeUrl(u);
        this._items.push({ nombre: n, url: u });
        this._cerrarFormulario();
        this._guardar();
      };
      boton.addEventListener('click', agregar);
      for (const c of [url, nombre]) {
        c.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') agregar();
          else if (e.key === 'Escape') this._cerrarFormulario();
        });
      }
      telon.addEventListener('pointerdown', () => this._cerrarFormulario());
      telon.addEventListener('contextmenu', (e) => { e.preventDefault(); this._cerrarFormulario(); });
      if (window.__escritorio && window.__escritorio.pedirTeclado) window.__escritorio.pedirTeclado();
      url.focus();
    },

    _cerrarFormulario() {
      const f = this._form;
      if (!f) return;
      this._form = null;
      f.telon.remove(); f.caja.remove();
    },

    desmontar() {
      this._activo = false;
      this._cerrarFormulario();
    },
  });
}());
