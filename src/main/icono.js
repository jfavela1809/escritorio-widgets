'use strict';
// Genera en código el icono de la bandeja (PNG de 32x32): cuatro cuadros, como una carpeta
// Android de 2x2. Sin importar electron.

const zlib = require('zlib');

const TAM = 32;

function pixeles() {
  const buf = Buffer.alloc(TAM * TAM * 4, 0);
  const poner = (x, y, r, g, b, a = 255) => {
    const i = (y * TAM + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  // Fondo redondeado azul oscuro.
  for (let y = 2; y < 30; y++) {
    for (let x = 2; x < 30; x++) {
      const dx = Math.min(x - 2, 29 - x);
      const dy = Math.min(y - 2, 29 - y);
      if (dx < 4 && dy < 4 && dx + dy < 3) continue;
      poner(x, y, 36, 52, 92);
    }
  }
  // Cuatro cuadros de colores.
  const colores = [[255, 196, 61], [96, 190, 120], [90, 160, 240], [235, 100, 110]];
  const origen = [[7, 7], [17, 7], [7, 17], [17, 17]];
  origen.forEach(([ox, oy], k) => {
    const [r, g, b] = colores[k];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if ((x === 0 || x === 7) && (y === 0 || y === 7)) continue; // esquinas
        poner(ox + x, oy + y, r, g, b);
      }
    }
  });
  return buf;
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
}

function generarPng() {
  const px = pixeles();
  const filas = Buffer.alloc((TAM * 4 + 1) * TAM);
  for (let y = 0; y < TAM; y++) {
    filas[y * (TAM * 4 + 1)] = 0;
    px.copy(filas, y * (TAM * 4 + 1) + 1, y * TAM * 4, (y + 1) * TAM * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(TAM, 0);
  ihdr.writeUInt32BE(TAM, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(filas)),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { generarPng, pixeles, TAM };
