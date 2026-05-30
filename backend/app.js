import dotenv from "dotenv";
dotenv.config({ path: "./backend/.env" });

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import authRoutes from "./src/routes/auth.route.js";
import requerimientosRoutes from "./src/routes/requerimiento.route.js";
import proveedoresRoutes from "./src/routes/proveedores.route.js";
import ordenesRoutes from "./src/routes/ordenes.route.js";
import cotizacionesRoutes from "./src/routes/cotizaciones.route.js";
import recepcionesRoutes from "./src/routes/recepciones.route.js";

const app = express();

// ─── __dirname en ES Modules ────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Middlewares globales ──────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Crear carpetas de uploads si no existen
const uploadsDir = path.join(__dirname, 'uploads', 'cotizaciones');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Carpeta de uploads creada:', uploadsDir);
}

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

// ─── Health check ──────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ estado: "ok", timestamp: new Date().toISOString() });
});

// ─── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ mensaje: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ─── Manejo de errores ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Error global]", err);
  res.status(500).json({ mensaje: "Error interno del servidor" });
});

// ─── Servidor ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

export default app;