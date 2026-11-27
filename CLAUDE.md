# adelantos-coop-ia

Repositorio de trabajo de La Caleta, la cooperativa gastronómica del Yacht Club Rosario: adelantos de los asociados, precios de proveedores, costeo de recetas y automatizaciones.

- Las reglas del negocio están en el skill `.claude/skills/la-caleta/` (SKILL.md y `references/`).
- Antes de empezar, leé la bitácora compartida (planilla "Bitácora La Caleta" en Drive, ver `BITACORA.md`) para saber en qué quedaron los otros chats. Al terminar algo importante, agregale renglones.
- Quien usa este repo no es programador: respondé en español rioplatense, simple y corto.

## Ramas de GitHub (una por proyecto)

- `adelantos`: la principal. Reglas de La Caleta, agentes y scripts (adelantos, facturas, precios, recetas, Resto Soft).
- `apps`: App La Caleta (horarios) y app de cuentas/caja. Lo que se sube acá con cambios en los `Codigo.gs` se publica solo en Google.
- Cambios a medio terminar o sin confirmar: rama con el nombre del proyecto y lo que falta (por ejemplo `apps-caja-pendiente`, `apps-horarios-pendiente`, `apps-propuesta-wordpress`, `resto-soft-recargos`, `facturas`, `linkedin`).
- Al terminar un trabajo y con el OK de Mat, subilo a la rama de su proyecto. Si es un proyecto nuevo, creale una rama con el nombre del proyecto, corto y en minúsculas. La rama automática del chat (`claude/...`) es solo para trabajar mientras dura el chat; cuando lo que tiene ya está en la rama del proyecto, se borra.
