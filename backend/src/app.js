/**
 * Fábrica de la aplicación Express (sin listen ni migraciones).
 * Usada por server.js en runtime y por tests de integración.
 */
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import logger from './utils/logger.js';
import { AppError } from './utils/AppError.js';

import authRoutes from './routes/auth.route.js';
import requerimientosRoutes from './routes/requerimiento.route.js';
import proveedoresRoutes from './routes/proveedores.route.js';
import ordenesRoutes from './routes/ordenes.route.js';
import cotizacionesRoutes from './routes/cotizaciones.route.js';
import recepcionesRoutes from './routes/recepciones.route.js';
import reportesRoutes from './routes/reportes.route.js';
import catalogoRoutes from './routes/catalogo.route.js';
import unidadesRoutes from './routes/unidades.route.js';
import configRoutes from './routes/config.route.js';
import dashboardRoutes from './routes/dashboard.route.js';
import areasRoutes from './routes/areas.route.js';
import notificacionesRoutes from './routes/notificaciones.route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// backend/ (padre de src/)
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');

const { version: APP_VERSION } = JSON.parse(
  fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8')
);

/**
 * Crea y configura la app Express sin abrir puerto ni tocar la BD.
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  app.use(
    helmet({
      hsts: false,
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.request(req.method, req.originalUrl, res.statusCode, duration);
    });
    next();
  });

  const uploadsDirs = [
    path.join(backendRoot, 'uploads', 'cotizaciones'),
    path.join(backendRoot, 'uploads', 'items-referencia'),
  ];
  uploadsDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      if (process.env.NODE_ENV !== 'test') {
        console.log('📁 Carpeta de uploads creada:', dir);
      }
    }
  });

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.static(path.join(projectRoot, 'frontend')));
  app.use('/uploads', express.static(path.join(backendRoot, 'uploads')));

  app.get('/', (req, res) => {
    res.sendFile(path.join(projectRoot, 'frontend', 'login.html'));
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/requerimientos', requerimientosRoutes);
  app.use('/api/proveedores', proveedoresRoutes);
  app.use('/api/ordenes-compra', ordenesRoutes);
  app.use('/api/cotizaciones', cotizacionesRoutes);
  app.use('/api/ordenes-compra/:orden_id/recepciones', recepcionesRoutes);
  app.use('/api/reportes', reportesRoutes);
  app.use('/api/catalogo', catalogoRoutes);
  app.use('/api/unidades-medida', unidadesRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/areas', areasRoutes);
  app.use('/api/notificaciones', notificacionesRoutes);

  app.get('/api/health', async (req, res) => {
    let frontend_url = process.env.FRONTEND_URL
      || process.env.PUBLIC_APP_URL
      || process.env.CORS_ORIGIN
      || 'http://localhost:3000';
    let notif_req_revision = true;
    try {
      const { obtenerAjustesCorreo, frontendUrlEfectiva } = await import('./models/configApp.js');
      const ajustes = await obtenerAjustesCorreo();
      frontend_url = frontendUrlEfectiva(ajustes);
      notif_req_revision = !!ajustes.notif_req_revision;
    } catch (_) { /* ignore */ }
    res.json({
      estado: 'ok',
      version: APP_VERSION,
      frontend_url: String(frontend_url).replace(/\/$/, ''),
      notif_req_revision,
      timestamp: new Date().toISOString(),
    });
  });

  app.use((req, res) => {
    res.status(404).json({ mensaje: `Ruta no encontrada: ${req.method} ${req.path}` });
  });

  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      logger.warn(`Error operacional: ${err.message}`, {
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
      });
      return res.status(err.statusCode).json({
        mensaje: err.message,
      });
    }

    logger.error('Error no controlado', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      body: req.body,
    });

    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      mensaje: 'Error interno del servidor',
    });
  });

  return app;
}

export { APP_VERSION };
export default createApp;
