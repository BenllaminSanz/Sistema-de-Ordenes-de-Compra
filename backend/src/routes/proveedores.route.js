import express from 'express';
import multer from 'multer';
const router = express.Router();
import {
  listar,
  obtener,
  crear,
  actualizar,
  cambiarEstado,
  importarExcel,
  exportarExcel,
} from '../controllers/proveedoresController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

router.use(autenticar);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Solo archivos Excel (.xlsx o .xls)'));
    }
  }
});

router.get('/', listar);
// Rutas fijas antes de /:id
router.get('/export', autorizar('compras', 'admin'), exportarExcel);
router.post('/import', autorizar('compras', 'admin'), upload.single('excel'), importarExcel);
router.get('/:id', obtener);
router.post('/', autorizar('compras', 'admin'), crear);
router.put('/:id', autorizar('compras', 'admin'), actualizar);
router.patch('/:id/estado', autorizar('admin'), cambiarEstado);

export default router;