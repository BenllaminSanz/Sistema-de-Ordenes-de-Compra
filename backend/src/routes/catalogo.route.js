import express from 'express';
import multer from 'multer';
const router = express.Router();

import {
  listar,
  obtener,
  crear,
  actualizar,
  cambiarEstado,
  eliminar,
  importarExcel,
  exportarExcel,
} from '../controllers/catalogoController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Solo archivos Excel (.xlsx, .xls)'));
    }
  }
});

// Todas las rutas del catálogo requieren autenticación
router.use(autenticar);

// Cualquier usuario autenticado puede consultar el catálogo
router.get('/', listar);
router.get('/export', autorizar('contabilidad', 'admin'), exportarExcel);
router.get('/:id', obtener);

// Solo Contabilidad y Admin pueden gestionar el catálogo
router.post('/',     autorizar('contabilidad', 'admin'), crear);
router.put('/:id',   autorizar('contabilidad', 'admin'), actualizar);
router.patch('/:id/estado', autorizar('contabilidad', 'admin'), cambiarEstado);
router.delete('/:id', autorizar('contabilidad', 'admin'), eliminar);

// Import masivo desde Excel (upsert por código de ítem)
router.post('/import', autorizar('contabilidad', 'admin'), upload.single('excel'), importarExcel);

export default router;