import cron from 'node-cron';
import { PoolModel } from '../models/Pool';
import { PoolFinalizationService } from '../services/solana/poolFinalization.service';

export const startPoolFinalizationJob = () => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      console.log('Running pool finalization job...');
      
      const expiredPools = await PoolModel.findExpiredPools();
      
      if (expiredPools.length === 0) {
        console.log('No expired pools to finalize');
        return;
      }

      console.log(`Found ${expiredPools.length} expired pool(s)`);

      for (const pool of expiredPools) {
        try {
          await PoolFinalizationService.finalizePool(pool.id);
        } catch (error: any) {
          console.error(`Error finalizing pool ${pool.id}:`, error.message);
        }
      }
    } catch (error: any) {
      console.error('Pool finalization job error:', error.message);
    }
  });

  console.log('Pool finalization job started (runs every minute)');
};