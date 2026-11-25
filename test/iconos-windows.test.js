'use strict';
const test = require('node:test');
const assert = require('node:assert');
const IW = require('../src/main/iconos-windows');
const rutas = require('../src/main/rutas');

// Árbol falso de ventanas: { id: { cls, padre } }
function apiFalsa(ventanas, visible) {
  const posts = [];
  const hijos = (padre, cls) => Object.keys(ventanas).map(Number).filter((id) => ventanas[id].padre === padre && ventanas[id].cls === cls);
  return {
    posts,
    FindWindowW: (cls) => hijos(0, cls)[0] || 0,
    FindWindowExW: (padre, after, cls) => { const l = hijos(padre, cls); const i = after ? l.indexOf(after) + 1 : 0; return l[i] || 0; },
    IsWindowVisible: () => visible.v,
    PostMessageW: (h, msg, w) => { posts.push([h, msg, w]); visible.v = !visible.v; return true; },
  };
}

test('encuentra DefView bajo Progman y oculta los iconos con el comando de Windows', () => {
  const vis = { v: true };
  const api = apiFalsa({ 1: { cls: 'Progman', padre: 0 }, 2: { cls: 'SHELLDLL_DefView', padre: 1 }, 3: { cls: 'SysListView32', padre: 2 } }, vis);
  const iw = IW.crear({ api });
  assert.strictEqual(iw.visibles(), true);
  assert.strictEqual(iw.fijar(false), false);
  assert.deepStrictEqual(api.posts, [[2, 0x0111, IW.CMD_ALTERNAR_ICONOS]]);
  assert.strictEqual(iw.fijar(false), false); // ya ocultos: no vuelve a alternar
  assert.strictEqual(api.posts.length, 1);
});

test('encuentra DefView bajo una WorkerW', () => {
  const vis = { v: false };
  const api = apiFalsa({ 1: { cls: 'Progman', padre: 0 }, 5: { cls: 'WorkerW', padre: 0 }, 6: { cls: 'WorkerW', padre: 0 },
    7: { cls: 'SHELLDLL_DefView', padre: 6 }, 8: { cls: 'SysListView32', padre: 7 } }, vis);
  assert.strictEqual(IW.crear({ api }).fijar(true), true);
  assert.strictEqual(api.posts[0][0], 7);
});

test('sin escritorio no hace nada', () => {
  const api = apiFalsa({}, { v: true });
  const iw = IW.crear({ api });
  assert.strictEqual(iw.visibles(), null);
  assert.strictEqual(iw.fijar(false), null);
  assert.strictEqual(api.posts.length, 0);
});

test('icono de un acceso: .ico propio, luego destino, luego el .lnk', () => {
  const lnk = 'C:\\Users\\J\\Desktop\\Copilot.lnk';
  assert.deepStrictEqual(rutas.fuentesDeIcono(lnk, { icon: 'C:\\x\\Copilot.ico', iconIndex: 0, target: 'C:\\e\\msedge_proxy.exe' }),
    ['C:\\x\\Copilot.ico', 'C:\\e\\msedge_proxy.exe', lnk]);
  // .dll con índice: no sirve con getFileIcon; se usa el destino.
  assert.deepStrictEqual(rutas.fuentesDeIcono(lnk, { icon: 'C:\\WINDOWS\\system32\\imageres.dll', iconIndex: 144, target: 'C:\\s\\a.bat' }),
    ['C:\\s\\a.bat', lnk]);
  // Carpeta de red como destino.
  assert.deepStrictEqual(rutas.fuentesDeIcono(lnk, { icon: '', target: '\\\\servidor\\Reportes' }),
    ['\\\\servidor\\Reportes', lnk]);
  assert.deepStrictEqual(rutas.fuentesDeIcono(lnk, null), [lnk]);
});
