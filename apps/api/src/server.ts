import { buildApp } from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './lib/db';
import { closeQueues } from './lib/queue';
import { redis } from './lib/redis';
import { registerDispatch } from './modules/dispatch/dispatch.listeners';
import { registerFinance } from './modules/finance/finance.listeners';
import { registerNotifications } from './modules/notifications/notifications.listeners';
import { registerPayments } from './modules/payments/payments.listeners';
import { registerPayouts } from './modules/payouts/payouts.listeners';
import { registerWarehousing } from './modules/warehousing/warehousing.listeners';
import { registerWebhooks } from './modules/webhooks/webhooks.listeners';

async function start() {
  await connectDB();

  // Domain event subscribers + queue workers.
  registerDispatch();
  registerNotifications();
  registerFinance();
  registerWebhooks();
  registerPayments();
  registerPayouts();
  registerWarehousing();

  const app = await buildApp();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await closeQueues();
    await disconnectDB();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
