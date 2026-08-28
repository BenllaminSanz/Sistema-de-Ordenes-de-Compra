import { Router } from 'express';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';
import { validate } from '../validations/validationMiddleware.js';
import { 
  loginSchema, 
  cambiarPasswordSchema, 
  registroSolicitanteSchema,
  actualizarUsuarioSchema,
  restablecerPasswordUsuarioSchema,
} from '../validations/schemas.js';

const router = Router();

import { 
  login, 
  perfil, 
  cambiarPassword, 
  registro, 
  listarUsuarios,
  actualizarUsuario,
  restablecerPasswordUsuario,
  cambiarEstadoUsuario,
  registroSolicitante,
  verificarEmail
} from '../controllers/authController.js';

const gestionarUsuarios = autorizar('compras', 'admin');

// ─── Rutas públicas (sin token) ───────────────────────────────────────────────
router.post('/login', validate(loginSchema), login);

// Registro público para solicitantes (con verificación de correo)
router.post('/registro-solicitante', validate(registroSolicitanteSchema), registroSolicitante);

// Verificación de correo electrónico
router.get('/verificar-email', verificarEmail);

// ─── Rutas autenticadas ───────────────────────────────────────────────────────
router.get('/me',               autenticar, perfil);
router.post('/cambiar-password', autenticar, validate(cambiarPasswordSchema), cambiarPassword);

// ─── Gestión de usuarios (compras / admin) ───────────────────────────────
router.post('/registro',
  autenticar,
  gestionarUsuarios,
  registro
);

router.get('/usuarios',
  autenticar,
  listarUsuarios
);

router.patch('/usuarios/:id',
  autenticar,
  gestionarUsuarios,
  validate(actualizarUsuarioSchema),
  actualizarUsuario
);

router.patch('/usuarios/:id/password',
  autenticar,
  gestionarUsuarios,
  validate(restablecerPasswordUsuarioSchema),
  restablecerPasswordUsuario
);

router.patch('/usuarios/:id/estado',
  autenticar,
  gestionarUsuarios,
  cambiarEstadoUsuario
);

export default router;