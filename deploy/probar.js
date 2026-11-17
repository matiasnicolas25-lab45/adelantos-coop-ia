// Pruebas que corre GitHub ANTES de publicar las apps. Si alguna falla, no se publica nada.
// Se corre con: node deploy/probar.js
const fs = require("fs");
const path = require("path");
const raiz = path.join(__dirname, "..");
let fallas = 0, ok = 0;
function prueba(nombre, fn) {
  try { fn(); ok++; console.log("  ✔ " + nombre); }
  catch (e) { fallas++; console.log("  ✘ " + nombre + "\n      " + (e && e.message || e)); }
}
function igual(a, b, txt) { if (a !== b) throw new Error((txt || "") + " esperaba " + JSON.stringify(b) + " y dio " + JSON.stringify(a)); }
function si(c, txt) { if (!c) throw new Error(txt || "no se cumple"); }

// Servicios de Google simulados (lo justo para cargar el programa)
const Utilities = {
  formatDate(d, z, f) {
    const x = new Date(d.getTime() - 3 * 3600000).toISOString(); // hora de Argentina
    const m = { yyyy: x.slice(0, 4), MM: x.slice(5, 7), dd: x.slice(8, 10), HH: x.slice(11, 13), mm: x.slice(14, 16) };
    if (f === "H") return String(Number(m.HH));
    if (f === "u") { const dw = new Date(d.getTime() - 3 * 3600000).getUTCDay(); return String(dw === 0 ? 7 : dw); }
    return f.replace("yyyy", m.yyyy).replace("MM", m.MM).replace("dd", m.dd).replace("HH", m.HH).replace("mm", m.mm);
  },
  base64Encode: s => Buffer.from(String(s)).toString("base64"),
  getUuid: () => "00000000-0000-0000-0000-000000000000",
};
const LockService = { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) };
function cargar(archivo, extra) {
  const src = fs.readFileSync(path.join(raiz, archivo), "utf8");
  return new Function("Utilities", "LockService", src + "\n;" + (extra || "") + "\nreturn this;").call({}, Utilities, LockService);
}

console.log("Horarios");
let H;
prueba("el programa no tiene errores de escritura", () => { new Function(fs.readFileSync(path.join(raiz, "apps/horarios-google/Codigo.gs"), "utf8")); });
prueba("se puede cargar", () => {
  const src = fs.readFileSync(path.join(raiz, "apps/horarios-google/Codigo.gs"), "utf8");
  H = new Function("Utilities", "LockService", src + "\nreturn { horaMal, duracion: typeof duracion === 'function' ? duracion : null };")(Utilities, LockService);
});
if (H) {
  const ahora = h => new Date(h + ":00-03:00");
  const entrada = (f, e) => ({ fecha: f, entrada: e });
  prueba("salida a una hora que ya pasó: vale", () => igual(H.horaMal(entrada("2026-11-15", "09:00"), "17:00", ahora("2026-11-15T18:30")), ""));
  prueba("salida a una hora que todavía no pasó: no vale", () => si(/todavía no pasó/.test(H.horaMal(entrada("2026-11-15", "09:00"), "19:00", ahora("2026-11-15T18:30")))));
  prueba("salida antes de la entrada: no vale", () => si(H.horaMal(entrada("2026-11-15", "09:00"), "08:00", ahora("2026-11-15T18:30")) !== ""));
  prueba("turno de noche (entra 17, sale 01): vale", () => igual(H.horaMal(entrada("2026-11-15", "17:00"), "01:00", ahora("2026-11-16T02:00")), ""));
  prueba("salida olvidada del día anterior: vale", () => igual(H.horaMal(entrada("2026-11-14", "09:00"), "16:00", ahora("2026-11-15T10:00")), ""));
  prueba("hora mal escrita: no vale", () => { si(H.horaMal(entrada("2026-11-15", "09:00"), "25:00", ahora("2026-11-15T18:30")) !== ""); si(H.horaMal(entrada("2026-11-15", "09:00"), "1600", ahora("2026-11-15T18:30")) !== ""); });
}

console.log("Cuentas");
prueba("el programa no tiene errores de escritura", () => { new Function(fs.readFileSync(path.join(raiz, "apps/cuentas/Codigo.gs"), "utf8")); });
prueba("la pantalla no tiene errores de escritura", () => {
  const s = fs.readFileSync(path.join(raiz, "apps/cuentas/Pantalla.html"), "utf8"), re = /<script>([\s\S]*?)<\/script>/g; let m, n = 0;
  while ((m = re.exec(s))) { new Function(m[1]); n++; }
  si(n > 0, "no encontré el programa de la pantalla");
});

// Planilla y ARCA simuladas
function armarCuentas(planilla, arca) {
  const enviados = [];
  const src = fs.readFileSync(path.join(raiz, "apps/cuentas/Codigo.gs"), "utf8");
  const C = new Function("Utilities", "LockService", "PLANILLA", "ARCA", "ENVIADOS", "var CacheService;" + src + `
    ;hoja = function (n) { const t = PLANILLA[n] = PLANILLA[n] || [["encabezado"]]; return { appendRow: r => t.push(r), getLastRow: () => t.length, getDataRange: () => ({ getValues: () => t.map(r => r.slice()) }),
      getRange: (f, c, nf, nc) => ({ setValue: v => { t[f - 1][c - 1] = v; }, setValues: vs => { vs[0].forEach((v, k) => { t[f - 1][c - 1 + k] = v; }); } }) }; };
    filas = function (n) { return (PLANILLA[n] || [["encabezado"]]).slice(1); };
    quien = function () { return { nombre: "Prueba", rol: "admin" }; };
    facturaPdf = function () { return "https://drive.google.com/file/d/prueba/view"; };
    wsfe = function (metodo, cuerpo) { ENVIADOS.push([metodo, cuerpo]); return ARCA(metodo, cuerpo); };
    CacheService = { getScriptCache: () => ({ put() {}, get() { return null; } }) };
    return { facturar, notaCredito, recuperarFaltantes, revisarConArca, fechaArca, entrar, PLANILLA };`)(Utilities, LockService, planilla, arca, enviados);
  C.enviados = enviados;
  return C;
}
const tag = (t, v) => "<" + t + ">" + v + "</" + t + ">";
function arcaFalsa(ultimos, consultas) {
  return function (metodo, cuerpo) {
    const tipo = Number((cuerpo.match(/<ar:CbteTipo>(\d+)</) || [])[1]);
    if (metodo === "FECompUltimoAutorizado") return tag("CbteNro", ultimos[tipo] || 0);
    if (metodo === "FECompConsultar") { const n = Number(cuerpo.match(/<ar:CbteNro>(\d+)</)[1]); const c = (consultas || {})[tipo + "-" + n]; return c ? tag("ResultGet", c) : ""; }
    if (metodo === "FECAESolicitar") return tag("FECAEDetResponse", tag("Resultado", "A") + tag("CAE", "12345678901234") + tag("CAEFchVto", "20261130"));
    throw new Error("método inesperado " + metodo);
  };
}
const filaFactura = (tipo, nro, total, doc, cond, fecha) => [fecha || "11/11/2026 19:28", "Matías", "Factura " + tipo, 5, nro, "", "Cliente prueba", doc, cond, +(total / 1.21).toFixed(2), +(total - total / 1.21).toFixed(2), total, "86452255057513", "21/11/2026", "Servicio gastronómico", "", ""];

prueba("factura B: el IVA y el neto suman el total", () => {
  const C = armarCuentas({ FACTURAS: [["enc"]], CUIT: [["enc"]], REGISTRO: [["enc"]] }, arcaFalsa({ 6: 3 }));
  const r = C.facturar("t", { tipo: "B", total: 118100, docTipo: "99", detalle: "cena" });
  igual(r.numero, "00005-00000004");
  igual(Math.round((r.neto + r.iva) * 100), 11810000, "neto + IVA");
});
prueba("factura A: pide CUIT válido", () => {
  const C = armarCuentas({ FACTURAS: [["enc"]], CUIT: [["enc"]], REGISTRO: [["enc"]] }, arcaFalsa({ 1: 0 }));
  let error = ""; try { C.facturar("t", { tipo: "A", total: 1000, cond: "1", docNro: "123" }); } catch (e) { error = e.message; }
  si(/CUIT no es válido/.test(error), "dejó pasar un CUIT malo");
});
prueba("recupera una factura que ARCA aprobó pero no quedó anotada", () => {
  const consulta = tag("DocTipo", "99") + tag("DocNro", "0") + tag("CbteFch", "20261112") + tag("ImpTotal", "158400") + tag("ImpNeto", "130909.09") +
    tag("ImpIVA", "27490.91") + tag("CodAutorizacion", "86462411774004") + tag("FchVto", "20261122") + tag("CondicionIVAReceptorId", "5");
  const P = { FACTURAS: [["enc"], filaFactura("B", "00005-00000003", 118100, "Sin identificar", "Consumidor final")], CUIT: [["enc"]], REGISTRO: [["enc"]] };
  const C = armarCuentas(P, arcaFalsa({ 6: 4 }, { "6-4": consulta }));
  const r = C.recuperarFaltantes(6, 4);
  igual(r.join(), "Factura B 00005-00000004");
  igual(P.FACTURAS.length, 3, "filas en FACTURAS");
  igual(P.FACTURAS[2][11], 158400, "total recuperado");
  igual(P.FACTURAS[2][12], "86462411774004", "CAE recuperado");
});
prueba("no duplica las que ya están anotadas", () => {
  const P = { FACTURAS: [["enc"], filaFactura("B", "00005-00000001", 1000, "Sin identificar", "Consumidor final")], CUIT: [["enc"]], REGISTRO: [["enc"]] };
  const C = armarCuentas(P, arcaFalsa({ 6: 1 }));
  igual(C.recuperarFaltantes(6, 1).length, 0);
  igual(P.FACTURAS.length, 2);
});
prueba("nota de crédito A: va asociada a la factura y en el orden que pide ARCA", () => {
  const P = { FACTURAS: [["enc"], filaFactura("A", "00005-00000002", 951311, "CUIT 33715764119", "Responsable inscripto", "12/11/2026 19:30")], CUIT: [["enc"]], REGISTRO: [["enc"]] };
  const C = armarCuentas(P, arcaFalsa({ 3: 0, 1: 2 }));
  const r = C.notaCredito("t", { numero: "00005-00000002", tipo: "A", motivo: "error" });
  igual(r.numero, "00005-00000001");
  igual(r.total, 951311);
  const xml = C.enviados.filter(e => e[0] === "FECAESolicitar")[0][1];
  si(/<ar:CbteTipo>3<\/ar:CbteTipo>/.test(xml), "no es tipo 3 (nota de crédito A)");
  si(/<ar:CbteAsoc><ar:Tipo>1<\/ar:Tipo><ar:PtoVta>5<\/ar:PtoVta><ar:Nro>2<\/ar:Nro><ar:Cuit>33712205569<\/ar:Cuit><ar:CbteFch>20261112<\/ar:CbteFch>/.test(xml), "comprobante asociado mal armado");
  si(xml.indexOf("CondicionIVAReceptorId") < xml.indexOf("CbtesAsoc") && xml.indexOf("CbtesAsoc") < xml.indexOf("<ar:Iva>"), "orden de los campos");
  si(/<ar:DocTipo>80<\/ar:DocTipo><ar:DocNro>33715764119<\/ar:DocNro>/.test(xml), "documento del cliente");
  igual(P.FACTURAS[2][2], "Nota de crédito A");
});
prueba("nota de crédito: no deja anular más que la factura", () => {
  const P = { FACTURAS: [["enc"], filaFactura("B", "00005-00000001", 16000, "Sin identificar", "Consumidor final"),
    ["12/11/2026 10:00", "Matías", "Nota de crédito B", 5, "00005-00000001", "", "x", "Sin identificar", "Consumidor final", 0, 0, 10000, "1", "", "Sobre Factura B 00005-00000001", "", ""]],
    CUIT: [["enc"]], REGISTRO: [["enc"]] };
  const C = armarCuentas(P, arcaFalsa({ 8: 1, 6: 1 }));
  let error = ""; try { C.notaCredito("t", { numero: "00005-00000001", tipo: "B", monto: 7000 }); } catch (e) { error = e.message; }
  si(/no puede ser mayor/.test(error), "dejó anular de más: " + error);
  const r = C.notaCredito("t", { numero: "00005-00000001", tipo: "B" });
  igual(r.total, 6000, "lo que quedaba");
});
prueba("PIN: bloquea al quinto error y no deja entrar ni con el PIN bueno", () => {
  const P = { ACCESO: [["Nombre", "PIN", "Rol", "Errores", "Bloqueado"], ["Raquel", "0201", "usuario", 0, ""]], REGISTRO: [["enc"]] };
  const C = armarCuentas(P, arcaFalsa({}));
  for (let k = 1; k <= 4; k++) { let e = ""; try { C.entrar("Raquel", "1111"); } catch (x) { e = x.message; } si(/Te quedan/.test(e), "intento " + k + ": " + e); }
  let e = ""; try { C.entrar("Raquel", "1111"); } catch (x) { e = x.message; } si(/bloqueado/.test(e), "no bloqueó: " + e);
  e = ""; try { C.entrar("Raquel", "0201"); } catch (x) { e = x.message; } si(/bloqueado/.test(e), "entró estando bloqueada");
});
prueba("PIN: el bueno entra y reinicia los errores", () => {
  const P = { ACCESO: [["Nombre", "PIN", "Rol", "Errores", "Bloqueado"], ["Yoana", "2210", "usuario", 3, ""]], REGISTRO: [["enc"]] };
  const C = armarCuentas(P, arcaFalsa({}));
  igual(C.entrar("Yoana", "2210").nombre, "Yoana");
  igual(P.ACCESO[1][3], 0, "errores");
});
prueba("PIN: sin PIN cargado no puede elegir uno (lo carga Matías)", () => {
  const P = { ACCESO: [["Nombre", "PIN", "Rol"], ["Nueva", "", "usuario"]], REGISTRO: [["enc"]] };
  const C = armarCuentas(P, arcaFalsa({}));
  let e = ""; try { C.entrar("Nueva", "1234"); } catch (x) { e = x.message; } si(/Pedile a Matías/.test(e), e);
  igual(P.ACCESO[1][1], "", "se guardó un PIN");
});
prueba("fecha de la factura para ARCA", () => {
  const C = armarCuentas({}, arcaFalsa({}));
  igual(C.fechaArca("11/11/2026 19:28"), "20261111");
  igual(C.fechaArca("3/1/2027 9:05"), "20270103");
});

console.log("\n" + ok + " pruebas bien, " + fallas + " mal.");
if (fallas) { console.log("NO SE PUBLICA: hay que arreglar lo que falló."); process.exit(1); }
