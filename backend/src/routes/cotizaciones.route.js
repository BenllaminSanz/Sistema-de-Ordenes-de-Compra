import express from 'express';
import * as cotizacionesController from '../controllers/cotizacionesController.js';
import { autenticar } from '../middlewares/authMiddleware.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer config específico para PDFs de cotizaciones
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/cotizaciones');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `cotizacion-${req.params.id}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos PDF'), false);
  }
};

const uploadCotizacionPdf = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
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

// Subir archivo PDF real a una cotización
router.post('/:id/archivo', uploadCotizacionPdf.single('pdf'), cotizacionesController.subirArchivoCotizacion);

export default router;