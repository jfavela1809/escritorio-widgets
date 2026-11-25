'use strict';
// Cuadro de prueba: al pasar el ratón pide ignorar=false; fuera de él, ignorar=true.
const caja = document.getElementById('caja');
let ignorando = true;
let movimientos = 0;
function fijar(v) { if (v !== ignorando) { ignorando = v; window.spike.ignorar(v); } }
document.addEventListener('mousemove', (e) => {
  movimientos++;
  const dentro = e.target === caja;
  fijar(!dentro);
  window.spike.raton({ n: movimientos, dentro, x: e.clientX, y: e.clientY });
});
