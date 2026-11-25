'use strict';
// Batería de la laptop con GetSystemPowerStatus (kernel32, vía koffi): barato, sin PowerShell.
// Sin importar electron; la API se puede inyectar en las pruebas.

function cargarApi() {
  const koffi = require('koffi');
  const kernel32 = koffi.load('kernel32.dll');
  const Estado = koffi.struct('SYSTEM_POWER_STATUS_EW', {
    ACLineStatus: 'uint8', BatteryFlag: 'uint8', BatteryLifePercent: 'uint8', SystemStatusFlag: 'uint8',
    BatteryLifeTime: 'uint32', BatteryFullLifeTime: 'uint32',
  });
  const f = kernel32.func('bool __stdcall GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS_EW *s)');
  return {
    leer() {
      const s = {};
      return f(s) ? s : null;
    },
  };
}

// Convierte la estructura de Windows en { hay, porcentaje, cargando, enchufada, minutos }.
// hay = false: no hay batería (PC de escritorio) o Windows no lo sabe.
function interpretar(s) {
  if (!s) return { hay: false };
  const sinBateria = (s.BatteryFlag & 128) !== 0 || s.BatteryFlag === 255;
  const pct = s.BatteryLifePercent;
  if (sinBateria || pct === 255) return { hay: false };
  const segundos = s.BatteryLifeTime;
  return {
    hay: true,
    porcentaje: Math.max(0, Math.min(100, pct)),
    enchufada: s.ACLineStatus === 1,
    cargando: (s.BatteryFlag & 8) !== 0 || (s.ACLineStatus === 1 && pct < 100),
    // 0xFFFFFFFF = Windows no lo sabe (p. ej. conectada o recién desconectada).
    minutos: segundos === 0xFFFFFFFF || segundos == null ? null : Math.round(segundos / 60),
  };
}

function crear({ api } = {}) {
  let W = api || null;
  return {
    leer() {
      try {
        if (!W) W = cargarApi();
        return interpretar(W.leer());
      } catch (_) {
        return { hay: false };
      }
    },
  };
}

module.exports = { crear, interpretar };
