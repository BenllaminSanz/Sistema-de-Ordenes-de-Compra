// backend/src/routes/areas.route.js
import { Router } from 'express';
import { autenticar, esContabilidadOAdmin } from '../middlewares/authMiddleware.js';
import {
  getAreas,
  crearArea,
  actualizarArea,
  eliminarArea,
  crearDepartamento,
  actualizarDepartamento,
  eliminarDepartamento,
} from '../controllers/areasController.js';

const router = Router();

// Todas las rutas requieren estar autenticado
router.use(autenticar);

// Lectura: todos los roles
router.get('/', getAreas);

// Escritura: solo admin o contabilidad
router.post('/',                                   esContabilidadOAdmin, crearArea);
router.put('/:id',                                 esContabilidadOAdmin, actualizarArea);
router.delete('/:id',                              esContabilidadOAdmin, eliminarArea);
router.post('/:id/departamentos',                  esContabilidadOAdmin, crearDepartamento);
router.put('/:id/departamentos/:nombre',           esContabilidadOAdmin, actualizarDepartamento);
router.delete('/:id/departamentos/:nombre',        esContabilidadOAdmin, eliminarDepartamento);

export default router;
