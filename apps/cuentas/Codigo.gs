/**
 * Cuentas La Caleta — cuentas corrientes de los socios del club y facturas A por ARCA.
 *
 * App web (solo cuenta de Google de La Caleta o de Matías + PIN de cada persona): cuentas corrientes de
 * la semana desde el Excel de Resto Soft, mensaje de WhatsApp, "Pagó", facturas A y B por ARCA (PV 5).
 * La llave secreta la crea este programa en la compu de Mat y queda guardada en las
 * Propiedades del script (nunca en la planilla, nunca en un chat).
 * Instalación: ver LEEME.md en esta carpeta.
 */

const CUIT = "33712205569";
const RAZON = "COOPERATIVA DE TRABAJO LA CALETA LIMITADA";
const ALIAS = "lacaleta";
const PUNTO_VENTA = 5;

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Cuentas")
    .addItem("Preparar la app (una vez)", "instalarApp")
    .addToUi();
  SpreadsheetApp.getUi().createMenu("ARCA")
    .addItem("1. Crear pedido de certificado", "abrirPedido")
    .addItem("2. Guardar el certificado de ARCA", "abrirCertificado")
    .addItem("3. Probar conexión con ARCA", "probarArca")
    .addItem("Ver estado del certificado", "verEstado")
    .addToUi();
}

function props() { return PropertiesService.getScriptProperties(); }

function abrirPedido() {
  const html = HtmlService.createHtmlOutput(DIALOGO_PEDIDO).setWidth(460).setHeight(360);
  SpreadsheetApp.getUi().showModalDialog(html, "Pedido de certificado para ARCA");
}

function abrirCertificado() {
  const html = HtmlService.createHtmlOutput(DIALOGO_CERT).setWidth(460).setHeight(320);
  SpreadsheetApp.getUi().showModalDialog(html, "Guardar el certificado de ARCA");
}

function datosPedido() {
  const p = props();
  return { cuit: CUIT, razon: RAZON, alias: ALIAS, hayClave: !!p.getProperty("ARCA_CLAVE"), hayCert: !!p.getProperty("ARCA_CERT") };
}

/** Guarda la llave (secreta) en las propiedades y el pedido (no secreto) como archivo en Drive. */
function guardarPedido(clave, csr, pisar) {
  const p = props();
  if (p.getProperty("ARCA_CERT") && !pisar) throw new Error("Ya hay un certificado guardado. Si hacés un pedido nuevo, el certificado actual deja de servir.");
  if (!/^-----BEGIN PRIVATE KEY-----/.test(clave) || !/^-----BEGIN CERTIFICATE REQUEST-----/.test(csr)) throw new Error("El pedido salió mal. Probá de nuevo.");
  p.setProperty("ARCA_CLAVE", clave);
  p.setProperty("ARCA_PEDIDO", csr);
  p.deleteProperty("ARCA_CERT");
  p.deleteProperty("ARCA_TA");
  const carpeta = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId()).getParents().next();
  const nombre = "pedido-certificado-" + ALIAS + ".csr";
  const viejos = carpeta.getFilesByName(nombre);
  while (viejos.hasNext()) viejos.next().setTrashed(true);
  const archivo = carpeta.createFile(nombre, csr, "application/pkcs10");
  return { nombre: nombre, url: archivo.getUrl() };
}

/** Guarda el certificado que devuelve ARCA (no es secreto). */
function guardarCertificado(texto) {
  const p = props();
  if (!p.getProperty("ARCA_CLAVE")) throw new Error("Primero hacé el paso 1 (Crear pedido de certificado).");
  const t = String(texto || "").trim();
  if (!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(t)) throw new Error("Ese archivo no es un certificado. Elegí el archivo que bajaste de ARCA (termina en .crt o .pem).");
  p.setProperty("ARCA_CERT", t + "\n");
  p.deleteProperty("ARCA_TA");
  return "Certificado guardado.";
}

function verEstado() {
  const d = datosPedido();
  SpreadsheetApp.getUi().alert(
    "Llave: " + (d.hayClave ? "creada" : "falta (paso 1)") + "\n" +
    "Certificado de ARCA: " + (d.hayCert ? "guardado" : "falta (paso 2)") + "\n" +
    "Punto de venta: " + PUNTO_VENTA);
}

/* ---------------- ARCA: login (WSAA) y factura electrónica (WSFE) ---------------- */

const WSAA_URL = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const WSFE_URL = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";

// DER mínimo (bytes sin signo 0..255)
function dLen(n) { if (n < 128) return [n]; const b = []; while (n > 0) { b.unshift(n & 255); n = Math.floor(n / 256); } return [128 | b.length].concat(b); }
function dTlv(tag, bytes) { return [tag].concat(dLen(bytes.length), bytes); }
function dCat() { let r = []; for (let i = 0; i < arguments.length; i++) r = r.concat(arguments[i]); return r; }
function dOid(txt) {
  const p = txt.split(".").map(Number), out = [40 * p[0] + p[1]];
  for (let i = 2; i < p.length; i++) { let v = p[i]; const t = [v & 127]; while ((v = Math.floor(v / 128)) > 0) t.unshift(128 | (v & 127)); out.push.apply(out, t); }
  return dTlv(6, out);
}
function sinSigno(b) { return b.map(x => x & 255); }
function conSigno(b) { return b.map(x => (x > 127 ? x - 256 : x)); }
function utf8b(s) { return sinSigno(Utilities.newBlob(s).getBytes()); }
function pemABytes(pem) { return sinSigno(Utilities.base64Decode(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""))); }

/** Lee un elemento DER: devuelve {tag, ini (donde empieza el contenido), fin, total (bytes del elemento entero)}. */
function dLeer(b, pos) {
  const tag = b[pos]; let l = b[pos + 1], ini = pos + 2;
  if (l & 128) { const n = l & 127; l = 0; for (let i = 0; i < n; i++) l = l * 256 + b[ini + i]; ini += n; }
  return { tag: tag, ini: ini, fin: ini + l, total: b.slice(pos, ini + l) };
}
function dHijos(b, el) { const r = []; let p = el.ini; while (p < el.fin) { const h = dLeer(b, p); r.push(h); p = h.fin; } return r; }

/** Emisor y número de serie del certificado (para la firma). */
function emisorYSerie(cert) {
  const tbs = dHijos(cert, dLeer(cert, 0))[0], partes = dHijos(cert, tbs);
  const i = partes[0].tag === 0xa0 ? 1 : 0;   // [0] versión
  return dTlv(0x30, dCat(partes[i + 2].total, partes[i].total));   // issuer, serialNumber
}

/** Firma el pedido de acceso (TRA) en formato CMS, como pide ARCA. Sin atributos firmados: la firma va
 *  directo sobre el texto del pedido (que es todo ASCII), así Google lo firma como texto común. */
function firmarCms(texto, certPem, clavePem) {
  const cert = pemABytes(certPem), contenido = utf8b(texto);
  const sha = dTlv(0x30, dCat(dOid("2.16.840.1.101.3.4.2.1"), [5, 0]));
  const firma = sinSigno(Utilities.computeRsaSha256Signature(texto, clavePem));
  const signer = dTlv(0x30, dCat([2, 1, 1], emisorYSerie(cert), sha,
    dTlv(0x30, dCat(dOid("1.2.840.113549.1.1.1"), [5, 0])), dTlv(0x04, firma)));
  const signed = dTlv(0x30, dCat([2, 1, 1], dTlv(0x31, sha),
    dTlv(0x30, dCat(dOid("1.2.840.113549.1.7.1"), dTlv(0xa0, dTlv(0x04, contenido)))),
    dTlv(0xa0, cert), dTlv(0x31, signer)));
  return Utilities.base64Encode(conSigno(dTlv(0x30, dCat(dOid("1.2.840.113549.1.7.2"), dTlv(0xa0, signed)))));
}

function isoArg(d) { return Utilities.formatDate(d, "America/Argentina/Buenos_Aires", "yyyy-MM-dd'T'HH:mm:ss") + "-03:00"; }
function xmlTag(xml, tag) { const m = xml.match(new RegExp("<(?:\\w+:)?" + tag + ">([\\s\\S]*?)</(?:\\w+:)?" + tag + ">")); return m ? m[1] : ""; }
function desescapar(t) { return t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }

/** Token y firma de ARCA para wsfe. Se guardan hasta que vencen (ARCA no da otro mientras el anterior sirve). */
function acceso() {
  const p = props(), guardado = JSON.parse(p.getProperty("ARCA_TA") || "null");
  if (guardado && new Date(guardado.vence).getTime() - Date.now() > 10 * 60 * 1000) return guardado;
  const clave = p.getProperty("ARCA_CLAVE"), cert = p.getProperty("ARCA_CERT");
  if (!clave || !cert) throw new Error("Falta el certificado. Hacé los pasos 1 y 2 del menú ARCA.");
  const ahora = new Date();
  const tra = '<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>' +
    Math.floor(ahora.getTime() / 1000) + "</uniqueId><generationTime>" + isoArg(new Date(ahora.getTime() - 10 * 60000)) +
    "</generationTime><expirationTime>" + isoArg(new Date(ahora.getTime() + 10 * 60000)) +
    "</expirationTime></header><service>wsfe</service></loginTicketRequest>";
  const sobre = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
    "<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>" + firmarCms(tra, cert, clave) + "</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>";
  const r = UrlFetchApp.fetch(WSAA_URL, { method: "post", contentType: "text/xml; charset=utf-8", headers: { SOAPAction: '""' }, payload: sobre, muteHttpExceptions: true });
  const txt = r.getContentText();
  if (r.getResponseCode() !== 200) throw new Error("ARCA no aceptó el ingreso: " + (desescapar(xmlTag(txt, "faultstring")) || ("error " + r.getResponseCode())));
  const ta = desescapar(xmlTag(txt, "loginCmsReturn"));
  const dato = { token: xmlTag(ta, "token"), sign: xmlTag(ta, "sign"), vence: xmlTag(ta, "expirationTime") };
  if (!dato.token) throw new Error("ARCA respondió sin permiso de acceso.");
  p.setProperty("ARCA_TA", JSON.stringify(dato));
  return dato;
}

function wsfe(metodo, cuerpo) {
  const a = acceso();
  const sobre = '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body><ar:' + metodo + ">" +
    "<ar:Auth><ar:Token>" + a.token + "</ar:Token><ar:Sign>" + a.sign + "</ar:Sign><ar:Cuit>" + CUIT + "</ar:Cuit></ar:Auth>" + cuerpo +
    "</ar:" + metodo + "></soap:Body></soap:Envelope>";
  const r = UrlFetchApp.fetch(WSFE_URL, { method: "post", contentType: "text/xml; charset=utf-8", headers: { SOAPAction: "http://ar.gov.afip.dif.FEV1/" + metodo }, payload: sobre, muteHttpExceptions: true });
  const txt = r.getContentText();
  const err = xmlTag(txt, "Errors");
  if (err) throw new Error("ARCA: " + desescapar(xmlTag(err, "Msg")) + " (código " + xmlTag(err, "Code") + ")");
  if (r.getResponseCode() !== 200) throw new Error("ARCA: " + (xmlTag(txt, "faultstring") || ("error " + r.getResponseCode())));
  return txt;
}

/** Número de la última factura A hecha en el punto de venta 5 (0 si nunca se hizo ninguna). */
function ultimaFacturaA() { return Number(xmlTag(wsfe("FECompUltimoAutorizado", "<ar:PtoVta>" + PUNTO_VENTA + "</ar:PtoVta><ar:CbteTipo>1</ar:CbteTipo>"), "CbteNro")); }

function probarArca() {
  const ui = SpreadsheetApp.getUi();
  try {
    const n = ultimaFacturaA();
    ui.alert("Conexión con ARCA: OK", "El programa entró a ARCA con el certificado.\nÚltima factura A del punto de venta " + PUNTO_VENTA + ": " + (n || "ninguna todavía") + ".", ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("Conexión con ARCA: no anduvo", e.message, ui.ButtonSet.OK);
  }
}

/* ---------------- app de cuentas (web): datos, acceso con PIN, mensajes, pagos y facturas ---------------- */

const LIBRO_ID = "1o9hwDQ5Yww8bs38ue48hwM-nSSsrh-vwcL2f0c_32oM";
const RESTOSOFT_ID = "1wO-WdCuwm0PtuFtz_MdcFj-uZwXlMsmZ";   // carpeta donde se suben los Excel de Resto Soft
const ARCHIVO_CUENTAS = "DETALLE DE CONSUMOS DE CUENTAS CORRIENTES";
const ALIAS_PAGO = "caleta.ycr";
const RECARGO = 0.025;
const ZONA = "America/Argentina/Buenos_Aires";
const USUARIOS = [["Matías", "admin"], ["Raquel", "usuario"], ["Yoana", "usuario"], ["Belén", "usuario"]];

const HOJAS = {
  ACCESO: ["Nombre", "PIN", "Rol"],
  CONFIG: ["Dato", "Valor"],
  CLIENTES: ["Código", "Nombre en Resto Soft", "Saludo", "WhatsApp", "CUIT", "Condición IVA", "Revisado", "Teléfono en Resto Soft"],
  SALDOS: ["Período", "Código", "Nombre", "Teléfono", "Saldo anterior", "Saldo actual", "Desde", "Hasta"],
  MOVIMIENTOS: ["Período", "Código", "Fecha", "Comprobante", "Tipo", "Debe", "Haber", "Saldo", "Detalle"],
  ESTADO: ["Período", "Código", "Mensaje enviado", "Enviado por", "Pagó", "Marcado por"],
  FACTURAS: ["Fecha", "Quién", "Tipo", "Punto de venta", "Número", "Código cliente", "Receptor", "Documento", "Condición IVA",
    "Neto", "IVA 21%", "Total", "CAE", "Vence CAE", "Detalle"],
  REGISTRO: ["Fecha", "Quién", "Acción", "Cliente", "Detalle"],
};

function libro() { return SpreadsheetApp.openById(LIBRO_ID); }
function hoja(nombre) {
  const lib = libro();
  let sh = lib.getSheetByName(nombre);
  if (!sh) {
    sh = lib.insertSheet(nombre);
    sh.getRange(1, 1, 1, HOJAS[nombre].length).setValues([HOJAS[nombre]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}
function filas(nombre) { const v = hoja(nombre).getDataRange().getValues(); v.shift(); return v; }
function ahoraTxt() { return Utilities.formatDate(new Date(), ZONA, "dd/MM/yyyy HH:mm"); }
function registrar(quien, accion, cliente, detalle) { hoja("REGISTRO").appendRow([ahoraTxt(), quien, accion, cliente || "", detalle || ""]); }

/** Crea las hojas y los usuarios. Se corre una vez desde el menú. */
function instalarApp() {
  Object.keys(HOJAS).forEach(hoja);
  const acc = hoja("ACCESO");
  if (acc.getLastRow() < 2) acc.getRange(2, 1, USUARIOS.length, 3).setValues(USUARIOS.map(u => [u[0], "", u[1]]));
  acc.getRange("B:B").setNumberFormat("@");
  hoja("CLIENTES").getRange("D:E").setNumberFormat("@");
  const cfg = hoja("CONFIG");
  if (cfg.getLastRow() < 2) cfg.getRange(2, 1, 1, 2).setValues([["Cuentas de Google que pueden abrir la app (separadas por coma)", Session.getActiveUser().getEmail()]]);
  const def = libro().getSheetByName("Hoja 1") || libro().getSheetByName("Sheet1");
  if (def && def.getLastRow() === 0 && libro().getSheets().length > 1) libro().deleteSheet(def);
  SpreadsheetApp.getUi().alert("Listo. Agregá en CONFIG la cuenta de La Caleta (separada por coma) y después publicá la app (ver instrucciones).");
}

/* ---------- acceso ---------- */

function cuentasPermitidas() {
  const f = filas("CONFIG").filter(r => String(r[0]).indexOf("Cuentas de Google") === 0)[0];
  return String(f ? f[1] : "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
}
function cuentaOk() {
  const mail = String(Session.getActiveUser().getEmail() || "").toLowerCase();
  return !!mail && cuentasPermitidas().indexOf(mail) >= 0;
}

function doGet() {
  if (!cuentaOk()) {
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width, initial-scale=1"><p style="font:17px sans-serif;padding:24px">Esta app solo se abre con la cuenta de Google de La Caleta o la de Matías.</p>').setTitle("Cuentas La Caleta");
  }
  return HtmlService.createHtmlOutput(PANTALLA).setTitle("Cuentas La Caleta")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1");
}

function nombresAcceso() {
  if (!cuentaOk()) throw new Error("Esta cuenta de Google no tiene permiso.");
  return filas("ACCESO").filter(r => r[0]).map(r => ({ nombre: String(r[0]), nuevo: !String(r[1]).trim() }));
}

function entrar(nombre, pin) {
  if (!cuentaOk()) throw new Error("Esta cuenta de Google no tiene permiso.");
  pin = String(pin || "");
  if (!/^\d{4}$/.test(pin)) throw new Error("El PIN son 4 números.");
  const sh = hoja("ACCESO"), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) !== nombre) continue;
    const guardado = String(v[i][1]).trim();
    if (!guardado) { sh.getRange(i + 1, 2).setValue(pin); registrar(nombre, "Eligió su PIN"); }
    else if (guardado !== pin) { registrar(nombre, "PIN equivocado"); throw new Error("PIN equivocado."); }
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put("t_" + token, JSON.stringify({ nombre: nombre, rol: String(v[i][2] || "usuario") }), 6 * 3600);
    return { token: token, nombre: nombre, rol: String(v[i][2] || "usuario"), nuevo: !guardado };
  }
  throw new Error("Ese nombre no está en la lista de acceso.");
}

function quien(token) {
  if (!cuentaOk()) throw new Error("Esta cuenta de Google no tiene permiso.");
  const s = CacheService.getScriptCache().get("t_" + token);
  if (!s) throw new Error("SESION");
  return JSON.parse(s);
}

/* ---------- Resto Soft: leer el Excel de cuentas corrientes ---------- */

function convertirAPlanilla(archivo) {
  const carpeta = DriveApp.getFileById(LIBRO_ID).getParents().next().getId();
  const r = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + archivo.getId() + "/copy?supportsAllDrives=true", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ name: "temporal cuentas (se borra solo)", mimeType: "application/vnd.google-apps.spreadsheet", parents: [carpeta] }),
  });
  if (r.getResponseCode() !== 200) throw new Error("No se pudo abrir el Excel de Resto Soft (" + r.getResponseCode() + ").");
  return JSON.parse(r.getContentText()).id;
}

function aFecha(x) {
  if (x instanceof Date) return Utilities.formatDate(x, ZONA, "yyyy-MM-dd");
  const m = String(x).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2) : "";
}
function aNum(x) { if (typeof x === "number") return x; const t = String(x || "").replace(/\$/g, "").trim(); if (!t) return 0; return Number(t.indexOf(",") >= 0 ? t.replace(/\./g, "").replace(",", ".") : t) || 0; }

/** Misma lectura que scripts/cuentas_corrientes.py, sobre las filas del Excel convertido. */
function leerCuentas(valores) {
  const clientes = []; let cli = null, desde = "", hasta = "";
  valores.forEach(function (fila) {
    const a = fila[0], b = fila[1], debe = aNum(fila[2]), haber = aNum(fila[3]), saldo = aNum(fila[5]);
    const ta = typeof a === "string" ? a.trim() : a, tb = typeof b === "string" ? b.trim() : String(b || "");
    if (typeof ta === "string" && ta.indexOf("Cliente:") === 0) {
      const m = ta.slice(8).trim().match(/^\((\d+)\)\s*(.*)$/);
      cli = { codigo: m ? Number(m[1]) : 0, nombre: m ? m[2].trim() : ta.slice(8).trim(), tel: "", anterior: 0, actual: 0, movs: [] };
      clientes.push(cli);
    } else if (!cli) {
      return;
    } else if (typeof ta === "string" && ta.indexOf("Domicilio:") === 0) {
      // no se usa
    } else if (typeof ta === "string" && ta.indexOf("Telefono:") === 0) {
      cli.tel = ta.slice(9).trim();
    } else if (tb.indexOf("Saldo Anterior") >= 0) {
      cli.anterior = saldo; desde = aFecha(a) || desde;
    } else if (tb.indexOf("Saldo Actual") >= 0) {
      cli.actual = saldo; hasta = aFecha(a) || hasta;
    } else if (aFecha(a)) {
      cli.movs.push({ fecha: aFecha(a), comp: tb, debe: debe, haber: haber, saldo: saldo, items: [] });
    } else if (typeof a === "number" && tb && cli.movs.length) {
      cli.movs[cli.movs.length - 1].items.push({ cant: a, desc: tb, importe: haber });
    }
  });
  clientes.forEach(function (c) {
    c.movs.forEach(function (m) {
      m.tipo = m.comp.indexOf("RE") === 0 ? "Pago"
        : (m.items.length && m.items.every(i => i.desc === "ACTUALIZACION")) ? "Actualización" : "Consumo";
    });
  });
  return { clientes: clientes, desde: desde, hasta: hasta };
}

function normalizarWa(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.indexOf("549") === 0 && d.length === 13) return d;
  if (d.indexOf("54") === 0 && d.length >= 12) d = d.slice(2);
  if (d.indexOf("9") === 0 && d.length === 11) d = d.slice(1);
  if (d.indexOf("0") === 0) d = d.slice(1);
  const m = d.match(/^(\d{2,4})15(\d{6,8})$/);
  if (m && (m[1] + m[2]).length === 10) d = m[1] + m[2];
  if (d.length === 10) return "549" + d;
  if (d.indexOf("15") === 0 && d.length === 9) return "549341" + d.slice(2);
  return "";
}

function adivinarSaludo(nombre) {
  const limpio = String(nombre || "").split("(")[0].replace(/^\d+\s+/, "").trim();
  if (!limpio || /\b(S\.?A\.?|S\.?R\.?L\.?|SAS|COOP|CLUB|ESTUDIO|EMPRESA)\b/i.test(limpio)) return "";
  const p = limpio.split(/\s+/);
  const n = p.length > 1 ? p[p.length - 1] : p[0];
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

/** Busca el último Excel de cuentas corrientes en la carpeta RESTOSOFT y lo carga. */
function importar(token) {
  const yo = quien(token);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const it = DriveApp.getFolderById(RESTOSOFT_ID).getFiles(); let ultimo = null;
    while (it.hasNext()) {
      const f = it.next();
      if (f.getName().toUpperCase().indexOf(ARCHIVO_CUENTAS) === 0 && (!ultimo || f.getLastUpdated() > ultimo.getLastUpdated())) ultimo = f;
    }
    if (!ultimo) throw new Error("No encontré el Excel '" + ARCHIVO_CUENTAS + "' en la carpeta RESTOSOFT.");
    const tmp = convertirAPlanilla(ultimo);
    let datos;
    try { datos = leerCuentas(SpreadsheetApp.openById(tmp).getSheets()[0].getDataRange().getValues()); }
    finally { DriveApp.getFileById(tmp).setTrashed(true); }
    if (!datos.hasta || !datos.clientes.length) throw new Error("El Excel no tiene el formato de cuentas corrientes de Resto Soft.");
    const periodo = datos.hasta;

    const saldos = hoja("SALDOS"), movs = hoja("MOVIMIENTOS");
    [saldos, movs].forEach(function (sh) {
      const v = sh.getDataRange().getValues();
      for (let i = v.length - 1; i >= 1; i--) if (String(v[i][0]) === periodo) sh.deleteRow(i + 1);
    });
    const fs = [], fm = [];
    datos.clientes.forEach(function (c) {
      if (!c.movs.length && Math.abs(c.actual) < 1) return;
      fs.push([periodo, c.codigo, c.nombre, c.tel, c.anterior, c.actual, datos.desde, datos.hasta]);
      c.movs.forEach(m => fm.push([periodo, c.codigo, m.fecha, m.comp, m.tipo, m.debe, m.haber, m.saldo,
        m.items.map(i => (i.cant !== 1 ? i.cant + "× " : "") + i.desc).join(" | ")]));
    });
    if (fs.length) saldos.getRange(saldos.getLastRow() + 1, 1, fs.length, fs[0].length).setValues(fs);
    if (fm.length) movs.getRange(movs.getLastRow() + 1, 1, fm.length, fm[0].length).setValues(fm);

    const cs = hoja("CLIENTES"), cv = cs.getDataRange().getValues(), ya = {};
    for (let i = 1; i < cv.length; i++) ya[String(cv[i][0])] = i + 1;
    const nuevos = [];
    datos.clientes.forEach(function (c) {
      if (ya[String(c.codigo)]) { cs.getRange(ya[String(c.codigo)], 2).setValue(c.nombre); cs.getRange(ya[String(c.codigo)], 8).setValue(c.tel); return; }
      if (!c.movs.length && Math.abs(c.actual) < 1) return;
      nuevos.push([c.codigo, c.nombre, adivinarSaludo(c.nombre), normalizarWa(c.tel), "", "", "", c.tel]);
    });
    if (nuevos.length) cs.getRange(cs.getLastRow() + 1, 1, nuevos.length, nuevos[0].length).setValues(nuevos);
    hoja("CONFIG").appendRow(["Último Excel cargado", ultimo.getName() + " · " + ahoraTxt() + " · período " + datos.desde + " al " + datos.hasta]);
    registrar(yo.nombre, "Cargó el Excel de Resto Soft", "", ultimo.getName() + " (" + fs.length + " clientes)");
    CacheService.getScriptCache().remove("datos");
    return { clientes: fs.length, nuevos: nuevos.length, desde: datos.desde, hasta: datos.hasta };
  } finally { lock.releaseLock(); }
}

/* ---------- datos para la pantalla ---------- */

function datos(token) {
  const yo = quien(token);
  const s = filas("SALDOS");
  if (!s.length) return { yo: yo, periodo: null, clientes: [] };
  const periodo = s.map(r => String(r[0])).sort().pop();
  const cli = {}; filas("CLIENTES").forEach(r => cli[String(r[0])] = r);
  const est = {}; filas("ESTADO").forEach(r => { if (String(r[0]) === periodo) est[String(r[1])] = r; });
  const fac = {}; filas("FACTURAS").forEach(r => { const k = String(r[5]); if (k) (fac[k] = fac[k] || []).push({ fecha: r[0], tipo: r[2], numero: r[4], total: r[11] }); });
  const mv = {}; filas("MOVIMIENTOS").forEach(r => { if (String(r[0]) === periodo) (mv[String(r[1])] = mv[String(r[1])] || []).push(r); });
  const todos = {}; filas("MOVIMIENTOS").forEach(r => { if (r[4] === "Pago") { const k = String(r[1]); if (!todos[k] || r[2] > todos[k]) todos[k] = String(r[2]); } });
  let desde = "", hasta = periodo;
  const lista = s.filter(r => String(r[0]) === periodo).map(function (r) {
    desde = String(r[6]);
    const k = String(r[1]), c = cli[k] || [], e = est[k] || [], m = mv[k] || [];
    const conDetalle = m.map(x => ({ fecha: String(x[2]), tipo: x[4], importe: x[4] === "Pago" ? Number(x[6]) : Number(x[5]), detalle: String(x[8] || "") }));
    return {
      codigo: Number(k), nombre: String(r[2]), saludo: String(c[2] || ""), wa: String(c[3] || ""), cuit: String(c[4] || ""),
      cond: String(c[5] || ""), revisado: String(c[6] || "") === "SÍ", tel: String(r[3] || ""),
      anterior: Number(r[4]), actual: Number(r[5]), movs: conDetalle, ultimoPago: todos[k] || "",
      enviado: String(e[2] || ""), enviadoPor: String(e[3] || ""), pago: String(e[4] || ""), pagoPor: String(e[5] || ""),
      facturas: fac[k] || [],
    };
  });
  return { yo: yo, periodo: { desde: desde, hasta: hasta }, clientes: lista, alias: ALIAS_PAGO, recargo: RECARGO };
}

function guardarCliente(token, codigo, d) {
  const yo = quien(token);
  const wa = normalizarWa(d.wa);
  if (d.wa && !wa) throw new Error("Ese número de WhatsApp no parece válido. Ponelo con característica, por ejemplo 341 5123456.");
  const cuit = String(d.cuit || "").replace(/\D/g, "");
  if (cuit && !cuitValido(cuit)) throw new Error("Ese CUIT no es válido. Revisá los 11 números.");
  const cs = hoja("CLIENTES"), v = cs.getDataRange().getValues();
  let fila = 0; for (let i = 1; i < v.length; i++) if (String(v[i][0]) === String(codigo)) fila = i + 1;
  if (!fila) { cs.appendRow([codigo, d.nombre || "", "", "", "", "", "", ""]); fila = cs.getLastRow(); }
  cs.getRange(fila, 3, 1, 5).setValues([[String(d.saludo || "").trim(), wa, cuit, String(d.cond || ""), "SÍ"]]);
  registrar(yo.nombre, "Actualizó datos del cliente", d.nombre || codigo, "saludo: " + (d.saludo || "") + ", WhatsApp: " + (wa || "-") + ", CUIT: " + (cuit || "-"));
  return { wa: wa, cuit: cuit };
}

function marcar(token, codigo, nombre, que, valor) {
  const yo = quien(token), periodo = filas("SALDOS").map(r => String(r[0])).sort().pop() || "";
  if (!periodo) throw new Error("Primero cargá el Excel de Resto Soft.");
  const sh = hoja("ESTADO"), v = sh.getDataRange().getValues();
  let fila = 0; for (let i = 1; i < v.length; i++) if (String(v[i][0]) === periodo && String(v[i][1]) === String(codigo)) fila = i + 1;
  if (!fila) { sh.appendRow([periodo, codigo, "", "", "", ""]); fila = sh.getLastRow(); }
  const col = que === "enviado" ? 3 : 5;
  sh.getRange(fila, col, 1, 2).setValues([[valor ? ahoraTxt() : "", valor ? yo.nombre : ""]]);
  registrar(yo.nombre, que === "enviado" ? "Mandó el WhatsApp" : (valor ? "Marcó que pagó" : "Sacó la marca de pago"), nombre, "período " + periodo);
  return true;
}

/* ---------- CUIT ---------- */

function cuitValido(c) {
  c = String(c || "").replace(/\D/g, "");
  if (c.length !== 11) return false;
  const m = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]; let s = 0;
  for (let i = 0; i < 10; i++) s += Number(c[i]) * m[i];
  let v = 11 - (s % 11); v = v === 11 ? 0 : v === 10 ? 9 : v;
  return v === Number(c[10]);
}

function sinTildes(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

/** CUIT de la lista vieja (hoja CUIT) que coinciden con alguna palabra del nombre del cliente. */
function sugerirCuit(token, nombre) {
  quien(token);
  const palabras = sinTildes(nombre).split(/[^a-z]+/).filter(p => p.length >= 4);
  if (!palabras.length) return [];
  return filas("CUIT").filter(r => cuitValido(r[1]) && palabras.some(p => sinTildes(r[0]).indexOf(p) >= 0))
    .map(r => ({ texto: String(r[0]), cuit: String(r[1]).replace(/\D/g, "") })).slice(0, 6);
}

/* ---------- facturas A y B ---------- */

const COND_IVA = { "1": "Responsable inscripto", "6": "Monotributista", "4": "Exento", "5": "Consumidor final" };
const DOC = { "80": "CUIT", "96": "DNI", "99": "Sin identificar" };

function dosDec(n) { return Math.round(n * 100) / 100; }
function fmt(n) { return dosDec(n).toFixed(2); }

/**
 * Hace la factura en ARCA. f = {codigo, nombre, tipo: "A"|"B", total, cond, docTipo, docNro, detalle, domicilio}
 * El total ya tiene el IVA incluido (21 %).
 */
function facturar(token, f) {
  const yo = quien(token);
  const tipo = f.tipo === "A" ? 1 : f.tipo === "B" ? 6 : 0;
  if (!tipo) throw new Error("Elegí factura A o B.");
  const total = dosDec(Number(f.total));
  if (!(total > 0)) throw new Error("Poné el importe total.");
  if (total > 50000000) throw new Error("El importe parece muy alto. Revisalo.");
  let cond = String(f.cond || ""), docTipo = String(f.docTipo || ""), docNro = String(f.docNro || "").replace(/\D/g, "");
  if (tipo === 1) {
    if (cond !== "1" && cond !== "6") throw new Error("La factura A es para responsables inscriptos o monotributistas.");
    docTipo = "80";
    if (!cuitValido(docNro)) throw new Error("El CUIT no es válido. Revisá los 11 números.");
  } else {
    if (cond !== "5" && cond !== "4") cond = "5";
    if (docTipo === "80" && !cuitValido(docNro)) throw new Error("El CUIT no es válido.");
    if (docTipo === "96" && !(docNro.length >= 7 && docNro.length <= 8)) throw new Error("El DNI tiene que tener 7 u 8 números.");
    if (docTipo !== "80" && docTipo !== "96") { docTipo = "99"; docNro = "0"; }
  }
  const neto = dosDec(total / 1.21), iva = dosDec(total - neto);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const ult = Number(xmlTag(wsfe("FECompUltimoAutorizado", "<ar:PtoVta>" + PUNTO_VENTA + "</ar:PtoVta><ar:CbteTipo>" + tipo + "</ar:CbteTipo>"), "CbteNro"));
    const n = ult + 1, hoy = Utilities.formatDate(new Date(), ZONA, "yyyyMMdd");
    const det = "<ar:FECAEDetRequest><ar:Concepto>1</ar:Concepto><ar:DocTipo>" + docTipo + "</ar:DocTipo><ar:DocNro>" + docNro + "</ar:DocNro>" +
      "<ar:CbteDesde>" + n + "</ar:CbteDesde><ar:CbteHasta>" + n + "</ar:CbteHasta><ar:CbteFch>" + hoy + "</ar:CbteFch>" +
      "<ar:ImpTotal>" + fmt(total) + "</ar:ImpTotal><ar:ImpTotConc>0</ar:ImpTotConc><ar:ImpNeto>" + fmt(neto) + "</ar:ImpNeto>" +
      "<ar:ImpOpEx>0</ar:ImpOpEx><ar:ImpTrib>0</ar:ImpTrib><ar:ImpIVA>" + fmt(iva) + "</ar:ImpIVA>" +
      "<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>" + cond + "</ar:CondicionIVAReceptorId>" +
      "<ar:Iva><ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>" + fmt(neto) + "</ar:BaseImp><ar:Importe>" + fmt(iva) + "</ar:Importe></ar:AlicIva></ar:Iva>" +
      "</ar:FECAEDetRequest>";
    const r = wsfe("FECAESolicitar", "<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>" + PUNTO_VENTA + "</ar:PtoVta><ar:CbteTipo>" + tipo +
      "</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq>" + det + "</ar:FeDetReq></ar:FeCAEReq>");
    const resp = xmlTag(r, "FECAEDetResponse");
    if (xmlTag(resp, "Resultado") !== "A") {
      const obs = xmlTag(resp, "Observaciones");
      throw new Error("ARCA rechazó la factura: " + (desescapar(xmlTag(obs, "Msg")) || "sin detalle") + (obs ? " (código " + xmlTag(obs, "Code") + ")" : ""));
    }
    const cae = xmlTag(resp, "CAE"), vto = xmlTag(resp, "CAEFchVto");
    const numero = ("0000" + PUNTO_VENTA).slice(-5) + "-" + ("0000000" + n).slice(-8);
    const receptor = String(f.nombre || "").trim() || "Consumidor final";
    hoja("FACTURAS").appendRow([ahoraTxt(), yo.nombre, "Factura " + f.tipo, PUNTO_VENTA, numero, f.codigo || "", receptor,
      (DOC[docTipo] || "") + (docTipo !== "99" ? " " + docNro : ""), COND_IVA[cond], neto, iva, total, cae,
      vto.slice(6, 8) + "/" + vto.slice(4, 6) + "/" + vto.slice(0, 4), String(f.detalle || "") + (f.domicilio ? " · Domicilio: " + f.domicilio : "")]);
    registrar(yo.nombre, "Hizo la factura " + f.tipo + " " + numero, receptor, "$" + fmt(total) + " · CAE " + cae);
    return { numero: numero, cae: cae, vence: vto.slice(6, 8) + "/" + vto.slice(4, 6) + "/" + vto.slice(0, 4), total: total, neto: neto, iva: iva, tipo: f.tipo };
  } finally { lock.releaseLock(); }
}

function ultimasFacturas(token) {
  quien(token);
  return filas("FACTURAS").slice(-15).reverse().map(r => ({ fecha: String(r[0]), quien: String(r[1]), tipo: String(r[2]), numero: String(r[4]), receptor: String(r[6]), total: Number(r[11]), cae: String(r[12]) }));
}

/* ---------------- pantalla de la app (copia de Pantalla.html) ---------------- */

const PANTALLA = `<!DOCTYPE html>
<html lang="es">
<head>
<base target="_blank">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Cuentas La Caleta</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Marcellus&display=swap">
<style>
:root{--paper:#f6f4ef;--card:#fff;--ink:#161616;--muted:#6b6760;--line:#e3dfd6;--in:#2f6b4f;--in-bg:#e7f0ea;--out:#9b3b2e;--warn:#a8661b;--warn-bg:#fbf1e3;--wa:#1f8a4c;--wa-chat:#efeae2;--wa-bubble:#d9fdd3;--wa-ink:#111b21;--logo-f:none;
--f-display:"Marcellus","Optima",Georgia,serif;--f-body:"Figtree",-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
@media (prefers-color-scheme:dark){:root{--paper:#121211;--card:#1c1c1a;--ink:#f2efe8;--muted:#a39f96;--line:#2e2d2a;--in:#7cc59f;--in-bg:#1b2b22;--out:#ec8f80;--warn:#e6a659;--warn-bg:#2c2216;--wa:#25a35a;--wa-chat:#0b141a;--wa-bubble:#005c4b;--wa-ink:#e9edef;--logo-f:invert(1);color-scheme:dark}}
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 var(--f-body)}
.wrap{max-width:560px;margin:0 auto;padding:18px 16px 48px;display:grid;gap:18px}
header{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px}
.logo{width:50px;height:auto;filter:var(--logo-f)}
.brand{font:23px/1.1 var(--f-display);letter-spacing:.12em}
.brand small{display:block;font:600 13px var(--f-body);color:var(--muted);margin-top:4px;letter-spacing:0}
.yo{font-size:13px;color:var(--muted);text-align:right}
.yo button{font:600 13px var(--f-body);background:none;border:0;color:var(--muted);text-decoration:underline;cursor:pointer;padding:2px}
h2{margin:0;font:600 15px var(--f-body);color:var(--muted)}
.total{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;display:grid;gap:4px}
.total b{font:34px/1.1 var(--f-display);font-variant-numeric:tabular-nums}
.total span{color:var(--muted);font-size:14px}
.acc{display:grid;grid-template-columns:1fr 1fr;gap:8px}
input,select,textarea{font:16px var(--f-body);width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink)}
label{display:grid;gap:4px;font-weight:600;font-size:14px}
label small{font-weight:400;color:var(--muted)}
nav{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px}
nav button{font:600 14px var(--f-body);padding:10px 2px;border:0;border-radius:10px;background:transparent;color:var(--muted);cursor:pointer}
nav button.on{background:var(--ink);color:var(--paper)}
.list{display:grid;gap:8px}
.cli{display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:10px;text-align:left;width:100%;font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 12px;cursor:pointer;min-height:62px}
.cli b{font-weight:600;display:block}.cli small{color:var(--muted);font-size:13px}
.cli .monto{font:19px var(--f-display);font-variant-numeric:tabular-nums;text-align:right}
.cli .monto small{display:block;font:600 12px var(--f-body)}
.av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font:16px var(--f-display);background:var(--paper);border:1px solid var(--line)}
.cli.viejo{border-color:var(--warn);background:var(--warn-bg)}.cli.viejo .monto small{color:var(--warn)}
.cli.enviado .monto small{color:var(--in)}
.cli.pago .av{background:var(--in);color:var(--card);border-color:var(--in)}.cli.pago .monto small{color:var(--in)}
.sheet{position:fixed;inset:0;background:rgba(10,10,10,.45);display:grid;place-items:end center;z-index:5}
.box{background:var(--card);width:min(520px,100%);max-height:94vh;overflow:auto;border-radius:22px 22px 0 0;display:grid;gap:14px;padding:22px 18px 28px}
@media (min-width:640px){.sheet{place-items:center}.box{border-radius:22px}}
.top{display:flex;justify-content:space-between;align-items:start;gap:10px}
.box h3{margin:0;font:25px/1.15 var(--f-display)}
.sub{color:var(--muted);font-size:14px}
.close{font:600 15px var(--f-body);background:none;border:0;color:var(--muted);cursor:pointer;padding:6px}
.chat{background:var(--wa-chat);border-radius:16px;padding:14px 12px}
.bubble{background:var(--wa-bubble);color:var(--wa-ink);border-radius:10px 2px 10px 10px;padding:9px 11px 6px;font:15px/1.4 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;white-space:pre-wrap;word-break:break-word;max-width:94%;margin-left:auto}
.wa,.solo{display:block;font:700 18px var(--f-body);padding:17px 10px;border:0;border-radius:16px;color:#fff;cursor:pointer;text-align:center;text-decoration:none;width:100%}
.wa{background:var(--wa)}.solo{background:var(--ink);color:var(--paper)}
.solo.rojo{background:var(--out);color:#fff}
.wa.off,.solo:disabled{opacity:.4;pointer-events:none}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ghost{font:600 15px var(--f-body);padding:14px 8px;border-radius:14px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer;width:100%}
.ghost.ok{background:var(--in);border-color:var(--in);color:var(--card)}
.ghost.sel{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.nota{margin:0;color:var(--muted);font-size:13px}
.aviso{margin:0;padding:12px;border-radius:12px;background:var(--warn-bg);border:1px solid var(--warn);font-size:15px}
.bien{margin:0;padding:12px;border-radius:12px;background:var(--in-bg);font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font:600 14px var(--f-body);padding:8px 12px;border-radius:999px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer}
.chip.sel{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.pin{display:flex;justify-content:center;gap:12px}.pin span{width:18px;height:18px;border-radius:50%;border:2px solid var(--ink)}.pin span.on{background:var(--ink)}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pad button{font:24px var(--f-display);padding:12px 0;border-radius:14px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer}
.resumen{display:grid;gap:6px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px}
.resumen div{display:flex;justify-content:space-between;gap:12px}.resumen b{font-variant-numeric:tabular-nums}
.resumen .grande{font:28px var(--f-display)}
:focus-visible{outline:3px solid var(--warn);outline-offset:2px}
</style>
</head>
<body>
<div class="wrap">
  <header><img class="logo" alt="La Caleta" src="data:image/png;base64,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"><div class="brand">LA CALETA<small id="per">Cuentas corrientes</small></div><div class="yo" id="yo"></div></header>

  <section id="vEntrar" hidden>
    <h2>¿Quién sos?</h2>
    <div class="chips" id="nombres"></div>
    <div id="pinBox" hidden style="display:grid;gap:14px">
      <p class="nota" id="pinTxt"></p>
      <div class="pin" id="dots"><span></span><span></span><span></span><span></span></div>
      <div class="pad" id="pad"></div>
      <p class="aviso" id="pinErr" hidden></p>
    </div>
  </section>

  <section id="vApp" hidden style="display:grid;gap:16px">
    <div class="total"><span>Para cobrar</span><b id="tot">…</b><span id="totsub"></span></div>
    <div class="acc"><button class="ghost" id="bCargar">Cargar Excel nuevo</button><button class="ghost" id="bNueva">Nueva factura</button></div>
    <input id="busca" type="search" placeholder="Buscar cliente" autocomplete="off">
    <nav id="filtros"><button class="on" data-f="deben">Deben</button><button data-f="enviados">Enviados</button><button data-f="pagaron">Pagaron</button><button data-f="todos">Todos</button></nav>
    <div class="list" id="lista"></div>
    <button class="ghost" id="bFacturas">Ver últimas facturas</button>
  </section>
  <p class="nota" id="cargando">Cargando…</p>
</div>
<div class="sheet" id="sheet" hidden><div class="box" id="box"></div></div>

<script>
var NL = String.fromCharCode(10), DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
var TOKEN = null, D = null, filtro = "deben", usuario = "", pin = "";
function $(i) { return document.getElementById(i); }
function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function pesos(n) { return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("es-AR"); }
function pesos2(n) { return "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function dm(f) { return f ? f.slice(8, 10) + "/" + f.slice(5, 7) : ""; }
function dia(f) { var d = new Date(f + "T12:00:00"); return DIAS[d.getDay()] + " " + dm(f); }
function cap(t) { t = String(t || "").trim(); return t.charAt(0).toUpperCase() + t.slice(1); }
function run(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  return new Promise(function (ok, mal) {
    google.script.run.withSuccessHandler(ok).withFailureHandler(function (e) {
      if (String(e && e.message).indexOf("SESION") >= 0) { TOKEN = null; entrarPantalla(); }
      mal(e);
    })[fn].apply(null, args);
  });
}
function cerrar() { $("sheet").hidden = true; $("box").textContent = ""; }
$("sheet").addEventListener("click", function (e) { if (e.target === this) cerrar(); });

/* ---------- entrar con PIN ---------- */
function entrarPantalla() {
  $("vApp").hidden = true; $("vEntrar").hidden = false; $("cargando").hidden = true; $("yo").textContent = ""; cerrar();
  run("nombresAcceso").then(function (ns) {
    var c = $("nombres"); c.textContent = "";
    ns.forEach(function (n) {
      var b = document.createElement("button"); b.className = "chip"; b.textContent = n.nombre;
      b.onclick = function () {
        usuario = n.nombre; pin = ""; puntos();
        Array.prototype.forEach.call(c.children, function (x) { x.classList.toggle("sel", x === b); });
        $("pinBox").hidden = false; $("pinErr").hidden = true;
        $("pinTxt").textContent = n.nuevo ? "Es tu primera vez: elegí un PIN de 4 números y acordátelo." : "Poné tu PIN.";
      };
      c.appendChild(b);
    });
  }).catch(function (e) { $("nombres").textContent = e.message; });
}
function puntos() { Array.prototype.forEach.call($("dots").children, function (s, i) { s.classList.toggle("on", i < pin.length); }); }
(function () {
  var p = $("pad");
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].forEach(function (k) {
    var b = document.createElement("button"); b.textContent = k; if (!k) b.style.visibility = "hidden";
    b.onclick = function () {
      if (k === "⌫") pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
      puntos();
      if (pin.length === 4) {
        run("entrar", usuario, pin).then(function (r) { TOKEN = r.token; $("vEntrar").hidden = true; cargar(); })
          .catch(function (e) { pin = ""; puntos(); $("pinErr").hidden = false; $("pinErr").textContent = e.message; });
      }
    };
    p.appendChild(b);
  });
})();

/* ---------- datos ---------- */
function cargar() {
  $("cargando").hidden = false;
  run("datos", TOKEN).then(function (d) {
    D = d; $("cargando").hidden = true; $("vApp").hidden = false;
    $("yo").innerHTML = esc(d.yo.nombre) + '<br><button id="bSalir">Salir</button>';
    $("bSalir").onclick = function () { TOKEN = null; entrarPantalla(); };
    $("per").textContent = d.periodo ? "Cuentas corrientes · " + dm(d.periodo.desde) + " al " + dm(d.periodo.hasta) : "Cuentas corrientes";
    dibujar();
  }).catch(function (e) { $("cargando").textContent = e.message; });
}
function saldo(c) { return c.actual; }
function consumos(c) { return c.movs.filter(function (m) { return m.tipo === "Consumo"; }); }
function estado(c) { return c.pago ? "pagaron" : c.enviado ? "enviados" : "deben"; }
function diasSinPagar(c) {
  if (!c.ultimoPago || !D.periodo) return null;
  return Math.round((new Date(D.periodo.hasta + "T12:00:00") - new Date(c.ultimoPago + "T12:00:00")) / 86400000);
}
function dibujar() {
  var L = $("lista"), q = $("busca").value.trim().toLowerCase(), tot = 0, n = 0;
  L.textContent = "";
  if (!D.periodo) { L.innerHTML = '<p class="nota">Todavía no hay datos. Subí el Excel de Resto Soft a la carpeta RESTOSOFT y tocá <b>Cargar Excel nuevo</b>.</p>'; $("tot").textContent = "$0"; $("totsub").textContent = ""; return; }
  D.clientes.forEach(function (c) { if (!c.pago && c.actual > 0) { tot += c.actual; n++; } });
  $("tot").textContent = pesos(tot); $("totsub").textContent = n + (n === 1 ? " cliente debe" : " clientes deben");
  var lista = D.clientes.filter(function (c) {
    if (q) return c.nombre.toLowerCase().indexOf(q) >= 0;
    if (filtro === "todos") return true;
    if (filtro === "deben") return estado(c) === "deben" && c.actual > 0;
    return estado(c) === filtro;
  }).sort(function (a, b) { return b.actual - a.actual; });
  lista.forEach(function (c) {
    var ds = diasSinPagar(c), viejo = !c.pago && c.actual > 0 && (ds === null || ds > 30);
    var b = document.createElement("button");
    b.className = "cli" + (c.pago ? " pago" : c.enviado ? " enviado" : viejo ? " viejo" : "");
    var nota = c.pago ? "Pagó" : c.enviado ? "Mensaje enviado" : c.actual <= 0 ? "Al día" : ds === null ? "Sin pagos registrados" : ds > 30 ? "Sin pagar hace " + ds + " días" : "Pagó hace " + ds + " días";
    var cs = consumos(c).length;
    b.innerHTML = '<span class="av">' + esc(c.nombre.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, "").split(" ").filter(Boolean).map(function (p) { return p[0]; }).join("").slice(0, 2)) + '</span><span><b>' + esc(c.nombre) + '</b><small>' +
      (cs ? cs + (cs === 1 ? " consumo" : " consumos") : "Sin consumos") + (!c.revisado ? " · revisar datos" : "") + '</small></span><span class="monto">' + pesos(c.pago ? 0 : c.actual) + '<small>' + nota + '</small></span>';
    b.onclick = function () { abrir(c); };
    L.appendChild(b);
  });
  if (!lista.length) L.innerHTML = '<p class="nota">' + (q ? "No hay clientes con ese nombre." : filtro === "pagaron" ? "Todavía nadie pagó en este período." : filtro === "enviados" ? "Todavía no se mandaron mensajes. Tocá un cliente para mandarle el suyo." : "Nadie debe en este período.") + '</p>';
}
$("busca").oninput = dibujar;
Array.prototype.forEach.call($("filtros").children, function (b) {
  b.onclick = function () { filtro = b.dataset.f; Array.prototype.forEach.call($("filtros").children, function (x) { x.classList.toggle("on", x === b); }); dibujar(); };
});

/* ---------- mensaje de WhatsApp ---------- */
function cosas(detalle) {
  return detalle.split(" | ").filter(Boolean).map(function (x) { return x.replace(/[*]/g, "").trim().toLowerCase(); }).join(", ");
}
function mensaje(c) {
  var L = [];
  L.push("Hola" + (c.saludo ? " " + c.saludo : "") + " 👋");
  L.push("Te escribimos de *La Caleta* con el resumen de tu cuenta corriente del " + dm(D.periodo.desde) + " al " + dm(D.periodo.hasta) + ".");
  L.push("");
  if (Math.abs(c.anterior) >= 1) L.push("*Saldo anterior:* " + pesos(c.anterior), "");
  var cons = consumos(c), act = c.movs.filter(function (m) { return m.tipo === "Actualización"; }), pag = c.movs.filter(function (m) { return m.tipo === "Pago"; });
  if (cons.length) { L.push("*Consumos*"); cons.forEach(function (m) { L.push("▪️ " + dia(m.fecha) + " — " + pesos(m.importe)); if (m.detalle) L.push("_" + cap(cosas(m.detalle)) + "_"); }); L.push(""); }
  if (act.length) { L.push("*Actualización semanal (" + String(D.recargo * 100).replace(".", ",") + "%)*"); act.forEach(function (m) { L.push("▪️ " + dia(m.fecha) + " — " + pesos(m.importe)); }); L.push(""); }
  if (pag.length) { L.push("*Pagos recibidos*"); pag.forEach(function (m) { L.push("▪️ " + dia(m.fecha) + " — " + pesos(m.importe)); }); L.push(""); }
  if (c.actual <= 0) L.push("✅ *Tu cuenta está al día.* ¡Gracias!");
  else {
    L.push("*Total a pagar: " + pesos(c.actual) + "*", "");
    L.push("Podés pagarlo en el salón o por transferencia al alias *" + D.alias + "*.");
    L.push("El saldo que quede sin pagar el miércoles se actualiza un " + String(D.recargo * 100).replace(".", ",") + "%.");
  }
  L.push("", "¡Gracias! La Caleta · Yacht Club Rosario");
  return L.join(NL);
}
function burbuja(t) {
  var negrita = new RegExp("[*]([^*" + NL + "]+)[*]", "g"), curs = new RegExp("_([^_" + NL + "]+)_", "g");
  return esc(t).replace(negrita, "<b>$1</b>").replace(curs, "<i>$1</i>");
}

/* ---------- cliente ---------- */
function abrir(c) {
  var t = mensaje(c), B = $("box");
  var waOk = !!c.wa;
  B.innerHTML = '<div class="top"><div><h3>' + esc(c.nombre) + '</h3><div class="sub">' + (c.wa ? "WhatsApp +" + esc(c.wa) : "Sin WhatsApp") + ' · debe ' + pesos(c.actual) + '</div></div><button class="close" id="x">Cerrar</button></div>' +
    (!c.revisado ? '<p class="aviso">Revisá el saludo y el WhatsApp antes de mandar. Es una sola vez por cliente.</p>' : '') +
    '<div class="chat"><div class="bubble">' + burbuja(t) + '</div></div>' +
    (waOk ? '<a class="wa" id="env" href="https://wa.me/' + esc(c.wa) + '?text=' + encodeURIComponent(t) + '">Mandar por WhatsApp</a>' : '<button class="solo" id="env">Cargar el WhatsApp para mandar</button>') +
    '<div class="two"><button class="ghost' + (c.pago ? " ok" : "") + '" id="bPago">' + (c.pago ? "Pagó ✓" : "Marcar que pagó") + '</button><button class="ghost" id="bCopiar">Copiar mensaje</button></div>' +
    '<div class="two"><button class="ghost" id="bFA">Factura A</button><button class="ghost" id="bFB">Factura B</button></div>' +
    '<button class="ghost" id="bDatos">' + (c.revisado ? "Editar datos del cliente" : "Revisar datos del cliente") + '</button>' +
    (c.enviado ? '<p class="nota">Mensaje enviado el ' + esc(c.enviado) + ' por ' + esc(c.enviadoPor) + '.</p>' : '') +
    (c.pago ? '<p class="nota">Pago marcado el ' + esc(c.pago) + ' por ' + esc(c.pagoPor) + '.</p>' : '') +
    (c.facturas.length ? '<p class="nota">Facturas: ' + c.facturas.map(function (f) { return esc(f.tipo + " " + f.numero + " (" + pesos(f.total) + ")"); }).join(", ") + '</p>' : '');
  $("sheet").hidden = false; B.scrollTop = 0;
  $("x").onclick = cerrar;
  if (waOk) $("env").onclick = function () { c.enviado = "ahora"; c.enviadoPor = D.yo.nombre; run("marcar", TOKEN, c.codigo, c.nombre, "enviado", true).catch(function () {}); setTimeout(dibujar, 300); };
  else $("env").onclick = function () { datosCliente(c); };
  $("bPago").onclick = function () {
    var nuevo = !c.pago; this.disabled = true;
    run("marcar", TOKEN, c.codigo, c.nombre, "pago", nuevo).then(function () { c.pago = nuevo ? "recién" : ""; c.pagoPor = D.yo.nombre; cerrar(); dibujar(); })
      .catch(function (e) { alerta(e.message); });
  };
  $("bCopiar").onclick = function () {
    var b = this;
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { b.textContent = "Copiado ✓"; }, function () { b.textContent = "No se pudo copiar"; });
  };
  $("bFA").onclick = function () { formFactura("A", c); };
  $("bFB").onclick = function () { formFactura("B", c); };
  $("bDatos").onclick = function () { datosCliente(c); };
}
function alerta(m) { var p = document.createElement("p"); p.className = "aviso"; p.textContent = m; $("box").appendChild(p); p.scrollIntoView({ block: "nearest" }); }

function datosCliente(c) {
  var B = $("box");
  B.innerHTML = '<div class="top"><div><h3>Datos del cliente</h3><div class="sub">' + esc(c.nombre) + (c.tel ? ' · tel. en Resto Soft: ' + esc(c.tel) : '') + '</div></div><button class="close" id="x">Volver</button></div>' +
    '<label>Saludo <small>Cómo arranca el mensaje: "Hola Carlos"</small><input id="fSal" value="' + esc(c.saludo) + '" placeholder="Carlos"></label>' +
    '<label>WhatsApp <small>Con característica, ej. 341 5123456</small><input id="fWa" type="tel" value="' + esc(c.wa ? c.wa.replace(/^549/, "") : "") + '"></label>' +
    '<label>CUIT <small>Solo si pide factura A</small><input id="fCuit" inputmode="numeric" value="' + esc(c.cuit) + '"></label>' +
    '<div class="chips" id="sug"></div>' +
    '<label>Condición frente al IVA<select id="fCond"><option value="">No sé / no pide factura</option><option value="1">Responsable inscripto</option><option value="6">Monotributista</option><option value="4">Exento</option><option value="5">Consumidor final</option></select></label>' +
    '<button class="solo" id="bGuardar">Guardar datos</button>';
  $("fCond").value = c.cond || "";
  $("x").onclick = function () { abrir(c); };
  run("sugerirCuit", TOKEN, c.nombre).then(function (s) {
    if (!s.length) return;
    var d = $("sug"); d.innerHTML = '<p class="nota" style="width:100%">De la lista de CUIT:</p>';
    s.forEach(function (x) { var b = document.createElement("button"); b.className = "chip"; b.textContent = x.texto; b.onclick = function () { $("fCuit").value = x.cuit; }; d.appendChild(b); });
  }).catch(function () {});
  $("bGuardar").onclick = function () {
    var b = this; b.disabled = true; b.textContent = "Guardando…";
    var nuevo = { nombre: c.nombre, saludo: $("fSal").value, wa: $("fWa").value, cuit: $("fCuit").value, cond: $("fCond").value };
    run("guardarCliente", TOKEN, c.codigo, nuevo).then(function (r) {
      c.saludo = nuevo.saludo.trim(); c.wa = r.wa; c.cuit = r.cuit; c.cond = nuevo.cond; c.revisado = true; abrir(c); dibujar();
    }).catch(function (e) { b.disabled = false; b.textContent = "Guardar datos"; alerta(e.message); });
  };
}

/* ---------- facturas ---------- */
function formFactura(tipo, c) {
  var B = $("box"), total = c ? consumos(c).reduce(function (s, m) { return s + m.importe; }, 0) : 0;
  var detalle = c && D.periodo ? "Consumos del " + dm(D.periodo.desde) + " al " + dm(D.periodo.hasta) : "";
  B.innerHTML = '<div class="top"><div><h3>Nueva factura</h3><div class="sub">' + (c ? esc(c.nombre) : "Cargada a mano") + '</div></div><button class="close" id="x">' + (c ? "Volver" : "Cerrar") + '</button></div>' +
    '<div class="two"><button class="ghost" id="tA">Factura A</button><button class="ghost" id="tB">Factura B</button></div>' +
    '<div id="campos" style="display:grid;gap:12px"></div>' +
    '<label>Importe total <small>Con el IVA incluido</small><input id="fTot" inputmode="decimal" value="' + (total ? String(Math.round(total * 100) / 100).replace(".", ",") : "") + '" placeholder="0,00"></label>' +
    '<p class="nota" id="desglose"></p>' +
    '<label>Detalle <small>Para el registro interno</small><input id="fDet" value="' + esc(detalle) + '"></label>' +
    '<button class="solo" id="bRev">Revisar factura</button>';
  $("x").onclick = function () { if (c) abrir(c); else cerrar(); };
  function elegir(t) {
    tipo = t; $("tA").classList.toggle("sel", t === "A"); $("tB").classList.toggle("sel", t === "B");
    var k = $("campos");
    if (t === "A") {
      k.innerHTML = '<label>Nombre o razón social<input id="fNom" value="' + esc(c ? c.nombre : "") + '"></label>' +
        '<label>CUIT<input id="fDoc" inputmode="numeric" value="' + esc(c ? c.cuit : "") + '"></label><div class="chips" id="sugF"></div>' +
        '<label>Condición frente al IVA<select id="fCond"><option value="1">Responsable inscripto</option><option value="6">Monotributista</option></select></label>';
      if (c && c.cond === "6") $("fCond").value = "6";
      if (c && !c.cuit) run("sugerirCuit", TOKEN, c.nombre).then(function (s) {
        var d = $("sugF"); if (!d) return;
        s.forEach(function (x) { var b = document.createElement("button"); b.className = "chip"; b.textContent = x.texto; b.onclick = function () { $("fDoc").value = x.cuit; }; d.appendChild(b); });
      }).catch(function () {});
    } else {
      k.innerHTML = '<label>¿A nombre de alguien?<select id="fDocTipo"><option value="99">No, consumidor final sin datos</option><option value="96">Sí, con DNI</option><option value="80">Sí, con CUIT</option></select></label>' +
        '<div id="conNombre" hidden style="display:grid;gap:12px"><label>Nombre y apellido<input id="fNom" value="' + esc(c ? c.nombre : "") + '"></label>' +
        '<label id="lDoc">Número<input id="fDoc" inputmode="numeric"></label><label>Domicilio <small>Opcional</small><input id="fDom"></label></div>' +
        '<label>Condición frente al IVA<select id="fCond"><option value="5">Consumidor final</option><option value="4">Exento</option></select></label>';
      if (c && c.cond === "4") $("fCond").value = "4";
      $("fDocTipo").onchange = function () { $("conNombre").hidden = this.value === "99"; };
    }
  }
  $("tA").onclick = function () { elegir("A"); };
  $("tB").onclick = function () { elegir("B"); };
  elegir(tipo);
  function numTot() { return Number(String($("fTot").value).replace(/[.]/g, "").replace(",", ".")) || 0; }
  function desg() { var t = numTot(), n = Math.round(t / 1.21 * 100) / 100; $("desglose").textContent = t ? "Neto " + pesos2(n) + " + IVA 21% " + pesos2(Math.round((t - n) * 100) / 100) : ""; }
  $("fTot").oninput = desg; desg();
  $("bRev").onclick = function () {
    var f = { codigo: c ? c.codigo : "", tipo: tipo, total: numTot(), cond: $("fCond").value, detalle: $("fDet").value,
      nombre: $("fNom") ? $("fNom").value : "", docTipo: tipo === "A" ? "80" : $("fDocTipo").value, docNro: $("fDoc") ? $("fDoc").value : "", domicilio: $("fDom") ? $("fDom").value : "" };
    if (tipo === "B" && f.docTipo === "99") { f.nombre = "Consumidor final"; f.docNro = ""; }
    if (!f.total) return alerta("Poné el importe total.");
    confirmar(f, c);
  };
}
function confirmar(f, c) {
  var B = $("box"), n = Math.round(f.total / 1.21 * 100) / 100, iva = Math.round((f.total - n) * 100) / 100;
  var conds = { "1": "Responsable inscripto", "6": "Monotributista", "4": "Exento", "5": "Consumidor final" };
  var doc = f.docTipo === "80" ? "CUIT " + f.docNro : f.docTipo === "96" ? "DNI " + f.docNro : "Sin identificar";
  B.innerHTML = '<div class="top"><div><h3>¿Hacemos la factura ' + f.tipo + '?</h3><div class="sub">Revisá todo antes de confirmar</div></div><button class="close" id="x">Volver</button></div>' +
    '<div class="resumen"><div><span>Para</span><b>' + esc(f.nombre || "Consumidor final") + '</b></div><div><span>Documento</span><b>' + esc(doc) + '</b></div>' +
    '<div><span>Condición IVA</span><b>' + conds[f.cond] + '</b></div><div><span>Neto</span><b>' + pesos2(n) + '</b></div><div><span>IVA 21%</span><b>' + pesos2(iva) + '</b></div>' +
    '<div><span>Total</span><b class="grande">' + pesos2(f.total) + '</b></div></div>' +
    '<p class="aviso">Una factura no se puede borrar. Si sale con un error, se anula con una nota de crédito.</p>' +
    '<button class="solo rojo" id="bOk">Confirmar y hacer la factura</button>';
  $("x").onclick = function () { formFactura(f.tipo, c); };
  $("bOk").onclick = function () {
    var b = this; b.disabled = true; b.textContent = "Haciendo la factura en ARCA…";
    run("facturar", TOKEN, f).then(function (r) {
      if (c) c.facturas.push({ tipo: "Factura " + r.tipo, numero: r.numero, total: r.total });
      B.innerHTML = '<div class="top"><div><h3>Factura ' + r.tipo + ' hecha</h3><div class="sub">' + esc(f.nombre || "Consumidor final") + '</div></div><button class="close" id="x">Cerrar</button></div>' +
        '<p class="bien">Número ' + esc(r.numero) + ' · ' + pesos2(r.total) + '</p><div class="resumen"><div><span>CAE</span><b>' + esc(r.cae) + '</b></div><div><span>Vence el CAE</span><b>' + esc(r.vence) + '</b></div></div>' +
        '<p class="nota">Quedó anotada en la hoja FACTURAS de la planilla.</p>';
      $("x").onclick = function () { if (c) abrir(c); else cerrar(); };
    }).catch(function (e) { b.disabled = false; b.textContent = "Confirmar y hacer la factura"; alerta(e.message); });
  };
}
$("bNueva").onclick = function () { $("sheet").hidden = false; formFactura("B", null); };
$("bFacturas").onclick = function () {
  var B = $("box"); $("sheet").hidden = false;
  B.innerHTML = '<div class="top"><h3>Últimas facturas</h3><button class="close" id="x">Cerrar</button></div><p class="nota">Cargando…</p>';
  $("x").onclick = cerrar;
  run("ultimasFacturas", TOKEN).then(function (fs) {
    B.innerHTML = '<div class="top"><h3>Últimas facturas</h3><button class="close" id="x">Cerrar</button></div>' + (fs.length ? fs.map(function (f) {
      return '<div class="resumen"><div><b>' + esc(f.tipo + " " + f.numero) + '</b><b>' + pesos2(f.total) + '</b></div><div><span>' + esc(f.receptor) + '</span><span class="nota">' + esc(f.fecha + " · " + f.quien) + '</span></div></div>';
    }).join("") : '<p class="nota">Todavía no se hizo ninguna factura.</p>');
    $("x").onclick = cerrar;
  });
};
$("bCargar").onclick = function () {
  var b = this; b.disabled = true; b.textContent = "Cargando…";
  run("importar", TOKEN).then(function (r) {
    b.disabled = false; b.textContent = "Cargar Excel nuevo";
    $("sheet").hidden = false;
    $("box").innerHTML = '<div class="top"><h3>Excel cargado</h3><button class="close" id="x">Listo</button></div><p class="bien">Período ' + dm(r.desde) + ' al ' + dm(r.hasta) + ': ' + r.clientes + ' clientes.</p>' +
      (r.nuevos ? '<p class="nota">' + r.nuevos + ' clientes nuevos: revisales el saludo y el WhatsApp la primera vez.</p>' : '');
    $("x").onclick = function () { cerrar(); cargar(); };
  }).catch(function (e) { b.disabled = false; b.textContent = "Cargar Excel nuevo"; $("sheet").hidden = false; $("box").innerHTML = '<p class="aviso">' + esc(e.message) + '</p><button class="ghost" id="x">Cerrar</button>'; $("x").onclick = cerrar; });
};
entrarPantalla();
</script>
</body>
</html>`;

/* ---------------- diálogos (sin comillas invertidas ni barras invertidas adentro) ---------------- */

const CSR_CODIGO = `// Arma un pedido de certificado (CSR PKCS#10) para ARCA con WebCrypto. Va adentro del diálogo de Codigo.gs.
function len(n) { if (n < 128) return [n]; var b = []; while (n > 0) { b.unshift(n & 255); n = n >> 8; } return [128 | b.length].concat(b); }
function tlv(tag, bytes) { return [tag].concat(len(bytes.length), bytes); }
function cat() { var r = []; for (var i = 0; i < arguments.length; i++) r = r.concat(arguments[i]); return r; }
function utf8(s) { return Array.from(new TextEncoder().encode(s)); }
function attr(oid, tag, valor) { return tlv(0x31, tlv(0x30, cat(oid, tlv(tag, utf8(valor))))); }
function pem(tipo, bytes) {
  var NL = String.fromCharCode(10), b = "";
  for (var i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
  var t = btoa(b), lineas = [];
  for (var j = 0; j < t.length; j += 64) lineas.push(t.slice(j, j + 64));
  return "-----BEGIN " + tipo + "-----" + NL + lineas.join(NL) + NL + "-----END " + tipo + "-----" + NL;
}
async function crearCsr(cuit, razon, alias, cripto) {
  cripto = cripto || crypto;
  var alg = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
  var par = await cripto.subtle.generateKey(alg, true, ["sign", "verify"]);
  var spki = Array.from(new Uint8Array(await cripto.subtle.exportKey("spki", par.publicKey)));
  var pk8 = Array.from(new Uint8Array(await cripto.subtle.exportKey("pkcs8", par.privateKey)));
  var nombre = tlv(0x30, cat(
    attr([6, 3, 85, 4, 6], 0x13, "AR"),
    attr([6, 3, 85, 4, 10], 0x0c, razon),
    attr([6, 3, 85, 4, 3], 0x0c, alias),
    attr([6, 3, 85, 4, 5], 0x13, "CUIT " + cuit)));
  var info = tlv(0x30, cat([2, 1, 0], nombre, spki, [0xa0, 0]));
  var firma = Array.from(new Uint8Array(await cripto.subtle.sign("RSASSA-PKCS1-v1_5", par.privateKey, new Uint8Array(info))));
  var algFirma = tlv(0x30, cat([6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 11], [5, 0]));
  var csr = tlv(0x30, cat(info, algFirma, tlv(0x03, cat([0], firma))));
  return { csr: pem("CERTIFICATE REQUEST", csr), clave: pem("PRIVATE KEY", pk8) };
}
`;

const ESTILO = `<style>
body{font:15px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#161616;margin:0;padding:4px 2px}
p{margin:0 0 12px} .muted{color:#6b6760;font-size:13px}
button{font-family:inherit;font-weight:700;font-size:16px;width:100%;padding:14px;border:0;border-radius:12px;background:#161616;color:#fff;cursor:pointer}
button:disabled{opacity:.4} .ok{background:#e7f0ea;padding:12px;border-radius:10px;font-weight:600}
.err{background:#fbf1e3;border:1px solid #a8661b;padding:12px;border-radius:10px} a{color:#2c4a73;font-weight:600}
input[type=file]{margin:6px 0 14px;font-size:15px}
</style>`;

const DIALOGO_PEDIDO = `<!DOCTYPE html><html><head><meta charset="utf-8">` + ESTILO + `</head><body>
<div id="pantalla"><p>Esto crea la <b>llave secreta</b> (queda guardada adentro de Google, no la vas a ver) y el <b>pedido</b> que se sube a ARCA.</p>
<p class="muted">Tarda unos segundos.</p>
<button id="crear">Crear pedido</button></div>
<script>
` + CSR_CODIGO + `
var B = document.getElementById("crear"), P = document.getElementById("pantalla");
function mostrar(html) { P.innerHTML = html; }
function error(e) { B.disabled = false; B.textContent = "Probar de nuevo"; var d = document.createElement("p"); d.className = "err"; d.textContent = e.message || e; P.appendChild(d); }
function hacer(pisar) {
  B.disabled = true; B.textContent = "Creando…";
  google.script.run.withSuccessHandler(function (d) {
    if (d.hayCert && !pisar) {
      mostrar('<p class="err">Ya hay un certificado de ARCA guardado. Si creás un pedido nuevo, el que está deja de servir y hay que volver a pedirlo en ARCA.</p><button id="si">Crear igual</button>');
      document.getElementById("si").onclick = function () { mostrar('<p>Creando…</p>'); B = document.createElement("button"); hacer(true); };
      return;
    }
    crearCsr(d.cuit, d.razon, d.alias).then(function (r) {
      google.script.run.withSuccessHandler(function (a) {
        mostrar('<p class="ok">Listo. El pedido quedó en Drive, en la carpeta La Caleta — Sistema, con el nombre <b>' + a.nombre + '</b>.</p><p><a href="' + a.url + '" target="_blank">Abrir el archivo en Drive</a></p><p class="muted">Ahora seguí con los pasos de ARCA: subí ese archivo en Administración de Certificados Digitales.</p>');
      }).withFailureHandler(error).guardarPedido(r.clave, r.csr, !!pisar);
    }).catch(error);
  }).withFailureHandler(error).datosPedido();
}
B.onclick = function () { hacer(false); };
</script></body></html>`;

const DIALOGO_CERT = `<!DOCTYPE html><html><head><meta charset="utf-8">` + ESTILO + `</head><body>
<div id="pantalla"><p>Elegí el archivo del certificado que bajaste de ARCA (termina en <b>.crt</b>).</p>
<input type="file" id="arch" accept=".crt,.pem,.cer,.txt">
<button id="guardar" disabled>Guardar certificado</button></div>
<script>
var A = document.getElementById("arch"), B = document.getElementById("guardar"), P = document.getElementById("pantalla"), texto = "";
A.onchange = function () { var f = A.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { texto = r.result; B.disabled = false; }; r.readAsText(f); };
B.onclick = function () {
  B.disabled = true; B.textContent = "Guardando…";
  google.script.run.withSuccessHandler(function (m) { P.innerHTML = '<p class="ok">' + m + ' Ya podés cerrar esta ventana.</p>'; })
    .withFailureHandler(function (e) { B.disabled = false; B.textContent = "Guardar certificado"; var d = document.createElement("p"); d.className = "err"; d.textContent = e.message; P.appendChild(d); })
    .guardarCertificado(texto);
};
</script></body></html>`;
