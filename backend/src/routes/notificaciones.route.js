import express from 'express';
import { autenticar } from '../middlewares/authMiddleware.js';
import { bandeja, bandejaOc } from '../controllers/notificacionesController.js';

const router = express.Router();

router.use(autenticar);
router.get('/bandeja', bandeja);
router.get('/bandeja-oc', bandejaOc);

export default router;
