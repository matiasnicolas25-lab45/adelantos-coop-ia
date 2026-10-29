# Kit Gestión IA — guía para el consultor

Kit para hacer con IA el trabajo de oficina de un negocio: facturas de proveedores, costos y recetas, márgenes, lista de precios, cierre del mes, liquidaciones y archivos para el sistema de ventas.

**Nada de este kit es de La Caleta.** Es una versión genérica: no copies datos, nombres ni reglas de un cliente a otro.

## Qué tiene

- **Planilla modelo** en Google Drive, carpeta "Kit Gestión IA (plantillas)":
  "Gestión del negocio — PLANTILLA" (`1LaLtkfsA5JqvNUF_qTXNKDK4gEZFkgnZwzzXsDlwfR8`). Hojas: LEEME, Configuración, Proveedores, Recetas, Productos, Lista de precios, Mes a mes, Bitácora. Viene con datos de ejemplo.
- **Reglas** (skill `gestion-negocio`).
- **6 agentes**:

| Agente | Hace |
|---|---|
| `facturas` | Lee facturas (foto, PDF, a mano) y propone aumentos y bajas |
| `margen` | Informa cuánto se le gana a cada producto, antes y después de gastos |
| `precios` | Fecha de la lista, PDF para clientes y PDF de cambios |
| `cierre-mes` | Completa "Mes a mes" y resume el resultado |
| `liquidaciones` | Adelantos y consumos del personal o asociados, y mensajes |
| `sistema-ventas` | Lee exportaciones de su sistema y arma archivos para importar |

## Puesta en marcha de un cliente nuevo

1. **Copiar la planilla:** en Drive, "Hacer una copia" de la PLANTILLA y renombrarla con el nombre del negocio. Borrar los datos de ejemplo (filas 5 en adelante de Proveedores, Recetas y Productos, y los meses de "Mes a mes").
2. **Carpetas del cliente en Drive:** Facturas, Exportaciones del sistema (si tiene), PDF para clientes. Compartirlas con la cuenta que usa Claude.
3. **Proyecto del cliente:** una carpeta o repositorio con este kit instalado como plugin y un `CLAUDE.md` con:
   - nombre del negocio y rubro;
   - ID de su planilla y de sus carpetas;
   - sistema de ventas (cuál, qué exporta, qué importa) o "sin sistema";
   - reglas propias: recargos, redondeo, si la mano de obra va en las recetas, quién aprueba precios, cómo se liquida al personal.
4. **Cargar lo inicial con la IA:** listas de precios de proveedores, recetas y precios de venta, a partir de lo que tenga el cliente (Excel, fotos, papeles).
5. **Medir el antes:** anotar cuántas horas por semana lleva hoy cada tarea. Al mes, medir de nuevo: ese ahorro es lo que vende el servicio.

## Instalar el plugin

Esta carpeta es un plugin de Claude Code (`.claude-plugin/plugin.json`, `skills/`, `agents/`). Se instala desde un repositorio de GitHub agregado como marketplace, o copiando `skills/` y `agents/` dentro de la carpeta `.claude/` del proyecto del cliente.

## Reglas que no se negocian

- Nada cambia sin el OK del dueño.
- Lo nuevo va al final de cada hoja; no se insertan filas en el medio.
- Todo lo que se hace queda en la Bitácora.
- Los datos de cada cliente son solo de ese cliente.
