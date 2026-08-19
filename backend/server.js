/**
 * Entry point de runtime: carga env, aplica migraciones y escucha HTTP.
 * La app Express se define en src/app.js (sin listen).
 */
import './src/config/env.js';

import logger from './src/utils/logger.js';
import { runDbMigrations } from './src/utils/dbMigrations.js';
import { createApp } from './src/app.js';

const app = createApp();
const PORT = process.env.PORT || 3000;

runDbMigrations()
  .then(async () => {
    let publicUrl = process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || '';
    try {
      const { obtenerAjustesCorreo, frontendUrlEfectiva } = await import('./src/models/configApp.js');
      publicUrl = frontendUrlEfectiva(await obtenerAjustesCorreo());
    } catch (_) { /* ignore */ }
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
      if (!publicUrl || /localhost|127\.0\.0\.1/i.test(publicUrl)) {
        console.warn(
          '⚠  La URL pública de correos apunta a localhost. '
          + 'Configúrala en Configuración SMTP → URL pública, o FRONTEND_URL en el .env.'
        );
      } else {
        console.log(`URL pública de correos: ${publicUrl}`);
      }
      import('./src/utils/emailService.js')
        .then((m) => m.iniciarSchedulerReporteDiario())
        .catch((err) => console.warn('[Email] No se inició el reporte diario:', err.message));
    });
  })
  .catch((err) => {
    logger.error('Error aplicando migraciones de BD', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });

export default app;
