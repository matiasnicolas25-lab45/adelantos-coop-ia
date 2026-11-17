#!/usr/bin/env bash
# Sube cada programa a su proyecto de Apps Script y publica una versión nueva en el MISMO link (/exec).
# Lo corre GitHub Actions al guardar cambios (.github/workflows/subir-apps.yml). Necesita ~/.clasprc.json (secreto CLASPRC_JSON).
set -euo pipefail
cd "$(dirname "$0")/.."
for app in horarios cuentas; do
  sid=$(jq -r ".$app.scriptId" deploy/proyectos.json)
  dep=$(jq -r ".$app.deploymentId" deploy/proyectos.json)
  if [ -z "$sid" ]; then echo "⏭  $app: falta el scriptId en deploy/proyectos.json, no se sube."; continue; fi
  dir=$(mktemp -d)
  cp "$(jq -r ".$app.codigo" deploy/proyectos.json)" "$dir/Codigo.js"
  jq -n --argjson w "$(jq ".$app.webapp" deploy/proyectos.json)" \
    '{timeZone:"America/Argentina/Buenos_Aires", runtimeVersion:"V8", exceptionLogging:"STACKDRIVER", webapp:$w}' > "$dir/appsscript.json"
  echo "{\"scriptId\":\"$sid\",\"rootDir\":\"$dir\"}" > "$dir/.clasp.json"
  (cd "$dir" && clasp push --force && clasp deploy --deploymentId "$dep" --description "auto $(date -u +%Y-%m-%d) ${GITHUB_SHA:0:7}")
  echo "✅ $app subida y publicada."
done
