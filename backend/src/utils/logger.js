// backend/src/utils/logger.js

/**
 * Logger simple pero decente para el proyecto.
 * 
 * Niveles soportados:
 * - info
 * - warn
 * - error
 * - debug (solo en desarrollo)
 * 
 * En producción recomienda enviar logs a un servicio (ej. Loki, ELK, Datadog, etc.)
 */

const isProduction = process.env.NODE_ENV === 'production';

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logObject = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...meta,
  };

  if (isProduction) {
    // En producción: JSON (fácil de parsear por herramientas)
    return JSON.stringify(logObject);
  } else {
    // En desarrollo: más legible
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }
}

export const logger = {
  info(message, meta = {}) {
    console.log(formatMessage('info', message, meta));
  },

  warn(message, meta = {}) {
    console.warn(formatMessage('warn', message, meta));
  },

  error(message, meta = {}) {
    console.error(formatMessage('error', message, meta));
  },

  debug(message, meta = {}) {
    if (!isProduction) {
      console.debug(formatMessage('debug', message, meta));
    }
  },

  // Útil para logging de requests
  request(method, url, statusCode, durationMs, meta = {}) {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const msg = `${method} ${url} ${statusCode} - ${durationMs}ms`;

    this[level](msg, { 
      type: 'request', 
      method, 
      url, 
      statusCode, 
      durationMs, 
      ...meta 
    });
  }
};

export default logger;
