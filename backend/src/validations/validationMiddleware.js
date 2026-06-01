// backend/src/validations/validationMiddleware.js
import { ZodError } from 'zod';
import logger from '../utils/logger.js';

/**
 * Middleware de validación genérico usando Zod.
 * @param {import('zod').ZodSchema} schema - Esquema de Zod
 * @param {'body' | 'query' | 'params'} property - Dónde buscar los datos (por defecto 'body')
 */
export const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    try {
      const dataToValidate = req[property];
      const validatedData = schema.parse(dataToValidate);
      
      // Reemplazamos los datos originales con los validados y saneados
      req[property] = validatedData;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues || error.errors || [];
        const formattedErrors = issues.map(err => ({
          campo: err.path.join('.'),
          mensaje: err.message,
        }));

        return res.status(400).json({
          mensaje: 'Error de validación',
          errores: formattedErrors,
        });
      }

      // Error inesperado
      logger.error('Error inesperado en validation middleware', { error: error.message });
      return res.status(500).json({ mensaje: 'Error interno de validación' });
    }
  };
};
