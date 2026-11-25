'use strict';
// Formatos de fecha y hora en español (es-MX) para los widgets. Lógica pura, sin DOM:
// se carga como <script> (global EscritorioFormatos) y con require() en las pruebas.
// Se usan tablas propias en vez de Intl para que el resultado sea idéntico en cualquier equipo.
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.EscritorioFormatos = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  // La semana empieza en lunes (es-MX para calendarios de trabajo).
  const LETRAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  const diaSemana = (d) => DIAS[d.getDay()];
  const fechaCorta = (d) => `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  const mesAnio = (anio, mes) => `${MESES[mes]} ${anio}`;

  // 24 horas -> { hora: "10:42", sufijo: "a. m." } (12 a. m. = medianoche, 12 p. m. = mediodía).
  function hora12(d) {
    const h = d.getHours();
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return { hora: `${h12}:${String(d.getMinutes()).padStart(2, '0')}`, sufijo: h < 12 ? 'a. m.' : 'p. m.' };
  }

  // Milisegundos hasta el inicio del siguiente minuto (con un margen para no caer justo antes).
  function msHastaSiguienteMinuto(ahoraMs, margen = 30) {
    return 60000 - (ahoraMs % 60000) + margen;
  }

  // Milisegundos hasta la próxima medianoche local.
  function msHastaMedianoche(d, margen = 1000) {
    const sig = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
    return Math.max(1000, sig.getTime() - d.getTime() + margen);
  }

  // Matriz del mes: arreglo de semanas (lunes a domingo); null en los huecos antes y después.
  function matrizMes(anio, mes) {
    const primero = new Date(anio, mes, 1);
    const diasMes = new Date(anio, mes + 1, 0).getDate();
    const hueco = (primero.getDay() + 6) % 7; // lunes = 0
    const celdas = [];
    for (let i = 0; i < hueco; i++) celdas.push(null);
    for (let d = 1; d <= diasMes; d++) celdas.push(d);
    while (celdas.length % 7 !== 0) celdas.push(null);
    const semanas = [];
    for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
    return semanas;
  }

  // "actualizado hace 5 min" a partir de la hora de la lectura y la actual (ambas en ms).
  function textoActualizado(actualizadoMs, ahoraMs) {
    const min = Math.floor((ahoraMs - actualizadoMs) / 60000);
    if (!(min >= 1)) return 'actualizado ahora';
    if (min < 60) return `actualizado hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `actualizado hace ${h} h`;
    const dias = Math.floor(h / 24);
    return `actualizado hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }

  return {
    DIAS, MESES, MESES_CORTOS, LETRAS_SEMANA, diaSemana, fechaCorta, mesAnio, hora12,
    msHastaSiguienteMinuto, msHastaMedianoche, matrizMes, textoActualizado,
  };
}));
