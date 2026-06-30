/*
 * Ghost Notes — icon & promo generator (no external dependencies).
 * Draws the ghost mascot as a vector and rasterises crisp PNGs with a
 * hand-rolled PNG encoder (Node's built-in zlib).
 *
 * Run: node scripts/make-icons.js
 * Outputs:
 *   icons/icon16.png icon32.png icon48.png icon128.png icon.png
 *   store/promo-small-440x280.png
 *   store/promo-marquee-1400x560.png
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ICONS = path.join(ROOT, 'icons');
const STORE = path.join(ROOT, 'store');
fs.mkdirSync(ICONS, { recursive: true });
fs.mkdirSync(STORE, { recursive: true });

// ---- palette ----------------------------------------------------------------
const C1 = [102, 126, 234];   // #667eea
const C2 = [118, 75, 162];    // #764ba2
const WHITE = [248, 249, 252];
const EYE = [60, 45, 90];     // #3c2d5a
const NOTE_COLORS = [
  [251, 192, 45], [240, 98, 146], [102, 187, 106],
  [66, 165, 245], [171, 71, 188], [255, 167, 38]
];

// ---- PNG encoder ------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- geometry helpers -------------------------------------------------------
function lerp(a, b, t) { return [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t)
]; }

function roundedBoxSDF(px, py, cx, cy, hx, hy, r) {
  const dx = Math.abs(px - cx) - (hx - r);
  const dy = Math.abs(py - cy) - (hy - r);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - r;
}

// ghost membership in normalized 0..1 coords
function inGhost(nx, ny) {
  const headR = 0.215;
  const inHead = (nx - 0.5) ** 2 + (ny - 0.40) ** 2 <= headR * headR;
  let inBody = false;
  if (nx >= 0.285 && nx <= 0.715 && ny >= 0.40) {
    const t = (nx - 0.285) / 0.43;
    const n = 4;
    const local = (t * n) % 1;
    const bump = 0.07 * Math.sqrt(Math.max(0, 1 - (2 * local - 1) ** 2));
    const bY = 0.74 + bump;
    inBody = ny <= bY;
  }
  return inHead || inBody;
}
function inEye(nx, ny) {
  const rx = 0.045, ry = 0.062;
  const e1 = ((nx - 0.43) / rx) ** 2 + ((ny - 0.385) / ry) ** 2 <= 1;
  const e2 = ((nx - 0.57) / rx) ** 2 + ((ny - 0.385) / ry) ** 2 <= 1;
  return e1 || e2;
}

// ---- icon renderer (transparent rounded tile) -------------------------------
function renderIcon(W) {
  const SS = 4;
  const out = Buffer.alloc(W * W * 4);
  const margin = W * 0.04;
  const rr = W * 0.22;
  const cx = W / 2, cy = W / 2, hx = (W - 2 * margin) / 2, hy = (W - 2 * margin) / 2;

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let sA = 0, sR = 0, sG = 0, sB = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const sx = x + (i + 0.5) / SS;
          const sy = y + (j + 0.5) / SS;
          if (roundedBoxSDF(sx, sy, cx, cy, hx, hy, rr) > 0) continue; // transparent
          const nx = sx / W, ny = sy / W;
          let col;
          if (inGhost(nx, ny)) col = inEye(nx, ny) ? EYE : WHITE;
          else col = lerp(C1, C2, (nx + ny) / 2);
          sA += 255; sR += col[0]; sG += col[1]; sB += col[2];
        }
      }
      const n = SS * SS;
      const a = Math.round(sA / n);
      const idx = (y * W + x) * 4;
      out[idx + 3] = a;
      if (a > 0) {
        out[idx] = Math.round(sR / (sA / 255));
        out[idx + 1] = Math.round(sG / (sA / 255));
        out[idx + 2] = Math.round(sB / (sA / 255));
      }
    }
  }
  return out;
}

// ---- 5x7 pixel font (uppercase subset) --------------------------------------
const FONT = {
  G: ['01110', '10001', '10000', '10011', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
};
function drawText(buf, W, H, text, x, y, scale, color) {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (glyph) {
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row][col] !== '1') continue;
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              const px = cx + col * scale + dx;
              const py = y + row * scale + dy;
              if (px < 0 || px >= W || py < 0 || py >= H) continue;
              const idx = (py * W + px) * 4;
              buf[idx] = color[0]; buf[idx + 1] = color[1];
              buf[idx + 2] = color[2]; buf[idx + 3] = 255;
            }
          }
        }
      }
    }
    cx += 6 * scale; // 5 wide + 1 space
  }
}
function textWidth(text, scale) { return text.length * 6 * scale - scale; }

// ---- promo renderer ---------------------------------------------------------
function renderPromo(W, H, opts) {
  opts = opts || {};
  const SS = 3;
  const out = Buffer.alloc(W * H * 4);
  // ghost box: left-ish, sized to height
  const g = opts.ghost || { size: H * 0.62, cx: W * 0.20, cy: H * 0.5 };
  const gx0 = g.cx - g.size / 2, gy0 = g.cy - g.size / 2;

  // decorative sticky notes (drawn behind ghost), as rounded squares
  const notes = opts.notes || [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sR = 0, sG = 0, sB = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const sx = x + (i + 0.5) / SS;
          const sy = y + (j + 0.5) / SS;
          // base gradient (full bleed)
          let col = lerp(C1, C2, (sx / W * 0.6 + sy / H * 0.4));

          // sticky notes
          for (const nt of notes) {
            if (roundedBoxSDF(sx, sy, nt.x, nt.y, nt.w / 2, nt.h / 2, nt.w * 0.12) <= 0) {
              col = nt.color;
            }
          }

          // ghost
          const nx = (sx - gx0) / g.size, ny = (sy - gy0) / g.size;
          if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 && inGhost(nx, ny)) {
            col = inEye(nx, ny) ? EYE : WHITE;
          }
          sR += col[0]; sG += col[1]; sB += col[2];
        }
      }
      const n = SS * SS;
      const idx = (y * W + x) * 4;
      out[idx] = Math.round(sR / n);
      out[idx + 1] = Math.round(sG / n);
      out[idx + 2] = Math.round(sB / n);
      out[idx + 3] = 255;
    }
  }
  return out;
}

// ---- write ------------------------------------------------------------------
function save(file, w, h, rgba) {
  fs.writeFileSync(file, encodePNG(w, h, rgba));
  console.log('wrote ' + path.relative(ROOT, file) + '  (' + w + 'x' + h + ')');
}

[16, 32, 48, 128].forEach((s) => save(path.join(ICONS, 'icon' + s + '.png'), s, s, renderIcon(s)));
save(path.join(ICONS, 'icon.png'), 128, 128, renderIcon(128));

// small promo tile 440x280
save(path.join(STORE, 'promo-small-440x280.png'), 440, 280, renderPromo(440, 280, {
  ghost: { size: 200, cx: 110, cy: 140 },
  notes: [
    { x: 300, y: 95, w: 110, h: 90, color: NOTE_COLORS[0] },
    { x: 360, y: 200, w: 90, h: 78, color: NOTE_COLORS[1] }
  ]
}));
{
  const W = 440, H = 280;
  const buf = renderPromo(W, H, {
    ghost: { size: 200, cx: 110, cy: 130 },
    notes: [
      { x: 305, y: 90, w: 110, h: 92, color: NOTE_COLORS[0] },
      { x: 360, y: 200, w: 92, h: 80, color: NOTE_COLORS[3] }
    ]
  });
  const title = 'GHOST NOTES';
  drawText(buf, W, H, title, 200 - 0, 210, 4, WHITE);
  fs.writeFileSync(path.join(STORE, 'promo-small-440x280.png'), encodePNG(W, H, buf));
  console.log('wrote store/promo-small-440x280.png  (with title)');
}

// marquee 1400x560
{
  const W = 1400, H = 560;
  const buf = renderPromo(W, H, {
    ghost: { size: 380, cx: 280, cy: 280 },
    notes: [
      { x: 980, y: 180, w: 230, h: 190, color: NOTE_COLORS[0] },
      { x: 1180, y: 360, w: 190, h: 160, color: NOTE_COLORS[1] },
      { x: 1080, y: 430, w: 170, h: 150, color: NOTE_COLORS[2] }
    ]
  });
  const scale = 9;
  drawText(buf, W, H, 'GHOST NOTES', 560, 200, scale, WHITE);
  drawText(buf, W, H, 'STICKY NOTES FOR THE WEB', 562, 320, 4, [225, 220, 245]);
  fs.writeFileSync(path.join(STORE, 'promo-marquee-1400x560.png'), encodePNG(W, H, buf));
  console.log('wrote store/promo-marquee-1400x560.png');
}

console.log('done.');
