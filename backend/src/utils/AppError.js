// backend/src/utils/AppError.js

/**
 * Clase de error personalizada para errores operacionales (esperados).
 * 
 * Uso:
 *   throw new AppError('Mensaje para el cliente', 400);
 *   throw new AppError('Recurso no encontrado', 404, true);
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational; // Errores operacionales vs bugs
    this.timestamp = new Date().toISOString();

    // Captura el stack trace correctamente
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
    };
  }
}

export default AppError;
