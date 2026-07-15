import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

function makePNG(size) {
  const W = size, H = size;
  const pixels = new Uint8Array(W * H * 4);

  // Diagonal gradient: indigo → pink
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x + y) / (W + H - 2);
      const r = Math.round(0x4f + t * (0xdb - 0x4f));
      const g = Math.round(0x46 + t * (0x27 - 0x46));
      const b = Math.round(0xe5 + t * (0x77 - 0xe5));

      // iOS-style rounded corners
      const cr = size * 0.22;
      const cx = Math.min(x, W - 1 - x);
      const cy = Math.min(y, H - 1 - y);
      let alpha = 255;
      if (cx < cr && cy < cr) {
        const dx = cr - cx - 0.5;
        const dy = cr - cy - 0.5;
        const d  = Math.sqrt(dx * dx + dy * dy);
        alpha = d > cr ? 0 : d > cr - 1 ? Math.round((cr - d) * 255) : 255;
      }

      const i = (y * W + x) * 4;
      pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = alpha;
    }
  }

  // Bold "W" bitmap (7 cols × 9 rows)
  const W_GLYPH = [
    [1,0,0,0,0,0,1],
    [1,0,0,0,0,0,1],
    [1,0,0,0,0,0,1],
    [1,0,0,0,0,0,1],
    [1,0,1,0,1,0,1],
    [1,0,1,0,1,0,1],
    [0,1,0,0,0,1,0],
    [0,1,0,0,0,1,0],
    [0,0,0,0,0,0,0],
  ];

  const sc = Math.max(1, Math.floor(size * 0.075));
  const gw = 7 * sc, gh = 9 * sc;
  const ox = Math.floor((W - gw) / 2);
  const oy = Math.floor((H - gh) / 2);

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 7; col++) {
      if (!W_GLYPH[row][col]) continue;
      for (let sy = 0; sy < sc; sy++) {
        for (let sx = 0; sx < sc; sx++) {
          const px = ox + col * sc + sx;
          const py = oy + row * sc + sy;
          if (px < 0 || px >= W || py < 0 || py >= H) continue;
          const i = (py * W + px) * 4;
          pixels[i] = 255; pixels[i+1] = 255; pixels[i+2] = 255; pixels[i+3] = 255;
        }
      }
    }
  }

  // Build PNG
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = table[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const tb = Buffer.from(type, 'ascii');
    const lb = Buffer.alloc(4); lb.writeUInt32BE(data.length);
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
    return Buffer.concat([lb, tb, data, cb]);
  }

  // Scanlines with filter byte 0
  const rows = Buffer.alloc((1 + W * 4) * H);
  for (let y = 0; y < H; y++) {
    rows[y * (1 + W * 4)] = 0;
    for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 4;
      const d = y * (1 + W * 4) + 1 + x * 4;
      rows[d] = pixels[s]; rows[d+1] = pixels[s+1]; rows[d+2] = pixels[s+2]; rows[d+3] = pixels[s+3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const buf = makePNG(size);
  writeFileSync(`icons/icon-${size}.png`, buf);
  console.log(`icons/icon-${size}.png  (${buf.length} bytes)`);
}
