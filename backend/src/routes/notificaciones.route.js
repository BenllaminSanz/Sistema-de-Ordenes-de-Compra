import express from 'express';
import { autenticar } from '../middlewares/authMiddleware.js';
import { bandeja, bandejaOc, dispararReporteDiario, dispararPurgaBorradores } from '../controllers/notificacionesController.js';

const router = express.Router();

router.use(autenticar);
router.get('/bandeja', bandeja);
router.get('/bandeja-oc', bandejaOc);
router.post('/reporte-diario', dispararReporteDiario);
router.post('/purga-borradores', dispararPurgaBorradores);

export default router;
