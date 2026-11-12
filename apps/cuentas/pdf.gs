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


/* ---------- resumen de cuenta (o de mesa sin pagar) en PDF, con logo y letra Garamond ---------- */

const LOGO_PDF = "data:image/png;base64,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";

/**
 * r = {tipo: "cuenta"|"mesa", nombre, al (dd/mm/aaaa), previo, recargo, total, ultimo, alias,
 *      dias: [{titulo, total, filas: [[cantidad, producto, importe]]}]}
 * Devuelve el PDF para bajar (no se guarda en Drive).
 */
function resumenPdf(token, r) {
  quien(token);
  const ps = n => (n < 0 ? "-$" : "$") + Math.abs(Math.round(Number(n))).toLocaleString("es-AR");
  let filas = "";
  if (Number(r.previo) >= 1) filas += "<tr class='rec'><td></td><td>Saldo anterior pendiente</td><td class='m'>" + ps(r.previo) + "</td></tr>";
  (r.dias || []).forEach(d => {
    filas += "<tr class='dia'><th colspan='3'>" + escH(d.titulo) + "</th></tr>";
    (d.filas || []).forEach(f => { filas += "<tr><td class='q'>" + escH(f[0]) + "</td><td>" + escH(f[1]) + "</td><td class='m'>" + escH(f[2]) + "</td></tr>"; });
    if (r.tipo !== "mesa") filas += "<tr class='sub'><td></td><td>Total del día</td><td class='m'>" + ps(d.total) + "</td></tr>";
  });
  if (Number(r.recargo) >= 1) filas += "<tr class='rec'><td></td><td>Recargo por saldo impago (" + escH(r.pct || "") + " semanal)</td><td class='m'>" + ps(r.recargo) + "</td></tr>";
  const serif = "font-family:'EB Garamond','Cormorant Garamond',Garamond,'Times New Roman',Times,serif;";
  const html = "<html><head><meta charset='utf-8'><style>" +
    "@page{size:A4;margin:16mm 16mm}body{" + serif + "font-size:13pt;color:#1f2a26;margin:0}" +
    "table{border-collapse:collapse;width:100%}td,th{padding:3px 0;vertical-align:baseline}" +
    ".cab td{vertical-align:middle;border-bottom:1px solid #cfc9bb;padding-bottom:12px}.marca{font-size:26pt;font-weight:bold;letter-spacing:2px}" +
    ".marca div{font-size:12pt;font-weight:normal;letter-spacing:0;color:#5b625e}" +
    ".para td{padding:12px 0 6px;font-size:13pt}" +
    ".dia th{text-align:left;font-size:11.5pt;letter-spacing:2px;text-transform:uppercase;color:#2f5d62;padding-top:14px;border-bottom:1px solid #e2dccf}" +
    "td.q{width:26px;color:#5b625e}td.m{text-align:right;white-space:nowrap;padding-left:12px}" +
    ".sub td{font-style:italic;color:#5b625e;border-top:1px dotted #cfc9bb}.rec td{padding-top:12px;font-weight:bold}" +
    ".tot td{border-top:2px solid #1f2a26;padding-top:10px;font-size:20pt;font-weight:bold}" +
    ".pie{margin-top:18px;text-align:center;color:#5b625e;font-size:12pt;line-height:1.5}" +
    "</style></head><body>" +
    "<table class='cab'><tr><td style='width:70px'><img src='" + LOGO_PDF + "' style='height:62px'></td>" +
    "<td class='marca'>LA CALETA<div>Yacht Club Rosario · " + (r.tipo === "mesa" ? "Detalle de consumo pendiente" : "Resumen de cuenta corriente") + "</div></td></tr></table>" +
    "<table class='para'><tr><td>" + (r.nombre ? "Para: <b>" + escH(r.nombre) + "</b>" : "") + "</td><td style='text-align:right'>Al <b>" + escH(r.al) + "</b></td></tr></table>" +
    "<table>" + filas + "</table>" +
    "<table class='tot'><tr><td>Total a pagar</td><td style='text-align:right'>" + ps(r.total) + "</td></tr></table>" +
    "<div class='pie'>" + (r.ultimo ? "Último pago recibido: " + escH(r.ultimo) + "<br>" : "") +
    "Pagá en el salón o por transferencia al alias <b>" + escH(r.alias || ALIAS_PAGO) + "</b><br>¡Gracias!</div>" +
    "</body></html>";
  const nombre = "Resumen La Caleta - " + String(r.nombre || "cuenta").replace(/[\\/:*?"<>|]+/g, " ").trim() + " " + String(r.al || "").replace(/\//g, "-") + ".pdf";
  const pdf = Utilities.newBlob(html, "text/html", "r.html").getAs("application/pdf").setName(nombre);
  return { nombre: nombre, b64: Utilities.base64Encode(pdf.getBytes()) };   // no se guarda en ningún lado: solo se baja
}
