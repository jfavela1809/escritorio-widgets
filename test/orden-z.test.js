'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ordenZ = require('../src/main/orden-z');

function hwndBuf(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }

function apiFalsa({ progmanes, prev }) {
  const vivos = new Set(progmanes);
  const llamadas = [];
  let actual = progmanes[0];
  return {
    llamadas,
    matar(h) { vivos.delete(h); actual = [...vivos][0] || 0; },
    FindWindowW: () => actual,
    IsWindow: (h) => vivos.has(h),
    GetWindow: (h) => (vivos.has(h) ? prev() : 0),
    SetWindowPos: (h, after) => { llamadas.push(after); return true; },
  };
}

test('coloca la ventana justo encima de Progman', () => {
  const api = apiFalsa({ progmanes: [100], prev: () => 555 });
  const oz = ordenZ.crear(hwndBuf(7), { api });
  oz.mantener();
  assert.deepStrictEqual(api.llamadas, [555]);
});

test('no corrige si ya está encima de Progman', () => {
  const api = apiFalsa({ progmanes: [100], prev: () => 7 });
  ordenZ.crear(hwndBuf(7), { api }).mantener();
  assert.deepStrictEqual(api.llamadas, []);
});

test('Explorador reiniciado: busca el Progman nuevo y nunca manda HWND_TOP por un Progman muerto', () => {
  const api = apiFalsa({ progmanes: [100, 200], prev: () => 555 });
  const oz = ordenZ.crear(hwndBuf(7), { api });
  api.matar(100);
  oz.mantener();
  assert.deepStrictEqual(api.llamadas, [555]);
});

test('sin ningún Progman vivo no toca la ventana', () => {
  const api = apiFalsa({ progmanes: [100], prev: () => 555 });
  const oz = ordenZ.crear(hwndBuf(7), { api });
  api.matar(100);
  oz.mantener();
  assert.deepStrictEqual(api.llamadas, []);
});

test('con dos monitores: deja las dos ventanas justo encima de Progman y no las intercambia', () => {
  // Pila de arriba abajo: [app, ...nuestras, progman]; GetWindow(h, PREV) devuelve la de arriba.
  let pila = [555, 100];
  const llamadas = [];
  const api = {
    FindWindowW: () => 100, IsWindow: () => true,
    GetWindow: (h) => { const i = pila.indexOf(h); return i > 0 ? pila[i - 1] : 0; },
    SetWindowPos: (h, after) => {
      llamadas.push([h, after]);
      pila = pila.filter((x) => x !== h);
      pila.splice(pila.indexOf(after) + 1, 0, h);
      return true;
    },
  };
  const oz = ordenZ.crear(() => [hwndBuf(7), hwndBuf(8)], { api });
  oz.mantener();
  assert.deepStrictEqual(pila, [555, 7, 8, 100]);
  oz.mantener(); oz.mantener();
  assert.strictEqual(llamadas.length, 2, 'ya en su lugar: no se vuelve a mover');
});
