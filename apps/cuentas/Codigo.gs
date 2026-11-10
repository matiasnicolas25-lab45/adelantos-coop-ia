/**
 * Cuentas La Caleta — cuentas corrientes de los socios del club y facturas A por ARCA.
 *
 * Paso actual: certificado digital para ARCA (factura electrónica, punto de venta 5).
 * La llave secreta la crea este programa en la compu de Mat y queda guardada en las
 * Propiedades del script (nunca en la planilla, nunca en un chat).
 * Instalación: ver LEEME.md en esta carpeta.
 */

const CUIT = "33712205569";
const RAZON = "COOPERATIVA DE TRABAJO LA CALETA LIMITADA";
const ALIAS = "lacaleta";
const PUNTO_VENTA = 5;

function onOpen() {
  SpreadsheetApp.getUi().createMenu("ARCA")
    .addItem("1. Crear pedido de certificado", "abrirPedido")
    .addItem("2. Guardar el certificado de ARCA", "abrirCertificado")
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
  return "Certificado guardado.";
}

function verEstado() {
  const d = datosPedido();
  SpreadsheetApp.getUi().alert(
    "Llave: " + (d.hayClave ? "creada" : "falta (paso 1)") + "\n" +
    "Certificado de ARCA: " + (d.hayCert ? "guardado" : "falta (paso 2)") + "\n" +
    "Punto de venta: " + PUNTO_VENTA);
}

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
