# Cuentas La Caleta (cuentas corrientes y factura A)

Planilla: "Cuentas La Caleta" en "La Caleta — Sistema" (ID `1o9hwDQ5Yww8bs38ue48hwM-nSSsrh-vwcL2f0c_32oM`).
Programa: `Codigo.gs` (Extensiones → Apps Script, un solo archivo). `csr.js` es el armado del pedido de
certificado, ya copiado adentro de `Codigo.gs` (constante CSR_CODIGO). `vista-previa.html` es el diseño de la app.

## Certificado de ARCA (una sola vez)

1. Menú **ARCA → 1. Crear pedido de certificado**: crea la llave (queda en Propiedades del script, ARCA_CLAVE;
   nunca se copia ni se manda) y deja `pedido-certificado-lacaleta.csr` en la carpeta.
2. ARCA → Administración de Certificados Digitales → Agregar alias `lacaleta` → subir el .csr → bajar el .crt.
3. Menú **ARCA → 2. Guardar el certificado de ARCA** → elegir el .crt (queda en ARCA_CERT).
4. ARCA → Administrador de Relaciones → Nueva relación → ARCA → WebServices → Facturación Electrónica →
   representante: el alias `lacaleta`.

Datos fijos: CUIT 33712205569, Responsable Inscripto, IVA 21 %, punto de venta 5 (RECE para aplicativo y web services).

Estado 10/11/2026: conexión con ARCA probada OK (menú ARCA → 3). Certificado vigente: serie 21256ca90125c9ce
(vence 11/9/2028). No volver a tocar "1. Crear pedido": hace una llave nueva y borra el certificado guardado.
