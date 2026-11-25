'use strict';
// Búsqueda de accesos (también los que están dentro de carpetas y en otros monitores).
// Sin acentos ni mayúsculas: "word" encuentra "Word", "camara" encuentra "Cámara".
// Se carga como <script> (global Buscar) y con require() en las pruebas.
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Buscar = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  const sinAcentos = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  // Puntaje de un nombre para una palabra: empieza igual > empieza una palabra > la contiene.
  function puntaje(nombre, palabra) {
    if (nombre.startsWith(palabra)) return 3;
    if (nombre.split(/[\s._\-()]+/).some((p) => p.startsWith(palabra))) return 2;
    return nombre.includes(palabra) ? 1 : 0;
  }

  // lista: [{ nombre, carpeta? , ... }]. Todas las palabras deben aparecer en el nombre o en el
  // nombre de su carpeta. Devuelve hasta `max` resultados, los mejores primero.
  function filtrar(lista, consulta, max = 8) {
    const palabras = sinAcentos(consulta).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    const salida = [];
    lista.forEach((r, i) => {
      const nombre = sinAcentos(r.nombre);
      const carpeta = sinAcentos(r.carpeta);
      let total = 0;
      for (const p of palabras) {
        const enNombre = puntaje(nombre, p);
        const enCarpeta = carpeta && carpeta.includes(p) ? 0.5 : 0;
        if (!enNombre && !enCarpeta) return;
        total += Math.max(enNombre, enCarpeta);
      }
      salida.push({ r, total, i });
    });
    salida.sort((a, b) => b.total - a.total || a.r.nombre.length - b.r.nombre.length || a.i - b.i);
    return salida.slice(0, max).map((x) => x.r);
  }

  return { filtrar, sinAcentos };
}));
