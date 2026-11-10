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
    "Neto", "IVA 21%", "Total", "CAE", "Vence CAE", "Detalle", "PDF"],
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
  if (cfg.getLastRow() < 2) cfg.getRange(2, 1, 3, 2).setValues([["Cuentas de Google que pueden abrir la app (separadas por coma)", Session.getActiveUser().getEmail()],
    ["Ingresos Brutos", ""], ["Inicio de actividades", ""]]);
  cfg.getRange("B:B").setNumberFormat("@");
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
  if (r.getResponseCode() !== 200) throw new Error("No se pudo leer el Excel de Resto Soft. Exportalo de nuevo desde Resto Soft y subilo a la carpeta RESTOSOFT.");
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
    let datos;
    try { datos = leerCuentas(leerXls(ultimo.getBlob().getBytes())); }   // el .xls de Resto Soft es de un Excel viejo que Google no convierte
    catch (e) {
      const tmp = convertirAPlanilla(ultimo);
      try { datos = leerCuentas(SpreadsheetApp.openById(tmp).getSheets()[0].getDataRange().getValues()); }
      finally { DriveApp.getFileById(tmp).setTrashed(true); }
    }
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
    // Igual que en Comprobantes en línea: "Productos y Servicios" (concepto 3), período facturado y vto. del pago = día de la factura.
    const desde = hoy, hasta = hoy;
    const det = "<ar:FECAEDetRequest><ar:Concepto>3</ar:Concepto><ar:DocTipo>" + docTipo + "</ar:DocTipo><ar:DocNro>" + docNro + "</ar:DocNro>" +
      "<ar:CbteDesde>" + n + "</ar:CbteDesde><ar:CbteHasta>" + n + "</ar:CbteHasta><ar:CbteFch>" + hoy + "</ar:CbteFch>" +
      "<ar:ImpTotal>" + fmt(total) + "</ar:ImpTotal><ar:ImpTotConc>0</ar:ImpTotConc><ar:ImpNeto>" + fmt(neto) + "</ar:ImpNeto>" +
      "<ar:ImpOpEx>0</ar:ImpOpEx><ar:ImpTrib>0</ar:ImpTrib><ar:ImpIVA>" + fmt(iva) + "</ar:ImpIVA>" +
      "<ar:FchServDesde>" + desde + "</ar:FchServDesde><ar:FchServHasta>" + hasta + "</ar:FchServHasta><ar:FchVtoPago>" + hoy + "</ar:FchVtoPago>" +
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
    const sh = hoja("FACTURAS");
    sh.appendRow([ahoraTxt(), yo.nombre, "Factura " + f.tipo, PUNTO_VENTA, numero, f.codigo || "", receptor,
      (DOC[docTipo] || "") + (docTipo !== "99" ? " " + docNro : ""), COND_IVA[cond], neto, iva, total, cae,
      vto.slice(6, 8) + "/" + vto.slice(4, 6) + "/" + vto.slice(0, 4), String(f.detalle || "") + (f.domicilio ? " · Domicilio: " + f.domicilio : ""), ""]);
    const filaFac = sh.getLastRow();
    registrar(yo.nombre, "Hizo la factura " + f.tipo + " " + numero, receptor, "$" + fmt(total) + " · CAE " + cae);
    let pdf = "", errPdf = "";
    try {
      pdf = facturaPdf({ tipo: f.tipo, n: n, fecha: new Date(), docTipo: docTipo, docNro: docNro, nombre: receptor, domicilio: f.domicilio || "",
        cond: cond, neto: neto, iva: iva, total: total, cae: cae, vto: vto, detalle: f.detalle, desde: desde, hasta: hasta, vtoPago: hoy,
        venta: "Otra" });
      sh.getRange(filaFac, 16).setValue(pdf);
    } catch (e) { errPdf = "La factura está hecha en ARCA, pero no se pudo armar el PDF: " + e.message; }
    return { numero: numero, cae: cae, vence: vto.slice(6, 8) + "/" + vto.slice(4, 6) + "/" + vto.slice(0, 4), total: total, neto: neto, iva: iva, tipo: f.tipo, pdf: pdf, errPdf: errPdf };
  } finally { lock.releaseLock(); }
}

function ultimasFacturas(token) {
  quien(token);
  return filas("FACTURAS").slice(-15).reverse().map(r => ({ fecha: String(r[0]), quien: String(r[1]), tipo: String(r[2]), numero: String(r[4]), receptor: String(r[6]), total: Number(r[11]), cae: String(r[12]), pdf: String(r[15] || "") }));
}

/* ---------------- lector de Excel viejo (.xls, BIFF5/BIFF8) para el informe de Resto Soft ---------------- */

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
    if (tipo === 0x0809) { if (u16(b, d + 2) === 0x10) hoja++; biff8 = u16(b, d) === 0x0600; }
    else if (tipo === 0x000a && hoja >= 1) { if (hoja === 1) break; }
    else if (tipo === 0x00fc) { sstBuf = b.slice(d, d + largo); }
    else if (tipo === 0x003c && ultimoTipo === 0x00fc && sstBuf) { sstBuf = sstBuf.concat(["CONT"], b.slice(d, d + largo)); }
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

/* ---------------- librería de QR (qrcode-generator 1.4.4, MIT, Kazuhiko Arase) ---------------- */

//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));

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
  var detalle = "Servicio gastronómico";
  B.innerHTML = '<div class="top"><div><h3>Nueva factura</h3><div class="sub">' + (c ? esc(c.nombre) : "Cargada a mano") + '</div></div><button class="close" id="x">' + (c ? "Volver" : "Cerrar") + '</button></div>' +
    '<div class="two"><button class="ghost" id="tA">Factura A</button><button class="ghost" id="tB">Factura B</button></div>' +
    '<div id="campos" style="display:grid;gap:12px"></div>' +
    '<label>Importe total <small>Con el IVA incluido</small><input id="fTot" inputmode="decimal" value="' + (total ? String(Math.round(total * 100) / 100).replace(".", ",") : "") + '" placeholder="0,00"></label>' +
    '<p class="nota" id="desglose"></p>' +
    '<label>Producto / servicio <small>Si el cliente pide otra cosa, cambialo acá</small><input id="fDet" value="' + esc(detalle) + '"></label>' +
    '<button class="solo" id="bRev">Revisar factura</button>';
  $("x").onclick = function () { if (c) abrir(c); else cerrar(); };
  function elegir(t) {
    tipo = t; $("tA").classList.toggle("sel", t === "A"); $("tB").classList.toggle("sel", t === "B");
    var k = $("campos");
    if (t === "A") {
      k.innerHTML = '<label>Nombre o razón social<input id="fNom" value="' + esc(c ? c.nombre : "") + '"></label>' +
        '<label>CUIT<input id="fDoc" inputmode="numeric" value="' + esc(c ? c.cuit : "") + '"></label><div class="chips" id="sugF"></div>' +
        '<label>Condición frente al IVA<select id="fCond"><option value="1">Responsable inscripto</option><option value="6">Monotributista</option></select></label>' +
        '<label>Domicilio <small>Opcional, sale en la factura</small><input id="fDom"></label>';
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
        (r.pdf ? '<a class="solo" href="' + esc(r.pdf) + '">Abrir el PDF</a><p class="nota">Desde el PDF tocá Compartir y elegí WhatsApp para mandárselo al cliente.</p>' : '<p class="aviso">' + esc(r.errPdf) + '</p>') +
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
      return '<div class="resumen"><div><b>' + esc(f.tipo + " " + f.numero) + '</b><b>' + pesos2(f.total) + '</b></div><div><span>' + esc(f.receptor) + '</span><span class="nota">' + esc(f.fecha + " · " + f.quien) + '</span></div>' +
        (f.pdf ? '<div><a href="' + esc(f.pdf) + '">Abrir el PDF</a></div>' : '') + '</div>';
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
