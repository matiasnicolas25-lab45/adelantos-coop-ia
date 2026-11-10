"""Arma Codigo.gs (el único archivo que se pega en Apps Script) a partir de las partes:
app.gs, pdf.gs, qrcode.js (librería MIT de Kazuhiko Arase) y Pantalla.html (va como PANTALLA).
Uso: python3 armar.py"""
s = open("Codigo.gs").read()
i = s.index("/* ---------------- app de cuentas")
j = s.index("/* ---------------- diálogos")
pantalla = open("Pantalla.html").read()
assert "`" not in pantalla and "${" not in pantalla and "\\" not in pantalla
medio = (open("app.gs").read().rstrip() + "\n\n" + open("xls.gs").read().rstrip() + "\n\n" + open("pdf.gs").read().rstrip() +
         "\n\n/* ---------------- librería de QR (qrcode-generator 1.4.4, MIT, Kazuhiko Arase) ---------------- */\n\n" +
         open("qrcode.js").read().rstrip() +
         "\n\n/* ---------------- pantalla de la app (copia de Pantalla.html) ---------------- */\n\nconst PANTALLA = `" +
         pantalla + "`;\n\n")
open("Codigo.gs", "w").write(s[:i] + medio + s[j:])
