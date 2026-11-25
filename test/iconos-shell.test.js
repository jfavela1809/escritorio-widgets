'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const IS = require('../src/main/iconos-shell');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ew-iconos-'));

test('la clave cambia con la fecha y no distingue mayúsculas', () => {
  assert.strictEqual(IS.claveDe('C:\\A\\b.lnk', 1), IS.claveDe('c:\\a\\B.LNK', 1));
  assert.notStrictEqual(IS.claveDe('C:\\A\\b.lnk', 1), IS.claveDe('C:\\A\\b.lnk', 2));
});

test('lee solo las líneas OK', () => {
  const h = IS.leerSalida('OK\tC:\\x\\1.png\r\nbasura\nERR\tC:\\x\\2.png\n');
  assert.deepStrictEqual([...h], ['c:\\x\\1.png']);
});

test('junta las peticiones en un solo lote y usa la caché en disco después', async () => {
  const dir = tmp();
  let llamadas = 0;
  const ejecutar = async (lista) => {
    llamadas++;
    let out = '';
    for (const it of lista) {
      if (it.ruta.includes('sin-icono')) continue;
      fs.writeFileSync(it.archivo, 'png');
      out += 'OK\t' + it.archivo + '\n';
    }
    return out;
  };
  const s = IS.crear({ dirCache: dir, ejecutar });
  const [a, b, c] = await Promise.all([s.obtener('C:\\a.lnk', 1), s.obtener('C:\\b.lnk', 1), s.obtener('C:\\sin-icono.lnk', 1)]);
  assert.strictEqual(llamadas, 1);
  assert.ok(a && fs.existsSync(a));
  assert.ok(b && fs.existsSync(b));
  assert.strictEqual(c, null);
  assert.strictEqual(await s.obtener('C:\\a.lnk', 1), a);
  assert.strictEqual(llamadas, 1); // salió de la caché
  fs.rmSync(dir, { recursive: true, force: true });
});

test('si el script falla, devuelve null sin romper', async () => {
  const dir = tmp();
  const s = IS.crear({ dirCache: dir, ejecutar: async () => { throw new Error('x'); } });
  assert.strictEqual(await s.obtener('C:\\a.lnk', 1), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
