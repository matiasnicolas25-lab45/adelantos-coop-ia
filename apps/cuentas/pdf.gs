/* ---------------- PDF de la factura (con el QR que pide ARCA, RG 4892) ---------------- */

const FACTURAS_CARPETA = "1WdQ4WsPJ-flGAzBGDfU_mN0T1S67RJNk";   // carpeta "Facturas La Caleta" en Drive
const DOMICILIO = "Carlos Colombres 1296 - Rosario Norte, Santa Fe";

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
  const dmy = t => String(t || "").length === 8 ? t.slice(6, 8) + "/" + t.slice(4, 6) + "/" + t.slice(0, 4) : fecha;
  const filasTot = x.tipo === "A"
    ? "<tr><td>Importe neto gravado</td><td class='n'>" + plataPdf(x.neto) + "</td></tr><tr><td>IVA 21%</td><td class='n'>" + plataPdf(x.iva) + "</td></tr>"
    : "";
  const n2 = v => Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\./g, "");
  const esA = x.tipo === "A";
  const encab = esA
    ? "<th>Código</th><th>Producto / Servicio</th><th class='n'>Cantidad</th><th>U. medida</th><th class='n'>Precio Unit.</th><th class='n'>% Bonif</th><th class='n'>Subtotal</th><th class='n'>Alícuota IVA</th><th class='n'>Subtotal c/IVA</th>"
    : "<th>Código</th><th>Producto / Servicio</th><th class='n'>Cantidad</th><th>U. medida</th><th class='n'>Precio Unit.</th><th class='n'>% Bonif</th><th class='n'>Imp. Bonif.</th><th class='n'>Subtotal</th>";
  const item = esA
    ? "<td></td><td>" + escH(x.detalle || "Consumos en el restaurante") + "</td><td class='n'>1,00</td><td>unidades</td><td class='n'>" + n2(x.neto) + "</td><td class='n'>0,00</td><td class='n'>" + n2(x.neto) + "</td><td class='n'>21%</td><td class='n'>" + n2(x.total) + "</td>"
    : "<td></td><td>" + escH(x.detalle || "Consumos en el restaurante") + "</td><td class='n'>1,00</td><td>unidades</td><td class='n'>" + n2(x.total) + "</td><td class='n'>0,00</td><td class='n'>0,00</td><td class='n'>" + n2(x.total) + "</td>";
  const fila = (t, v) => "<tr><td class='n b'>" + t + ": $</td><td class='n b' style='width:90px'>" + v + "</td></tr>";
  const totales = esA
    ? fila("Importe Neto Gravado", n2(x.neto)) + fila("IVA 27%", "0,00") + fila("IVA 21%", n2(x.iva)) + fila("IVA 10.5%", "0,00") + fila("IVA 5%", "0,00") +
      fila("IVA 2.5%", "0,00") + fila("IVA 0%", "0,00") + fila("Importe Otros Tributos", "0,00") +
      "<tr><td class='n b g'>Importe Total: $</td><td class='n b g'>" + n2(x.total) + "</td></tr>"
    : fila("Subtotal", n2(x.total)) + fila("Importe Otros Tributos", "0,00") +
      "<tr><td class='n b g'>Importe Total: $</td><td class='n b g'>" + n2(x.total) + "</td></tr>";
  const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><style>" +
    "body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#000;margin:0}table{border-collapse:collapse;width:100%}td,th{vertical-align:top}" +
    ".marco{border:1px solid #000}.p{padding:6px 10px}.b{font-weight:bold}.n{text-align:right;white-space:nowrap}.c{text-align:center}" +
    ".tit{font-size:15px;font-weight:bold;text-align:center;padding:5px;border:1px solid #000;border-bottom:0}" +
    ".letra{border:1px solid #000;border-top:0;width:52px;text-align:center;font-size:28px;font-weight:bold;line-height:1;padding:2px 0 3px;background:#fff}" +
    ".letra div{font-size:8px;font-weight:bold}.factura{font-size:21px;font-weight:bold}.g{font-size:13px}" +
    ".items th{background:#ccc;border:1px solid #000;padding:4px;font-size:9px;text-align:left}.items td{padding:5px 4px}" +
    ".chico{font-size:7.5px;font-style:italic}" +
    "</style></head><body>" +
    "<div class='tit'>ORIGINAL</div>" +
    "<table class='marco'><tr>" +
    "<td class='p' style='width:46%'><div class='b c' style='font-size:11px;margin:10px 0 18px'>COOPERATIVA DE TRABAJO LA CALETA LIMITADA</div>" +
    "<div><b>Razón Social:</b> COOPERATIVA DE TRABAJO LA CALETA LIMITADA</div><div><b>Domicilio Comercial:</b> " + escH(DOMICILIO) + "</div>" +
    "<div style='margin-top:4px'><b>Condición frente al IVA: IVA Responsable Inscripto</b></div></td>" +
    "<td style='width:8%' class='c'><div class='letra' style='margin:0 auto'>" + x.tipo + "<div>COD. " + cod + "</div></div></td>" +
    "<td class='p' style='width:46%'><div class='factura'>FACTURA</div>" +
    "<div style='margin-top:6px'><b>Punto de Venta: &nbsp;" + numero.slice(0, 5) + "</b> &nbsp;&nbsp; <b>Comp. Nro: &nbsp;" + numero.slice(6) + "</b></div>" +
    "<div><b>Fecha de Emisión: &nbsp;" + fecha + "</b></div><div style='margin-top:6px'><b>CUIT:</b> " + CUIT + "</div>" +
    (iibb ? "<div><b>Ingresos Brutos:</b> " + escH(iibb) + "</div>" : "") + (inicio ? "<div><b>Fecha de Inicio de Actividades:</b> " + escH(inicio) + "</div>" : "") + "</td>" +
    "</tr></table>" +
    "<table class='marco'><tr><td class='p'><b>Período Facturado Desde:</b> " + dmy(x.desde) + "</td><td class='p'><b>Hasta:</b> " + dmy(x.hasta) + "</td>" +
    "<td class='p n'><b>Fecha de Vto. para el pago:</b> " + dmy(x.vtoPago) + "</td></tr></table>" +
    "<table class='marco'><tr><td class='p' style='width:40%'><b>" + escH(doc.split(":")[0]) + ":</b> " + escH(doc.indexOf(":") > 0 ? doc.split(":")[1].trim().replace(/-/g, "") : "") + "</td>" +
    "<td class='p'><b>Apellido y Nombre / Razón Social:</b> " + escH(x.nombre || "Consumidor final") + "</td></tr>" +
    "<tr><td class='p'><b>Condición frente al IVA:</b> " + escH(COND_IVA[x.cond] === "Responsable inscripto" ? "IVA Responsable Inscripto" : COND_IVA[x.cond] || "") + "</td>" +
    "<td class='p'><b>Domicilio Comercial:</b> " + escH(x.domicilio || "") + "</td></tr>" +
    "<tr><td class='p' colspan='2'><b>Condición de venta:</b> " + escH(x.venta || "Otra") + "</td></tr></table><br>" +
    "<table class='items'><tr>" + encab + "</tr><tr>" + item + "</tr></table>" +
    "<div style='height:230px'></div>" +
    "<table class='marco'><tr><td class='p' style='width:45%'>" +
    (esA ? "" : "<div style='margin-top:8px'><b>Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</b></div><div>IVA Contenido: $ " + n2(x.iva) + "</div>") +
    "</td><td class='p'><table>" + totales + "</table></td></tr></table><br>" +
    "<table><tr><td style='width:110px'><img src='" + qrPng(urlQr) + "' width='100' height='100'></td>" +
    "<td style='padding-top:8px'><div style='font-size:20px;font-weight:bold;letter-spacing:1px'>ARCA</div><div class='b' style='font-style:italic;margin-top:6px'>Comprobante Autorizado</div>" +
    "<div class='chico' style='margin-top:6px'>Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación</div></td>" +
    "<td class='n' style='padding-top:14px;font-size:11px'><div><b>CAE N°:</b> " + escH(x.cae) + "</div><div><b>Fecha de Vto. de CAE:</b> " + vto + "</div></td></tr></table>" +
    "</body></html>";
  const nombreArchivo = "Factura " + x.tipo + " " + numero + " - " + String(x.nombre || "Consumidor final").replace(/[\/\\:*?"<>|]/g, " ") + ".pdf";
  const pdf = Utilities.newBlob(html, "text/html", "f.html").getAs("application/pdf").setName(nombreArchivo);
  return DriveApp.getFolderById(FACTURAS_CARPETA).createFile(pdf).getUrl();
}
