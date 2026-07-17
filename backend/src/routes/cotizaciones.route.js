import express from 'express';
import * as cotizacionesController from '../controllers/cotizacionesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer: adjuntos de cotización (PDF, Word, Excel, imágenes, etc.)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/cotizaciones');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '';
    cb(null, `cotizacion-${req.params.id}-${uniqueSuffix}${ext}`);
  }
});

const EXT_PERMITIDAS = /\.(pdf|doc|docx|xls|xlsx|csv|png|jpe?g|gif|webp|txt|zip|rar|msg|eml)$/i;
const MIME_PERMITIDOS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

const fileFilter = (req, file, cb) => {
  const okExt = EXT_PERMITIDAS.test(file.originalname || '');
  const okMime = !file.mimetype || MIME_PERMITIDOS.has(file.mimetype) || file.mimetype.startsWith('image/');
  if (okExt || okMime) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Use PDF, Word, Excel, imagen u otros documentos de oficina.'), false);
  }
};

const uploadCotizacionArchivo = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }
});

const router = express.Router();

// Todas las rutas de cotizaciones requieren autenticación
router.use(autenticar);

// Rutas principales
router.get('/:requerimiento_id', cotizacionesController.listarCotizaciones);

router.get('/detalle/:id', cotizacionesController.obtenerCotizacion);

router.post('/', cotizacionesController.crearCotizacion);

router.put('/:id', cotizacionesController.actualizarCotizacion);

router.delete('/:id', cotizacionesController.eliminarCotizacion);

// Ruta específica para seleccionar una cotización
router.post('/:id/seleccionar', cotizacionesController.seleccionarCotizacion);

// Nueva ruta para deseleccionar una cotización (con confirmación en frontend)
router.post('/:id/deseleccionar', cotizacionesController.deseleccionarCotizacion);

// Enviar (o re-enviar) manualmente el correo de solicitud de cotización (botón en UI)
router.post('/:id/enviar', autorizar('contabilidad', 'admin'), cotizacionesController.enviarCorreoCotizacion);

// Subir archivo de respaldo (PDF, Word, Excel, etc.) — campo "archivo" o "pdf" (compat)
router.post(
  '/:id/archivo',
  (req, res, next) => {
    uploadCotizacionArchivo.fields([
      { name: 'archivo', maxCount: 1 },
      { name: 'pdf', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || 'Error al subir archivo' });
      }
      // Normalizar a req.file
      const f = req.files?.archivo?.[0] || req.files?.pdf?.[0] || null;
      if (f) req.file = f;
      next();
    });
  },
  cotizacionesController.subirArchivoCotizacion
);

export default router;