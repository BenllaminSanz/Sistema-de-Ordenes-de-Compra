import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
const router = express.Router();
import {
  listar,
  obtener,
  crear,
  actualizar,
  cambiarEstado,
  eliminar,
  subirReferenciaItem,
  exportarExcel,
  importarExcel,
} from '../controllers/requerimientosController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';
import { validate } from '../validations/validationMiddleware.js';
import {
  crearRequerimientoSchema,
  actualizarRequerimientoSchema,
  cambiarEstadoRequerimientoSchema
} from '../validations/schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TIPOS_REFERENCIA = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const storageReferencia = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/items-referencia'));
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `ref-${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const uploadReferenciaItem = multer({
  storage: storageReferencia,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (TIPOS_REFERENCIA.has(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten PDF o imágenes (JPG, PNG, WEBP, GIF)'), false);
  },
});

const TIPOS_EXCEL = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (TIPOS_EXCEL.has(file.mimetype) || file.originalname.match(/\.xlsx?$/i)) cb(null, true);
    else cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'), false);
  },
});

router.use(autenticar);

router.get('/', listar);

// Exportar e importar deben ir ANTES de /:id para no ser capturados como parámetro
router.get('/exportar', exportarExcel);

router.post(
  '/importar',
  autorizar('contabilidad', 'admin'),
  (req, res, next) => {
    uploadExcel.single('archivo')(req, res, (err) => {
      if (err) return res.status(400).json({ mensaje: err.message || 'Archivo no válido' });
      next();
    });
  },
  importarExcel
);

router.post(
  '/referencia-item',
  autorizar('solicitante', 'contabilidad', 'admin'),
  (req, res, next) => {
    uploadReferenciaItem.single('archivo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ mensaje: err.message || 'Archivo no válido' });
      }
      next();
    });
  },
  subirReferenciaItem
);

router.get('/:id', obtener);

router.post(
  '/',
  autorizar('solicitante', 'admin'),
  validate(crearRequerimientoSchema),
  crear
);

router.put(
  '/:id',
  autorizar('solicitante', 'contabilidad', 'admin'),
  validate(actualizarRequerimientoSchema),
  actualizar
);

router.patch(
  '/:id/estado',
  autorizar('solicitante', 'contabilidad', 'admin'),
  validate(cambiarEstadoRequerimientoSchema),
  cambiarEstado
);

router.delete(
  '/:id',
  autorizar('admin'),
  eliminar
);

export default router;