import { Router } from 'express';
import { autenticar, esContabilidadOAdmin } from '../middlewares/authMiddleware.js';
import {
  getAreas,
  getHistorial,
  getUsoDepartamento,
  crearArea,
  actualizarArea,
  eliminarArea,
  crearDepartamento,
  actualizarDepartamento,
  eliminarDepartamento,
} from '../controllers/areasController.js';

const router = Router();

router.use(autenticar);

router.get('/', getAreas);
router.get('/historial', esContabilidadOAdmin, getHistorial);
router.get('/:id/departamentos/:nombre/uso', esContabilidadOAdmin, getUsoDepartamento);

router.post('/', esContabilidadOAdmin, crearArea);
router.put('/:id', esContabilidadOAdmin, actualizarArea);
router.delete('/:id', esContabilidadOAdmin, eliminarArea);
router.post('/:id/departamentos', esContabilidadOAdmin, crearDepartamento);
router.put('/:id/departamentos/:nombre', esContabilidadOAdmin, actualizarDepartamento);
router.delete('/:id/departamentos/:nombre', esContabilidadOAdmin, eliminarDepartamento);

export default router;