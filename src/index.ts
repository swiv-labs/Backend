import app from './app';
import { env } from './config/env';
import { startPoolFinalizationJob } from './jobs/finalizePools.job';

const startServer = () => {
  try {
    // Start cron jobs
    startPoolFinalizationJob();

    // Start server
    app.listen(env.PORT, () => {
      console.log('========================================');
      console.log('Swiv Backend Server Started');
      console.log('========================================');
      console.log(`Environment: ${env.NODE_ENV}`);
      console.log(`Port: ${env.PORT}`);
      console.log(`Solana Network: ${env.SOLANA_NETWORK}`);
      console.log(`API URL: http://localhost:${env.PORT}`);
      console.log('========================================');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();