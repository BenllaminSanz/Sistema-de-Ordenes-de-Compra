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
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
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
