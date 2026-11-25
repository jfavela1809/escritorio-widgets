'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const V = require('../src/main/vista');

test('cada modo dice qué se oculta', () => {
  assert.deepStrictEqual(V.aplicar('ambos'), { appOculta: false, mostrarWindows: true });
  assert.deepStrictEqual(V.aplicar('app'), { appOculta: false, mostrarWindows: false });
  assert.deepStrictEqual(V.aplicar('windows'), { appOculta: true, mostrarWindows: true });
  assert.strictEqual(V.aplicar('nada'), null);
});

test('el modo actual sale de la app y de Windows', () => {
  assert.strictEqual(V.modoDe(false, true), 'ambos');
  assert.strictEqual(V.modoDe(false, false), 'app');
  assert.strictEqual(V.modoDe(true, true), 'windows');
  assert.strictEqual(V.modoDe(true, false), null); // no se ve nada: ningún modo marcado
  assert.strictEqual(V.modoDe(false, null), 'ambos');
  for (const m of V.MODOS) { const a = V.aplicar(m); assert.strictEqual(V.modoDe(a.appOculta, a.mostrarWindows), m); }
});

test('se guarda y se lee; un archivo dañado o ausente es "app visible"', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-'));
  const f = path.join(dir, 'vista.json');
  assert.deepStrictEqual(V.cargar(f), { appOculta: false });
  V.guardar(f, { appOculta: true });
  assert.deepStrictEqual(V.cargar(f), { appOculta: true });
  fs.writeFileSync(f, '{roto');
  assert.deepStrictEqual(V.cargar(f), { appOculta: false });
  fs.rmSync(dir, { recursive: true, force: true });
});
