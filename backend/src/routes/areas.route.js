import { Router } from 'express';
import { autenticar, esComprasOAdmin } from '../middlewares/authMiddleware.js';
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
router.get('/historial', esComprasOAdmin, getHistorial);
router.get('/:id/departamentos/:nombre/uso', esComprasOAdmin, getUsoDepartamento);

router.post('/', esComprasOAdmin, crearArea);
router.put('/:id', esComprasOAdmin, actualizarArea);
router.delete('/:id', esComprasOAdmin, eliminarArea);
router.post('/:id/departamentos', esComprasOAdmin, crearDepartamento);
router.put('/:id/departamentos/:nombre', esComprasOAdmin, actualizarDepartamento);
router.delete('/:id/departamentos/:nombre', esComprasOAdmin, eliminarDepartamento);

export default router;