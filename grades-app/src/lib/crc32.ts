// CRC32 (IEEE 802.3, как zlib и CRC32() в ClickHouse) над UTF-8 байтами
// строки. Нужен импорту слепка HR (lib/hrSnapshot): локально пересчитываем
// sum(CRC32(колонка)) по присланным строкам и сверяем с ответом хаба.
// Без зависимостей: zlib.crc32 есть не во всех версиях Node.

const TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const utf8 = new TextEncoder();

/** CRC32 строки (UTF-8) — беззнаковое 32-битное, как CRC32() в ClickHouse. */
export function crc32(s: string): number {
  let c = 0xffffffff;
  for (const b of utf8.encode(s)) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
