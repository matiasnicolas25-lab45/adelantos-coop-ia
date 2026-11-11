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
  CUIT: ["Texto de la lista CUIT CLIENTES", "CUIT", "Estado"],
  NOMBRES: ["Nombre en Resto Soft", "Cómo sale en el mensaje", "Revisar"],
  RECARGOS: ["Código", "Cliente", "Cargado en Resto Soft el", "Monto", "Miércoles incluidos", "Quién"],
  PENDIENTES: ["ID", "Cargado", "Quién", "Fecha", "Mesa", "Comprobante", "Nombre", "Saludo", "WhatsApp", "Total", "Detalle",
    "Mensaje enviado", "Enviado por", "Pagó", "Marcado por"],
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
/** Las fechas que se guardan como texto la planilla las vuelve fecha: acá se leen siempre como "aaaa-mm-dd". */
function fTxt(v) { return v instanceof Date ? Utilities.formatDate(v, ZONA, "yyyy-MM-dd") : String(v == null ? "" : v); }
function hTxt(v) { return v instanceof Date ? Utilities.formatDate(v, ZONA, "dd/MM/yyyy HH:mm") : String(v == null ? "" : v); }
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
  if (!filas("CONFIG").some(r => String(r[0]) === DATO_INICIO_RECARGO)) cfg.appendRow([DATO_INICIO_RECARGO, ""]);
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

/** Nombre prolijo "de emergencia" para un producto que todavía no está en la hoja NOMBRES. */
function limpiarNombre(t) {
  let s = String(t || "").replace(/^\(EJ\)\s*/i, "").replace(/^\*+\s*/, "").replace(/^yachting\s+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
  s = s.replace(/\bc\/\s*/g, "con ").replace(/\bj\s*y\s*q\b/g, "jamón y queso").replace(/\bgde\b/g, "grande").replace(/\bch\.?(?=\s|$)/g, "chico")
    .replace(/\bmila\b/g, "milanesa").replace(/\bemp\.?(?=\s|$)/g, "empanada").replace(/\bens\.?(?=\s|$)/g, "ensalada").replace(/\bagreg\.?\s*/g, "agregado de ")
    .replace(/\btalla\b/g, "tallarines").replace(/\bnoquis\b/g, "ñoquis").replace(/\bcafe\b/g, "café").replace(/\bpure\b/g, "puré");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function claveNombre(t) { return String(t || "").replace(/\s+/g, " ").trim().toUpperCase(); }
function mapaNombres() { const m = {}; filas("NOMBRES").forEach(r => { if (r[0] && r[1]) m[claveNombre(r[0])] = String(r[1]).trim(); }); return m; }

/** Cambia los renglones de un período por los nuevos, en una sola escritura. colsTexto: columnas (1 = A) que van como texto. */
function reemplazarPeriodo(sh, periodo, nuevas, colsTexto) {
  const v = sh.getDataRange().getValues(), ancho = HOJAS[sh.getName()].length;
  const quedan = v.slice(1).filter(r => r.join("") !== "" && fTxt(r[0]) !== periodo).map(r => r.slice(0, ancho).map(x => (x instanceof Date ? fTxt(x) : x)));
  const todas = quedan.concat(nuevas);
  if (v.length > 1) sh.getRange(2, 1, v.length - 1, Math.max(ancho, v[0].length)).clearContent();
  colsTexto.forEach(c => sh.getRange(2, c, Math.max(todas.length, 1), 1).setNumberFormat("@"));
  if (todas.length) sh.getRange(2, 1, todas.length, ancho).setValues(todas);
}

/** Busca el último Excel de cuentas corrientes en la carpeta RESTOSOFT y lo carga. */
/** Carga el Excel de cuentas corrientes de Resto Soft. Con base64: el archivo que se eligió en la compu (cualquier nombre).
 *  Sin archivo: el Excel más nuevo de la carpeta RESTOSOFT que tenga el formato de cuentas corrientes. */
function importar(token, base64, nombreArchivo) {
  const yo = quien(token);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Ya se está cargando un Excel. Esperá un minuto y volvé a tocar Cargar Excel nuevo.");
  try {
    let datos = null, ultimo = { getName: () => String(nombreArchivo || "Excel elegido") };
    if (base64) {
      try { datos = leerCuentas(leerXls(Array.from(Utilities.base64Decode(base64)))); }
      catch (e) { throw new Error("No pude leer ese archivo. Elegí el Excel que exporta Resto Soft (Detalle de consumos de cuentas corrientes)."); }
    } else {
      const archivos = [], it = DriveApp.getFolderById(RESTOSOFT_ID).getFiles();
      while (it.hasNext()) { const f = it.next(); if (/\.xls$/i.test(f.getName())) archivos.push(f); }
      archivos.sort((x, y) => y.getLastUpdated() - x.getLastUpdated());
      for (let i = 0; i < Math.min(archivos.length, 8) && !datos; i++) {
        try { const d = leerCuentas(leerXls(archivos[i].getBlob().getBytes())); if (d.hasta && d.clientes.length) { datos = d; ultimo = archivos[i]; } } catch (e) {}
      }
      if (!datos) throw new Error("No encontré un Excel de cuentas corrientes en la carpeta RESTOSOFT.");
    }
    if (!datos.hasta || !datos.clientes.length) throw new Error("Ese Excel no es el de cuentas corrientes. En Resto Soft exportá Clientes → Cuentas corrientes → Detalle de consumos.");
    const periodo = datos.hasta;

    // Todo de una vez (borrar renglón por renglón tardaba tanto que Google cortaba la carga).
    const fs = [], fm = [];
    datos.clientes.forEach(function (c) {
      if (!c.movs.length && Math.abs(c.actual) < 1) return;
      fs.push([periodo, c.codigo, c.nombre, c.tel, c.anterior, c.actual, datos.desde, datos.hasta]);
      c.movs.forEach(m => fm.push([periodo, c.codigo, m.fecha, m.comp, m.tipo, m.debe, m.haber, m.saldo,
        m.items.map(i => i.cant + "× " + i.desc + " = " + i.importe).join(" | ")]));
    });
    reemplazarPeriodo(hoja("SALDOS"), periodo, fs, [1, 7, 8]);
    reemplazarPeriodo(hoja("MOVIMIENTOS"), periodo, fm, [1, 3]);

    const cs = hoja("CLIENTES"), cv = cs.getDataRange().getValues(), ya = {};
    for (let i = 1; i < cv.length; i++) ya[String(cv[i][0])] = i;
    const nuevos = [];
    datos.clientes.forEach(function (c) {
      if (ya[String(c.codigo)]) { const f = cv[ya[String(c.codigo)]]; f[1] = c.nombre; f[7] = c.tel; return; }
      if (!c.movs.length && Math.abs(c.actual) < 1) return;
      nuevos.push([c.codigo, c.nombre, adivinarSaludo(c.nombre), normalizarWa(c.tel), "", "", "", c.tel]);
    });
    if (cv.length > 1) cs.getRange(2, 1, cv.length - 1, cv[0].length).setValues(cv.slice(1));
    if (nuevos.length) cs.getRange(cs.getLastRow() + 1, 1, nuevos.length, nuevos[0].length).setValues(nuevos);
    // productos nuevos: se agregan a NOMBRES con un nombre sugerido, para revisar
    const conocidos = mapaNombres(), nuevosNombres = {};
    datos.clientes.forEach(c => c.movs.forEach(m => m.items.forEach(i => {
      const k = claveNombre(i.desc);
      if (k && k !== "ACTUALIZACION" && !conocidos[k] && !nuevosNombres[k]) nuevosNombres[k] = [i.desc.trim(), limpiarNombre(i.desc), "SÍ"];
    })));
    const filasN = Object.keys(nuevosNombres).map(k => nuevosNombres[k]);
    if (filasN.length) { const sn = hoja("NOMBRES"); sn.getRange(sn.getLastRow() + 1, 1, filasN.length, 3).setValues(filasN); }
    hoja("CONFIG").appendRow(["Último Excel cargado", ultimo.getName() + " · " + ahoraTxt() + " · período " + datos.desde + " al " + datos.hasta]);
    registrar(yo.nombre, "Cargó el Excel de Resto Soft", "", ultimo.getName() + " (" + fs.length + " clientes)");
    CacheService.getScriptCache().remove("datos");
    return { clientes: fs.length, nuevos: nuevos.length, productosNuevos: filasN.length, desde: datos.desde, hasta: datos.hasta };
  } finally { lock.releaseLock(); }
}

/* ---------- recargo semanal calculado por la app (2,5 % cada miércoles sobre todo lo que se debe) ---------- */

const DATO_INICIO_RECARGO = "La app calcula los recargos desde (un miércoles)";
function fechaDato(nombre) {
  const f = filas("CONFIG").filter(r => String(r[0]) === nombre)[0];
  if (!f || f[1] === "" || f[1] == null) return "";
  if (f[1] instanceof Date) return Utilities.formatDate(f[1], ZONA, "yyyy-MM-dd");
  const t = String(f[1]).trim(), m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2) : (/^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "");
}
function masDias(f, n) { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function miercolesDesde(f) { const d = new Date(f + "T12:00:00Z"); return masDias(f, (3 - d.getUTCDay() + 7) % 7); }

/**
 * Recargos de los miércoles que todavía no están en Resto Soft. Cada miércoles: 2,5 % de lo que debe ese día
 * (saldo de Resto Soft a esa fecha + los recargos de la app de las semanas anteriores). Se reinicia cuando
 * alguien marca "Ya lo cargué en Resto Soft".
 */
function recargosApp(inicio, cargadoEl, anterior, movs, hoy) {
  if (!inicio) return { total: 0, semanas: [] };
  let desde = inicio;
  if (cargadoEl && cargadoEl >= desde) desde = masDias(cargadoEl, 1);
  const orden = movs.slice().sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
  const saldoAl = w => { let s = anterior; orden.forEach(m => { if (m.fecha <= w) s = m.saldo; }); return s; };
  const semanas = []; let acum = 0;
  for (let w = miercolesDesde(desde); w <= hoy; w = masDias(w, 7)) {
    const base = saldoAl(w) + acum;
    if (base >= 1) { const r = Math.round(base * RECARGO); acum += r; semanas.push([w, r]); }
  }
  return { total: acum, semanas: semanas };
}

function marcarRecargoCargado(token, codigo, nombre, monto, semanas) {
  const yo = quien(token);
  hoja("RECARGOS").appendRow([codigo, nombre, Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd"), Number(monto), Number(semanas), yo.nombre]);
  registrar(yo.nombre, "Cargó el recargo en Resto Soft", nombre, "$" + fmt(monto) + " (" + semanas + " miércoles)");
  return true;
}

/* ---------- datos para la pantalla ---------- */

function datos(token) {
  const yo = quien(token);
  const s = filas("SALDOS");
  if (!s.length) return { yo: yo, periodo: null, clientes: [] };
  const periodo = s.map(r => fTxt(r[0])).sort().pop();
  const cli = {}; filas("CLIENTES").forEach(r => cli[String(r[0])] = r);
  const est = {}; filas("ESTADO").forEach(r => { if (fTxt(r[0]) === periodo) est[String(r[1])] = r; });
  const fac = {}; filas("FACTURAS").forEach(r => { const k = String(r[5]); if (k) (fac[k] = fac[k] || []).push({ fecha: r[0], tipo: r[2], numero: r[4], total: r[11] }); });
  const mv = {}; filas("MOVIMIENTOS").forEach(r => { if (fTxt(r[0]) === periodo) (mv[String(r[1])] = mv[String(r[1])] || []).push(r); });
  const todos = {}; filas("MOVIMIENTOS").forEach(r => { if (r[4] === "Pago") { const k = String(r[1]), f = fTxt(r[2]); if (!todos[k] || f > todos[k]) todos[k] = f; } });
  let desde = "", hasta = periodo;
  const inicioRec = fechaDato(DATO_INICIO_RECARGO), hoy = Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd");
  const cargados = {}; filas("RECARGOS").forEach(r => { const k = String(r[0]), f = fTxt(r[2]); if (!cargados[k] || f > cargados[k]) cargados[k] = f; });
  const lista = s.filter(r => fTxt(r[0]) === periodo).map(function (r) {
    desde = fTxt(r[6]);
    const k = String(r[1]), c = cli[k] || [], e = est[k] || [], m = mv[k] || [];
    const conDetalle = m.map(x => ({ fecha: fTxt(x[2]), tipo: x[4], importe: x[4] === "Pago" ? Number(x[6]) : Number(x[5]), detalle: String(x[8] || "") }));
    const rec = recargosApp(inicioRec, cargados[k] || "", Number(r[4]), m.map(x => ({ fecha: fTxt(x[2]), saldo: Number(x[7]) })), hoy);
    return {
      codigo: Number(k), nombre: String(r[2]), saludo: String(c[2] || ""), wa: String(c[3] || ""), cuit: String(c[4] || ""),
      cond: String(c[5] || ""), revisado: String(c[6] || "") === "SÍ", tel: String(r[3] || ""),
      anterior: Number(r[4]), actual: Number(r[5]), movs: conDetalle, ultimoPago: todos[k] || "",
      enviado: hTxt(e[2] || ""), enviadoPor: String(e[3] || ""), pago: hTxt(e[4] || ""), pagoPor: String(e[5] || ""),
      facturas: fac[k] || [], recargoApp: rec.total, recargoSemanas: rec.semanas,
    };
  });
  return { yo: yo, periodo: { desde: desde, hasta: hasta }, clientes: lista, alias: ALIAS_PAGO, recargo: RECARGO, nombres: mapaNombres() };
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
  const yo = quien(token), periodo = filas("SALDOS").map(r => fTxt(r[0])).sort().pop() || "";
  if (!periodo) throw new Error("Primero cargá el Excel de Resto Soft.");
  const sh = hoja("ESTADO"), v = sh.getDataRange().getValues();
  let fila = 0; for (let i = 1; i < v.length; i++) if (fTxt(v[i][0]) === periodo && String(v[i][1]) === String(codigo)) fila = i + 1;
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

/** Busca en la hoja CUIT por lo que se escribe (nombre, apellido o empresa): tienen que aparecer todas las palabras. */
function buscarCuit(token, texto) {
  quien(token);
  const palabras = sinTildes(texto).split(/[^a-z0-9]+/).filter(p => p.length >= 2);
  if (!palabras.length) return [];
  return filas("CUIT").filter(r => cuitValido(r[1]) && palabras.every(p => sinTildes(r[0] + " " + r[1]).indexOf(p) >= 0))
    .map(r => ({ texto: String(r[0]), cuit: String(r[1]).replace(/\D/g, ""), nombre: String(r[0]).replace(/<[^>]*>/g, "").replace(/CUIT/i, "").replace(/[\d-]{9,}/g, "").replace(/[():]/g, " ").replace(/\s+/g, " ").trim() }))
    .slice(0, 8);
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
    if (docTipo === "80" && !filas("CUIT").some(r => String(r[1]).replace(/\D/g, "") === docNro)) hoja("CUIT").appendRow([receptor + " " + docNro, docNro, "OK (agregado por una factura)"]);
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
  return filas("FACTURAS").slice(-15).reverse().map(r => ({ fecha: hTxt(r[0]), quien: String(r[1]), tipo: String(r[2]), numero: String(r[4]), receptor: String(r[6]), total: Number(r[11]), cae: String(r[12]), pdf: String(r[15] || "") }));
}


/* ---------- mesas que se fueron sin pagar (Excel de un comprobante de Resto Soft) ---------- */

/** Lee la "Consulta de Comprobantes" de Resto Soft: encabezado de cada comprobante y sus productos. */
function leerComprobantes(valores) {
  const comps = []; let c = null;
  valores.forEach(function (f) {
    const comp = String(f[5] || "").trim();
    if (String(f[0]) === " " && /^[A-Z]-\d{4}-\d+$/.test(comp)) {
      c = { fecha: aFecha(f[2]), hora: String(f[3] || "").trim(), comp: comp, cliente: String(f[6] || "").trim(), subtotal: aNum(f[7]),
        descuento: aNum(f[8]), total: aNum(f[9]), mesa: aNum(f[10]), mozo: String(f[11] || "").trim(), pago: String(f[17] || "").trim(), items: [] };
      comps.push(c);
    } else if (c && typeof f[4] === "number" && String(f[6] || "").trim()) {
      c.items.push({ cant: f[4], desc: String(f[6]).trim(), importe: aNum(f[7]) });
    } else if (!String(f.join("")).trim()) { c = null; }
  });
  return comps;
}

/** Recibe el Excel (en base64) y devuelve lo que se va a mandar, sin guardar nada todavía. */
function leerMesa(token, base64) {
  quien(token);
  const comps = leerComprobantes(leerXls(Array.from(Utilities.base64Decode(base64))));
  if (!comps.length) throw new Error("Ese Excel no tiene comprobantes de Resto Soft. Exportá la Consulta de Comprobantes de esa mesa.");
  if (comps.length > 5) throw new Error("Ese Excel tiene " + comps.length + " comprobantes. Exportá solo el de la mesa que se fue sin pagar.");
  const conocidos = mapaNombres(), nuevos = {};
  comps.forEach(c => c.items.forEach(i => { const k = claveNombre(i.desc); if (k && !conocidos[k] && !nuevos[k]) nuevos[k] = [i.desc, limpiarNombre(i.desc), "SÍ"]; }));
  const fn = Object.keys(nuevos).map(k => nuevos[k]);
  if (fn.length) { const sn = hoja("NOMBRES"); sn.getRange(sn.getLastRow() + 1, 1, fn.length, 3).setValues(fn); }
  const items = [];
  comps.forEach(c => c.items.forEach(i => items.push(i.cant + "× " + i.desc + " = " + i.importe)));
  const tot = comps.reduce((s, c) => s + c.total, 0);
  return { fecha: comps[0].fecha, mesa: comps[0].mesa, comp: comps.map(c => c.comp).join(", "), cliente: comps[0].cliente,
    total: tot, detalle: items.join(" | "), nombres: mapaNombres() };
}

function guardarMesa(token, m) {
  const yo = quien(token);
  const wa = normalizarWa(m.wa);
  if (!wa) throw new Error("Poné el WhatsApp con característica, por ejemplo 341 5123456.");
  if (!String(m.nombre || "").trim()) throw new Error("Poné el nombre de la persona.");
  const id = Utilities.getUuid().slice(0, 8);
  hoja("PENDIENTES").appendRow([id, ahoraTxt(), yo.nombre, m.fecha, m.mesa, m.comp, String(m.nombre).trim(), String(m.saludo || "").trim(), wa,
    Number(m.total), m.detalle, "", "", "", ""]);
  registrar(yo.nombre, "Cargó una mesa sin pagar", m.nombre, "comprobante " + m.comp + " · $" + fmt(m.total));
  return id;
}

function pendientes(token) {
  quien(token);
  return filas("PENDIENTES").filter(r => r[0]).map(r => ({ id: String(r[0]), cargado: hTxt(r[1]), quien: String(r[2]), fecha: fTxt(r[3]), mesa: r[4],
    comp: String(r[5]), nombre: String(r[6]), saludo: String(r[7]), wa: String(r[8]), total: Number(r[9]), detalle: String(r[10]),
    enviado: hTxt(r[11]), enviadoPor: String(r[12]), pago: hTxt(r[13]), pagoPor: String(r[14]) })).reverse();
}

function marcarMesa(token, id, que, valor) {
  const yo = quien(token), sh = hoja("PENDIENTES"), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) !== String(id)) continue;
    sh.getRange(i + 1, que === "enviado" ? 12 : 14, 1, 2).setValues([[valor ? ahoraTxt() : "", valor ? yo.nombre : ""]]);
    registrar(yo.nombre, que === "enviado" ? "Mandó el WhatsApp de una mesa sin pagar" : (valor ? "Marcó que pagó una mesa" : "Sacó la marca de pago de una mesa"), String(v[i][6]), String(v[i][5]));
    return true;
  }
  throw new Error("No encontré esa mesa.");
}
