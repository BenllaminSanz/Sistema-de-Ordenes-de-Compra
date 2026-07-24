# Versionado del proyecto

> **¿Vas a subir cambios ahora?** Abre primero el manual de consulta:  
> **[docs/MANUAL-GIT-GITHUB.md](./docs/MANUAL-GIT-GITHUB.md)** (push del día vs release, checklists y comandos).

Este repositorio usa **[Semantic Versioning](https://semver.org/lang/es/)** (`MAJOR.MINOR.PATCH`) y tags Git con el prefijo `v` (ejemplo: `v1.3.2`).

## Fuentes de verdad

| Qué | Dónde |
|-----|--------|
| Número de versión de la app | `backend/package.json` → campo `"version"` |
| Historial de cambios | `CHANGELOG.md` |
| Punto fijo en Git | tag anotado `vX.Y.Z` |
| Publicación en GitHub | [Releases](https://github.com/BenllaminSanz/Sistema-de-Ordenes-de-Compra/releases) (a partir del tag) |

El `package-lock.json` del backend debe llevar la misma versión que `package.json`.

## Cómo elegir el número

| Tipo | Cuándo | Ejemplo |
|------|--------|---------|
| **PATCH** (`1.3.1` → `1.3.2`) | Correcciones y ajustes pequeños sin romper uso existente | bug de consecutivos, plantilla RFQ |
| **MINOR** (`1.3.2` → `1.4.0`) | Funcionalidad nueva compatible | catálogo por proveedor, carrito |
| **MAJOR** (`1.x` → `2.0.0`) | Cambios incompatibles (API, BD, flujos que rompen despliegues) | reescritura de contratos |

## Checklist de release

1. **Actualizar** `backend/package.json` y las dos entradas de versión en `backend/package-lock.json`.
2. **Documentar** la versión en `CHANGELOG.md` (sección nueva arriba; mover ítems de *Unreleased* si aplica).
3. **Actualizar** la línea de versión en `README.md` si corresponde.
4. **Commit** en `main` (o rama de release):
   ```powershell
   git add backend/package.json backend/package-lock.json CHANGELOG.md README.md
   git commit -m "release: vX.Y.Z — descripción breve"
   ```
5. **Crear tag anotado** en ese commit:
   ```powershell
   git tag -a vX.Y.Z -m "vX.Y.Z — descripción breve"
   ```
6. **Publicar** (cuando estés listo; no es automático):
   ```powershell
   git push origin main
   git push origin vX.Y.Z
   ```
7. **GitHub Release** (opcional pero recomendado):
   ```powershell
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file - <<'EOF'
   Ver CHANGELOG.md para el detalle.
   EOF
   ```
   En PowerShell puedes usar:
   ```powershell
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "Resumen de la versión. Detalle en CHANGELOG.md."
   ```
   O crear la release desde la UI de GitHub pegando el bloque de `CHANGELOG.md`.

## Tags históricos

| Tag | Commit (aprox.) | Notas |
|-----|-----------------|--------|
| `v1.0.0` | entrega formal | Ya existía en el remoto |
| `v1.1.2` | manual + ajustes SMTP/DB | |
| `v1.2.0` | carrito, recepciones, cierre OC | |
| `v1.2.1` | correcciones menores | |
| `v1.3.0` | consecutivos, catálogo proveedor, emails | |
| `v1.3.1` | fix consecutivos + scripts migración | |
| `v1.3.2` | plantilla RFQ, Nº ítem OC, líneas catálogo | |
| `v1.4.0` | fases A–D: PO/fecha_po, UDM, catálogo Excel, export OC | |
| `v1.4.1` | post-reunión: idioma RFQ, recibo por ítem, reporte OC, catálogo proveedor | | |
| `v1.5.0` | BASE GRAL import, sync estados OC, filtros activos | | |
| `v1.6.0` | reportes unificados, EUR, General REQ+OC, UI Excel | | |

## Convención de mensajes de commit (recomendado)

No es obligatorio, pero facilita el CHANGELOG:

- `feat:` nueva funcionalidad
- `fix:` corrección
- `docs:` documentación
- `chore:` mantenimiento (deps, versionado, scripts)
- `release: vX.Y.Z` — commit de corte de versión

## CI y pruebas

| Comando | Cuándo | Requiere |
|---------|--------|----------|
| `npm run test:ci` | Siempre (local y GitHub Actions) | Solo Node + archivos del repo |
| `npm test` | Antes de un release, en tu máquina | Servidor en marcha, MySQL, admin en `.env` |

El workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) ejecuta `test:ci` en cada push/PR a `main`.

La versión en pantalla (sidebar / login) y en `GET /api/health` sale de `backend/package.json`. Si el footer muestra otra versión que el tag, el servidor no se actualizó o hay un deploy incompleto.

## Qué no hacer

- No reescribir tags ya publicados en `origin` (`git tag -f` + force-push) salvo acuerdo explícito.
- No dejar la versión solo en el mensaje de commit: debe estar en `package.json` + tag.
- No subir `node_modules`, `.env` ni ZIPs de deploy al repositorio.
