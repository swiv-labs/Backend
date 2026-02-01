import { PoolModel } from '../../models/Pool';

export class PoolFinalizationService {
  static async closePool(poolId: number): Promise<void> {
    try {
      const pool = await PoolModel.findByPoolId(poolId);
      if (!pool) throw new Error('Pool not found');
      if (pool.status === 'closed') throw new Error('Pool already closed');

      console.log(`Finalizing pool ${poolId}...`);

      await PoolModel.updateStatus(pool.id, 'closed');

      console.log(`Pool ${pool.id} closed successfully`);
    } catch (error: any) {
      console.error(`Failed to finalize pool ${poolId}:`, error.message);
      throw error;
    }
  }
}