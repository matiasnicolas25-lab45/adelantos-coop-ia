# adelantos-coop-ia

Repositorio de trabajo de La Caleta, la cooperativa gastronómica del Yacht Club Rosario: adelantos de los asociados, precios de proveedores, costeo de recetas y automatizaciones.

- Las reglas del negocio están en el skill `.claude/skills/la-caleta/` (SKILL.md y `references/`).
- Antes de empezar, leé la bitácora compartida (planilla "Bitácora La Caleta" en Drive, ver `BITACORA.md`) para saber en qué quedaron los otros chats. Al terminar algo importante, agregale renglones.
- Quien usa este repo no es programador: respondé en español rioplatense, simple y corto.
- Hay agentes especializados en `.claude/agents/`: `facturas` (aumentos y bajas de facturas), `margen` (% de ganancia por plato), `precios-socios` (lista de socios y PDF), `carta` (AUMENTOS, Resto Soft y comisión), `adelantos` (carga semanal y WhatsApp) y `resto-soft` (registrar los informes que se descargan de Resto Soft). Usá el que corresponda al tema.

## Lo que ya está armado (no lo vuelvas a proponer ni a armar)

Antes de proponer una automatización o una app, fijate acá y en la bitácora. Si hay que cambiar algo de esto, se mejora lo que existe.

**Tareas programadas de Claude** (se ven con las herramientas de tareas programadas):
- **Adelantos de la semana**: jueves y viernes, cada hora de 14 a 22. Si Mat subió el chat de WhatsApp a la carpeta "Chat adelantos" de Drive, carga la semana y le manda un mail con las dudas.
- **Revisar facturas de la semana**: miércoles a la tarde. Revisa facturas y listas de proveedores de Drive, arma aumentos y bajas, y los cambios de margen.
- **Resumen de novedades de Anthropic**: lunes a la mañana, por mail.

**Apps** (Google Apps Script; ver la bitácora para el detalle):
- **App La Caleta** (lacaleta.ycr.com.ar/app, planilla "Horarios La Caleta"): los socios marcan entrada y salida con PIN y ven sus horas, sus adelantos (cuando CONFIG B5 = SÍ), los precios y su retiro de la semana (CONFIG B7). Le manda a Mat un mail diario con los olvidos de salida.
- **App de cuentas** (planilla "Cuentas La Caleta"): cuentas corrientes de Resto Soft, recargo semanal, mensajes de WhatsApp y factura A/B por ARCA. Tiene datos personales: solo la usan Matías, Raquel, Yoana y Belén.
- **Script de Resto Soft** (`scripts/restosoft_txt.gs`): arma el .txt de precios para cargar en Resto Soft.
