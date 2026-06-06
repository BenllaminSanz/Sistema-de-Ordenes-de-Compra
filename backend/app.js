// Load environment variables (must be the very first thing)
import "./src/config/env.js";

import express from "express";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import logger from "./src/utils/logger.js";
import { AppError } from "./src/utils/AppError.js";

import authRoutes from "./src/routes/auth.route.js";
import requerimientosRoutes from "./src/routes/requerimiento.route.js";
import proveedoresRoutes from "./src/routes/proveedores.route.js";
import ordenesRoutes from "./src/routes/ordenes.route.js";
import cotizacionesRoutes from "./src/routes/cotizaciones.route.js";
import recepcionesRoutes from "./src/routes/recepciones.route.js";
import reportesRoutes from "./src/routes/reportes.route.js";
import catalogoRoutes from "./src/routes/catalogo.route.js";

const app = express();

// ─── __dirname en ES Modules ────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Middlewares globales ──────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Scripts en línea (frontend vanilla)
        scriptSrcAttr: ["'unsafe-inline'"],       // Event handlers inline (onclick, onchange, etc.)
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  })
); // Seguridad HTTP básica + CSP adaptado al frontend actual
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging básico de requests
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.request(req.method, req.originalUrl, res.statusCode, duration);
  });

  next();
});

// Crear carpetas de uploads si no existen
const uploadsDirs = [
  path.join(__dirname, 'uploads', 'cotizaciones'),
  path.join(__dirname, 'uploads', 'items-referencia'),
];
uploadsDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('📁 Carpeta de uploads creada:', dir);
  }
});

// ─── CORS ──────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "../frontend")));

// Servir archivos subidos (PDFs de cotizaciones, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// ─── Rutas API ──────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/requerimientos", requerimientosRoutes);
app.use("/api/proveedores", proveedoresRoutes);
app.use("/api/ordenes-compra", ordenesRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use("/api/ordenes-compra/:orden_id/recepciones", recepcionesRoutes);
app.use("/api/reportes", reportesRoutes);
app.use("/api/catalogo", catalogoRoutes);

// ─── Health check ──────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ estado: "ok", timestamp: new Date().toISOString() });
});

// ─── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ mensaje: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ─── Manejo de errores mejorado ────────────────────────────
app.use((err, req, res, next) => {
  // Si es un AppError operativo, usamos su status y mensaje
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

  // Errores no operacionales (bugs) → log completo + mensaje genérico
  logger.error("Error no controlado", {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body, // Cuidado: no loguear datos sensibles en producción
  });

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    mensaje: "Error interno del servidor",
  });
});

// ─── Servidor ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

export default app;