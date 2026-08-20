import http from 'http';
import { getDatabase, closeDatabase } from './database/db.js';
import { createBot } from './bot/bot.js';
import { schedulerService } from './scheduler/scheduler.service.js';
import { CONFIG } from './config.js';
import { logger } from './utils/logger.js';

async function main() {
  console.log(`
=====================================================
🏠 BOT DE BÚSQUEDA Y SEGUIMIENTO DE VIVIENDAS
📍 Granollers | Cardedeu | La Roca | Les Franqueses
=====================================================
  `);

  // 1. Initialize SQLite Database
  getDatabase();

  // 2. Check Bot Token
  if (!CONFIG.TELEGRAM_BOT_TOKEN || CONFIG.TELEGRAM_BOT_TOKEN === 'dummy_token') {
    logger.warn(
      '⚠️ TELEGRAM_BOT_TOKEN no está configurado en el archivo .env. Por favor, añade tu Token de Telegram en .env para conectar el bot.'
    );
    logger.info('Puedes obtener tu token gratis hablando con @BotFather en Telegram.');
  }

  // 3. Create Bot instance
  const bot = createBot();

  // 4. Start Scheduler
  schedulerService.start(bot);

  // 5. Start Telegram Bot polling if token is provided
  if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_BOT_TOKEN !== 'dummy_token') {
    logger.info('Iniciando Telegram Bot con Long-Polling...');

    // Set bot commands in Telegram
    try {
      await bot.api.setMyCommands([
        { command: 'start', description: 'Menú principal interactivo' },
        { command: 'crear_rutina', description: 'Crear nueva alerta de búsqueda' },
        { command: 'rutinas', description: 'Gestionar mis rutinas' },
        { command: 'seguimientos', description: 'Ver inmuebles en seguimiento' },
        { command: 'buscar_ahora', description: 'Rastreo manual inmediato' },
        { command: 'help', description: 'Ayuda y guía de uso' },
      ]);
      logger.info('Comandos de Telegram registrados en el cliente.');
    } catch (e: any) {
      logger.warn({ error: e.message }, 'No se pudieron registrar los comandos en Telegram');
    }

    bot.start({
      onStart: botInfo => {
        logger.info({ username: botInfo.username, id: botInfo.id }, '🤖 ¡Bot de Telegram activo y escuchando!');
        console.log(`\n✅ Bot conectado como @${botInfo.username}`);
        console.log(`Abre Telegram y escribe /start para comenzar a configurar tus búsquedas.\n`);
      },
    });
  }

  // 6. HTTP Health Check Server (Render / Cloud deployment compatibility)
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/' || req.url === '') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'bot-busqueda-vivienda',
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn({ port }, `Port ${port} is busy, HTTP health check disabled locally.`);
    } else {
      logger.error({ err }, 'HTTP server error');
    }
  });

  server.listen(port, () => {
    logger.info({ port }, `Health check HTTP server listening on port ${port}`);
  });

  // Graceful shutdown handlers
  const shutdown = () => {
    logger.info('Apagando bot de forma segura...');
    server.close();
    schedulerService.stop();
    bot.stop();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  logger.error(err, 'Error fatal en la aplicación');
  process.exit(1);
});
