import express from 'express';
import multer from 'multer';
const router = express.Router();
import { listar, obtener, crear, actualizar, cambiarEstado, importarExcel } from '../controllers/proveedoresController.js';
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

router.get('/',                                                   listar);
router.get('/:id',                                                obtener);
router.post('/',    autorizar('contabilidad','admin'),            crear);
router.put('/:id',  autorizar('contabilidad','admin'),            actualizar);
router.patch('/:id/estado', autorizar('admin'),                   cambiarEstado);
router.post('/import', autorizar('contabilidad','admin'), upload.single('excel'), importarExcel);

export default router;