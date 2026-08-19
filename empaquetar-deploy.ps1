# Empaqueta el proyecto para despliegue en servidor (sin node_modules, .env ni uploads de usuario)
$ErrorActionPreference = "Stop"

$raiz = $PSScriptRoot
$version = (Get-Content "$raiz\backend\package.json" -Raw | ConvertFrom-Json).version
$fecha = Get-Date -Format "yyyyMMdd-HHmm"
$zipName = "deploy-oc-v$version-$fecha.zip"
$zipPath = Join-Path $raiz $zipName

Write-Host "Empaquetando Sistema OC v$version ..." -ForegroundColor Cyan

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$tempDir = Join-Path $env:TEMP "oc-deploy-$fecha"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Nombres en raíz que no se copian al paquete
$omitirRaiz = @(
    ".git",
    ".github",
    "node_modules",
    "_Respaldos",
    "terminals",
    ".claude",
    "docs-generados",
    ".env"
)

Get-ChildItem -Path $raiz -Force | Where-Object {
    $n = $_.Name
    if ($n -in $omitirRaiz) { return $false }
    if ($n -like "deploy-oc-*.zip") { return $false }
    if ($n -like "*.zip") { return $false }
    # PDFs de apoyo/cliente en la raíz (van en docs-generados si aplica)
    if ($n -like "Gmail*.pdf") { return $false }
    return $true
} | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $tempDir $_.Name) -Recurse -Force
}

# Exclusiones dentro de la copia (rutas relativas a $tempDir)
$patronesBorrar = @(
    "node_modules",
    "backend\node_modules",
    "frontend\node_modules",
    ".env",
    ".git",
    "_Respaldos",
    "backend\uploads\cotizaciones",
    "backend\uploads\referencias",
    "backend\uploads\items-referencia",
    "docs-generados",
    "terminals",
    ".claude",
    "backend\tests",
    "backend\playwright.config.js",
    "backend\playwright-report",
    "backend\test-results",
    "backend\coverage",
    "backend\blob-report"
)

foreach ($patron in $patronesBorrar) {
    $ruta = Join-Path $tempDir $patron
    if (Test-Path $ruta) {
        Remove-Item $ruta -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Por si quedó algún node_modules anidado
Get-ChildItem -Path $tempDir -Recurse -Directory -Filter "node_modules" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

# Asegurar carpetas de uploads vacías (el servidor conserva las reales)
$uploadsCot = Join-Path $tempDir "backend\uploads\cotizaciones"
$uploadsRef = Join-Path $tempDir "backend\uploads\referencias"
$uploadsItemRef = Join-Path $tempDir "backend\uploads\items-referencia"
New-Item -ItemType Directory -Path $uploadsCot -Force | Out-Null
New-Item -ItemType Directory -Path $uploadsRef -Force | Out-Null
New-Item -ItemType Directory -Path $uploadsItemRef -Force | Out-Null

# Placeholder .gitkeep (opcional)
@("", "", "") | ForEach-Object { } | Out-Null
foreach ($d in @($uploadsCot, $uploadsRef, $uploadsItemRef)) {
    New-Item -ItemType File -Path (Join-Path $d ".gitkeep") -Force | Out-Null
}

Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force
Remove-Item $tempDir -Recurse -Force

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "Listo: $zipName ($sizeMb MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Pasos en el servidor:" -ForegroundColor Yellow
Write-Host "  1. Respaldar carpeta actual, .env y base de datos"
Write-Host "  2. Descomprimir el ZIP sobre la instalacion (conservar .env y backend/uploads/)"
Write-Host "  3. cd backend && npm install --omit=dev"
Write-Host "  4. Reiniciar el servicio (pm2 restart / servicio Windows / etc.)"
Write-Host "  5. Verificar http://servidor:PUERTO/api/health  (version $version)"
Write-Host ""
Write-Host "Guia: DESPLIEGUE-v$version.md" -ForegroundColor Cyan
