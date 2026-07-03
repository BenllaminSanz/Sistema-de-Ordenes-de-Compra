# Empaqueta el proyecto para deploy (excluye node_modules, .env, uploads, artefactos locales)
# Ejecutar desde la raíz del proyecto:
#   powershell -ExecutionPolicy Bypass -File .\empaquetar-deploy.ps1

$proyecto  = Split-Path -Parent $MyInvocation.MyCommand.Path
$fecha     = Get-Date -Format "yyyy-MM-dd_HHmm"
$staging   = "$env:TEMP\deploy-oc-$fecha"
$destino   = "$proyecto\deploy-oc-$fecha.zip"

Write-Host ""
Write-Host "=== Empaquetando Sistema de Ordenes de Compra ===" -ForegroundColor Cyan
Write-Host "Staging: $staging"
Write-Host "ZIP destino: $destino`n"

New-Item -ItemType Directory -Path $staging -Force | Out-Null

robocopy "$proyecto\backend" "$staging\backend" /E /XD node_modules uploads /XF .env /NFL /NDL /NJH /NJS
robocopy "$proyecto\frontend" "$staging\frontend" /E /NFL /NDL /NJH /NJS
robocopy "$proyecto\docs" "$staging\docs" /E /XD node_modules /NFL /NDL /NJH /NJS

Copy-Item "$proyecto\.env.example" "$staging\" -ErrorAction SilentlyContinue
Copy-Item "$proyecto\README.md"    "$staging\" -ErrorAction SilentlyContinue

Write-Host "Comprimiendo..." -ForegroundColor Yellow
Compress-Archive -Path "$staging\*" -DestinationPath $destino -Force

Remove-Item -Recurse -Force $staging

$size = [math]::Round((Get-Item $destino).Length / 1MB, 1)
Write-Host ""
Write-Host "ZIP creado: $destino ($size MB)" -ForegroundColor Green
Write-Host "Transfierelo al servidor con UltraVNC File Transfer."
Write-Host ""