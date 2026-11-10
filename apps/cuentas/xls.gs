/* ---------------- lector de Excel viejo (.xls, BIFF2/BIFF5/BIFF8) para el informe de Resto Soft ---------------- */

const CP1252 = { 128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338,
  142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376 };

function u16(b, p) { return b[p] | (b[p + 1] << 8); }
function u32le(b, p) { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; }
function f64(b, p) { const dv = new DataView(new ArrayBuffer(8)); for (let i = 0; i < 8; i++) dv.setUint8(i, b[p + i]); return dv.getFloat64(0, true); }
function rk(v) {
  let n;
  if (v & 2) n = v >> 2;
  else { const dv = new DataView(new ArrayBuffer(8)); dv.setUint32(0, 0, true); dv.setUint32(4, (v & 0xfffffffc) >>> 0, true); n = dv.getFloat64(0, true); }
  return v & 1 ? n / 100 : n;
}
function texto8(b, p, n) { let s = ""; for (let i = 0; i < n; i++) { const c = b[p + i]; s += String.fromCharCode(CP1252[c] || c); } return s; }
function texto16(b, p, n) { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(u16(b, p + 2 * i)); return s; }

/** Saca el flujo "Book" o "Workbook" del archivo compuesto (OLE2). */
function flujoLibro(b) {
  if (u32le(b, 0) !== 0xe011cfd0) return b;   // no es OLE2: se asume BIFF suelto
  const sec = 1 << u16(b, 30), miniCorte = u32le(b, 56), nFat = u32le(b, 44), dirIni = u32le(b, 48);
  const off = s => 512 + s * sec;
  const difat = []; for (let i = 0; i < 109 && difat.length < nFat; i++) difat.push(u32le(b, 76 + 4 * i));
  let extra = u32le(b, 68);
  while (difat.length < nFat && extra < 0xfffffffa) { for (let i = 0; i < sec / 4 - 1 && difat.length < nFat; i++) difat.push(u32le(b, off(extra) + 4 * i)); extra = u32le(b, off(extra) + sec - 4); }
  const fat = []; difat.forEach(s => { for (let i = 0; i < sec / 4; i++) fat.push(u32le(b, off(s) + 4 * i)); });
  const cadena = (ini, tam) => { const out = []; let s = ini; while (s < 0xfffffffa && out.length < tam) { const o = off(s); for (let i = 0; i < sec && out.length < tam; i++) out.push(b[o + i]); s = fat[s]; } return out; };
  const dir = cadena(dirIni, 1 << 30);
  let raiz = null, libro = null;
  for (let p = 0; p + 128 <= dir.length; p += 128) {
    const nombre = texto16(dir, p, Math.max(0, u16(dir, p + 64) / 2 - 1)), tipo = dir[p + 66];
    const ent = { ini: u32le(dir, p + 116), tam: u32le(dir, p + 120) };
    if (tipo === 5) raiz = ent;
    if (tipo === 2 && (nombre === "Workbook" || nombre === "Book")) libro = ent;
  }
  if (!libro) throw new Error("El archivo no es un Excel.");
  if (libro.tam >= miniCorte) return cadena(libro.ini, libro.tam);
  // flujo chico: va en el mini-stream
  const mini = cadena(raiz.ini, raiz.tam), mfat = cadena(u32le(b, 60), u32le(b, 64) * sec), out = [];
  let s = libro.ini;
  while (s < 0xfffffffa && out.length < libro.tam) { for (let i = 0; i < 64 && out.length < libro.tam; i++) out.push(mini[s * 64 + i]); s = u32le(mfat, 4 * s); }
  return out;
}

/** Devuelve las filas de la primera hoja como lista de listas (texto o número), como getValues(). */
function leerXls(bytes) {
  const b = flujoLibro(bytes.map(x => x & 255));
  const celdas = {}; let maxFila = -1, maxCol = -1, hoja = 0, biff8 = false; const sst = [];
  const poner = (f, c, v) => { if (hoja !== 1) return; (celdas[f] = celdas[f] || {})[c] = v; if (f > maxFila) maxFila = f; if (c > maxCol) maxCol = c; };
  let p = 0, ultimoTipo = 0, sstBuf = null;
  while (p + 4 <= b.length) {
    const tipo = u16(b, p), largo = u16(b, p + 2), d = p + 4;
    if (tipo === 0x0809 || tipo === 0x0009) { if (tipo === 0x0009 || u16(b, d + 2) === 0x10) hoja++; biff8 = tipo === 0x0809 && u16(b, d) === 0x0600; }
    else if (tipo === 0x000a && hoja >= 1) { if (hoja === 1) break; }
    else if (tipo === 0x00fc) { sstBuf = b.slice(d, d + largo); }
    else if (tipo === 0x003c && ultimoTipo === 0x00fc && sstBuf) { sstBuf = sstBuf.concat(["CONT"], b.slice(d, d + largo)); }
    else if (tipo === 0x0003) poner(u16(b, d), u16(b, d + 2), f64(b, d + 7));                 // NUMBER de Excel 2 (así exporta Resto Soft)
    else if (tipo === 0x0002) poner(u16(b, d), u16(b, d + 2), u16(b, d + 7));                 // INTEGER de Excel 2
    else if (tipo === 0x0004) poner(u16(b, d), u16(b, d + 2), texto8(b, d + 8, b[d + 7]));    // LABEL de Excel 2
    else if (tipo === 0x0203) poner(u16(b, d), u16(b, d + 2), f64(b, d + 6));
    else if (tipo === 0x027e) poner(u16(b, d), u16(b, d + 2), rk(u32le(b, d + 6)));
    else if (tipo === 0x00bd) { const f = u16(b, d); let c = u16(b, d + 2); for (let q = d + 4; q + 6 <= d + largo - 2; q += 6) poner(f, c++, rk(u32le(b, q + 2))); }
    else if (tipo === 0x0204 || tipo === 0x00d6) {
      const n = u16(b, d + 6);
      if (biff8) { const fl = b[d + 8]; poner(u16(b, d), u16(b, d + 2), fl & 1 ? texto16(b, d + 9, n) : texto8(b, d + 9, n)); }
      else poner(u16(b, d), u16(b, d + 2), texto8(b, d + 8, n));
    }
    else if (tipo === 0x00fd) poner(u16(b, d), u16(b, d + 2), "SST#" + u32le(b, d + 6));
    else if (tipo === 0x0006) { const r = b.slice(d + 6, d + 14); if (!(r[6] === 255 && r[7] === 255)) poner(u16(b, d), u16(b, d + 2), f64(b, d + 6)); }
    if (tipo !== 0x003c) ultimoTipo = tipo;
    p = d + largo;
  }
  if (sstBuf) leerSst(sstBuf, sst);
  const out = [];
  for (let f = 0; f <= maxFila; f++) {
    const fila = []; for (let c = 0; c <= Math.max(maxCol, 5); c++) {
      let v = celdas[f] && celdas[f][c] !== undefined ? celdas[f][c] : "";
      if (typeof v === "string" && v.indexOf("SST#") === 0) v = sst[Number(v.slice(4))] || "";
      fila.push(v);
    }
    out.push(fila);
  }
  return out;
}

/** Tabla de textos compartidos de BIFF8 (con los cortes CONTINUE marcados como "CONT"). */
function leerSst(buf, sst) {
  const n = u32le(buf, 4); let p = 8;
  const byte = () => { if (buf[p] === "CONT") p++; return buf[p++]; };
  for (let k = 0; k < n && p < buf.length; k++) {
    const largo = byte() | (byte() << 8); let fl = byte(), rt = 0, ext = 0;
    if (fl & 8) rt = byte() | (byte() << 8);
    if (fl & 4) ext = (byte() | (byte() << 8) | (byte() << 16) | (byte() << 24)) >>> 0;
    let s = "";
    for (let i = 0; i < largo; i++) {
      if (buf[p] === "CONT") { p++; fl = buf[p++]; }
      s += fl & 1 ? String.fromCharCode(byte() | (byte() << 8)) : String.fromCharCode(CP1252[byte()] || buf[p - 1]);
    }
    for (let i = 0; i < rt * 4 + ext; i++) byte();
    sst.push(s);
  }
}
