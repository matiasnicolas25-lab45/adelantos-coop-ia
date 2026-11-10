// Arma un pedido de certificado (CSR PKCS#10) para ARCA con WebCrypto. Va adentro del diálogo de Codigo.gs.
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
if (typeof module !== "undefined") module.exports = { crearCsr: crearCsr };
