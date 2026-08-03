import express from 'express';
import { autenticar } from '../middlewares/authMiddleware.js';
import { bandeja } from '../controllers/notificacionesController.js';

const router = express.Router();

router.use(autenticar);
router.get('/bandeja', bandeja);

export default router;
