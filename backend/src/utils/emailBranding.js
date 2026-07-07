import path from 'path';
import { existsSync } from 'fs';
import { projectRoot } from '../config/env.js';

export const EMPRESA_SUBTITULO = 'Hilos de Yecapixtla S.A. de C.V.';
export const LOGO_CID = 'logo-parkdale';
export const LOGO_WEB_PATH = 'img/topLogoParkdale.png';
export const LOGO_FILENAME = 'topLogoParkdale.png';

export function getLogoAbsolutePath() {
  return path.join(projectRoot, 'frontend', 'img', LOGO_FILENAME);
}

export function logoDisponible() {
  return existsSync(getLogoAbsolutePath());
}

export function getLogoAttachment() {
  if (!logoDisponible()) return null;
  return {
    filename: LOGO_FILENAME,
    path: getLogoAbsolutePath(),
    cid: LOGO_CID,
  };
}

export function getEmailBrandingAttachments() {
  const att = getLogoAttachment();
  return att ? [att] : [];
}

/** Encabezado HTML para correos (logo embebido vía CID + subtítulo de empresa). */
export function buildEmailBrandingHtml() {
  if (!logoDisponible()) {
    return `
      <div style="text-align:center; margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid #e2e8f0;">
        <p style="margin:0; font-size:14px; font-weight:600; color:#334155;">${EMPRESA_SUBTITULO}</p>
      </div>`;
  }

  return `
    <div style="text-align:center; margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid #e2e8f0;">
      <img src="cid:${LOGO_CID}" alt="Parkdale" style="max-width:220px; max-height:72px; height:auto; margin-bottom:8px; display:inline-block;">
      <p style="margin:0; font-size:13px; font-weight:600; color:#475569; letter-spacing:0.2px;">${EMPRESA_SUBTITULO}</p>
    </div>`;
}