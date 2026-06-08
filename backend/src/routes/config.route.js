import { Router } from 'express';
import { autenticar, esAdmin } from '../middlewares/authMiddleware.js';
import {
  getSmtpConfig,
  updateSmtpConfig,
  testSmtpConnection,
  sendTestEmail,
  resetToEnv
} from '../controllers/configController.js';

const router = Router();

// Todas las rutas de configuración SMTP requieren autenticación + rol admin
router.use(autenticar);
router.use(esAdmin);

// GET /api/config/smtp - obtener configuración actual (o indicar que usa .env)
router.get('/smtp', getSmtpConfig);

// PUT /api/config/smtp - guardar/actualizar configuración
router.put('/smtp', updateSmtpConfig);

// POST /api/config/smtp/test - probar conexión (puede recibir config temporal)
router.post('/smtp/test', testSmtpConnection);

// POST /api/config/smtp/test-email - enviar correo de prueba
router.post('/smtp/test-email', sendTestEmail);

// DELETE /api/config/smtp - desactivar config DB y volver a .env
router.delete('/smtp', resetToEnv);

export default router;
