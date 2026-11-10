/* ---------------- PDF de la factura (con el QR que pide ARCA, RG 4892) ---------------- */

const FACTURAS_CARPETA = "1WdQ4WsPJ-flGAzBGDfU_mN0T1S67RJNk";   // carpeta "Facturas La Caleta" en Drive
const DOMICILIO = "Av. Carlos Colombres 1296 - (2000) Rosario, Santa Fe";

function dato(nombre) {
  const f = filas("CONFIG").filter(r => String(r[0]) === nombre)[0];
  return f ? String(f[1] || "").trim() : "";
}

// PNG en escala de grises sin comprimir (bloques "stored" de zlib): alcanza para un QR chico.
function crc32(b) {
  let c, crc = -1;
  for (let i = 0; i < b.length; i++) { c = (crc ^ b[i]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ -1) >>> 0;
}
function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function trozo(tipo, datos) { const t = utf8b(tipo).concat(datos); return u32(datos.length).concat(t, u32(crc32(t))); }
function png(ancho, alto, pixel) {
  const crudo = [];
  for (let y = 0; y < alto; y++) { crudo.push(0); for (let x = 0; x < ancho; x++) crudo.push(pixel(x, y)); }
  const z = [0x78, 0x01];
  for (let i = 0; i < crudo.length; i += 65535) {
    const parte = crudo.slice(i, i + 65535), ultimo = i + 65535 >= crudo.length ? 1 : 0;
    z.push(ultimo, parte.length & 255, parte.length >>> 8, ~parte.length & 255, (~parte.length >>> 8) & 255);
    for (let j = 0; j < parte.length; j++) z.push(parte[j]);
  }
  let a = 1, b = 0; for (let i = 0; i < crudo.length; i++) { a = (a + crudo[i]) % 65521; b = (b + a) % 65521; }
  z.push.apply(z, u32(((b << 16) | a) >>> 0));
  return [137, 80, 78, 71, 13, 10, 26, 10].concat(trozo("IHDR", u32(ancho).concat(u32(alto), [8, 0, 0, 0, 0])), trozo("IDAT", z), trozo("IEND", []));
}
function qrPng(texto) {
  const q = qrcode(0, "M"); q.addData(texto); q.make();
  const n = q.getModuleCount(), m = 4, esc = 4, lado = (n + 2 * m) * esc;
  const b = png(lado, lado, function (x, y) {
    const cx = Math.floor(x / esc) - m, cy = Math.floor(y / esc) - m;
    return cx >= 0 && cy >= 0 && cx < n && cy < n && q.isDark(cy, cx) ? 0 : 255;
  });
  return "data:image/png;base64," + Utilities.base64Encode(conSigno(b));
}

function plataPdf(n) { return "$ " + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function escH(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function cuitGuiones(c) { c = String(c); return c.length === 11 ? c.slice(0, 2) + "-" + c.slice(2, 10) + "-" + c.slice(10) : c; }

/**
 * Arma el PDF de una factura ya autorizada y lo guarda en Drive. Devuelve la URL.
 * x = {tipo "A"|"B", n (número), fecha (Date), docTipo, docNro, nombre, domicilio, cond, neto, iva, total, cae, vto (yyyymmdd), detalle}
 */
function facturaPdf(x) {
  const cod = x.tipo === "A" ? "01" : "06", tipoCmp = x.tipo === "A" ? 1 : 6;
  const numero = ("0000" + PUNTO_VENTA).slice(-5) + "-" + ("0000000" + x.n).slice(-8);
  const fecha = Utilities.formatDate(x.fecha, ZONA, "dd/MM/yyyy"), fechaIso = Utilities.formatDate(x.fecha, ZONA, "yyyy-MM-dd");
  const qr = {
    ver: 1, fecha: fechaIso, cuit: Number(CUIT), ptoVta: PUNTO_VENTA, tipoCmp: tipoCmp, nroCmp: x.n, importe: dosDec(x.total),
    moneda: "PES", ctz: 1, tipoDocRec: Number(x.docTipo), nroDocRec: Number(x.docNro || 0), tipoCodAut: "E", codAut: Number(x.cae),
  };
  const urlQr = "https://www.afip.gob.ar/fe/qr/?p=" + Utilities.base64Encode(JSON.stringify(qr));
  const doc = x.docTipo === "80" ? "CUIT: " + cuitGuiones(x.docNro) : x.docTipo === "96" ? "DNI: " + x.docNro : "Sin identificar";
  const iibb = dato("Ingresos Brutos"), inicio = dato("Inicio de actividades");
  const vto = x.vto.slice(6, 8) + "/" + x.vto.slice(4, 6) + "/" + x.vto.slice(0, 4);
  const precio = x.tipo === "A" ? x.neto : x.total;
  const filasTot = x.tipo === "A"
    ? "<tr><td>Importe neto gravado</td><td class='n'>" + plataPdf(x.neto) + "</td></tr><tr><td>IVA 21%</td><td class='n'>" + plataPdf(x.iva) + "</td></tr>"
    : "";
  const html = "<html><head><meta charset='utf-8'><style>" +
    "body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:0}" +
    "table{border-collapse:collapse;width:100%}td{vertical-align:top}" +
    ".caja{border:1px solid #111}.p{padding:10px}.letra{width:56px;text-align:center;border:1px solid #111;font-size:30px;font-weight:bold;padding:4px 0}" +
    ".letra small{display:block;font-size:9px;font-weight:normal}.t{font-size:15px;font-weight:bold}.g{font-size:20px;font-weight:bold}" +
    ".n{text-align:right;white-space:nowrap}.items th{background:#eee;border:1px solid #111;padding:6px;text-align:left}.items td{border:1px solid #111;padding:6px}" +
    ".tot td{padding:4px 6px}.tot .g td{font-size:15px;font-weight:bold;border-top:1px solid #111}.chico{font-size:9px;color:#444}" +
    "</style></head><body>" +
    "<table class='caja'><tr>" +
    "<td class='p' style='width:45%'><div class='t'>LA CALETA</div><div>COOPERATIVA DE TRABAJO LA CALETA LIMITADA</div><div>" + escH(DOMICILIO) + "</div>" +
    "<div>Restaurante del Yacht Club Rosario</div><div><b>IVA Responsable Inscripto</b></div></td>" +
    "<td style='width:10%;text-align:center;padding-top:8px'><div class='letra'>" + x.tipo + "<small>COD. " + cod + "</small></div></td>" +
    "<td class='p' style='width:45%'><div class='t'>FACTURA</div><div>Punto de venta: <b>" + numero.slice(0, 5) + "</b> &nbsp; Comp. Nro: <b>" + numero.slice(6) + "</b></div>" +
    "<div>Fecha de emisión: <b>" + fecha + "</b></div><div>CUIT: " + cuitGuiones(CUIT) + "</div>" +
    (iibb ? "<div>Ingresos Brutos: " + escH(iibb) + "</div>" : "") + (inicio ? "<div>Inicio de actividades: " + escH(inicio) + "</div>" : "") + "</td>" +
    "</tr></table><br>" +
    "<table class='caja'><tr><td class='p'><div><b>" + escH(doc) + "</b></div><div>Nombre / Razón social: <b>" + escH(x.nombre || "Consumidor final") + "</b></div>" +
    "<div>Condición frente al IVA: " + escH(COND_IVA[x.cond] || "") + "</div>" + (x.domicilio ? "<div>Domicilio: " + escH(x.domicilio) + "</div>" : "") +
    "<div>Condición de venta: Cuenta corriente</div></td></tr></table><br>" +
    "<table class='items'><tr><th>Detalle</th><th class='n'>Cantidad</th><th class='n'>Precio unitario</th><th class='n'>Subtotal</th></tr>" +
    "<tr><td>" + escH(x.detalle || "Consumos en el restaurante") + "</td><td class='n'>1</td><td class='n'>" + plataPdf(precio) + "</td><td class='n'>" + plataPdf(precio) + "</td></tr></table><br>" +
    "<table><tr><td style='width:55%'></td><td><table class='tot'>" + filasTot +
    "<tr class='g'><td>Importe total</td><td class='n'>" + plataPdf(x.total) + "</td></tr>" +
    (x.tipo === "B" ? "<tr><td colspan='2' class='chico'>Régimen de Transparencia Fiscal al Consumidor (Ley 27.743): IVA contenido " + plataPdf(x.iva) + "</td></tr>" : "") +
    "</table></td></tr></table><br><br>" +
    "<table class='caja'><tr><td class='p' style='width:130px'><img src='" + qrPng(urlQr) + "' width='120' height='120'></td>" +
    "<td class='p'><div><b>Comprobante autorizado por ARCA</b></div><div>CAE N°: <b>" + escH(x.cae) + "</b></div><div>Fecha de vto. de CAE: <b>" + vto + "</b></div>" +
    "<div class='chico' style='margin-top:8px'>Esta factura electrónica se puede verificar escaneando el código QR.</div></td></tr></table>" +
    "</body></html>";
  const nombreArchivo = "Factura " + x.tipo + " " + numero + " - " + String(x.nombre || "Consumidor final").replace(/[\/\\:*?"<>|]/g, " ") + ".pdf";
  const pdf = Utilities.newBlob(html, "text/html", "f.html").getAs("application/pdf").setName(nombreArchivo);
  return DriveApp.getFolderById(FACTURAS_CARPETA).createFile(pdf).getUrl();
}
