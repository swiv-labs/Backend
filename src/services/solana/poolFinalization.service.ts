import { PoolModel } from '../../models/Pool';
import { PredictionModel } from '../../models/Prediction';
import { LeaderboardModel } from '../../models/Leaderboard';
import { OracleService } from '../oracle.service';
import { cyphercastClient } from './cyphercastClient';

export class PoolFinalizationService {
  /**
   * Finalize a single pool
   */
  static async finalizePool(poolId: string): Promise<void> {
    try {
      const pool = await PoolModel.findById(poolId);
      if (!pool) throw new Error('Pool not found');
      if (pool.status === 'closed') throw new Error('Pool already closed');

      console.log(`Finalizing pool ${poolId}...`);

      // 1. Fetch final price from oracle
      const finalPrice = await OracleService.getCurrentPrice(pool.asset_symbol);
      console.log(`Final price for ${pool.asset_symbol}: $${finalPrice}`);

      // 2. Call Solana contract to finalize
      await cyphercastClient.finalizePool({
        poolId: pool.id,
        finalPrice,
      });

      // 3. Update pool status
      await PoolModel.close(poolId, finalPrice);

      // 4. Calculate winners and update predictions
      await this.settlePredictions(poolId, finalPrice, pool.target_price);

      console.log(`Pool ${poolId} finalized successfully`);
    } catch (error: any) {
      console.error(`Failed to finalize pool ${poolId}:`, error.message);
      throw error;
    }
  }

  /**
   * Settle all predictions for a pool
   */
  private static async settlePredictions(
    poolId: string,
    finalPrice: number,
    targetPrice: number
  ): Promise<void> {
    const predictions = await PredictionModel.findByPool(poolId);
    
    for (const prediction of predictions) {
      const isWinner = this.checkWinner(
        prediction.direction,
        prediction.predicted_price,
        finalPrice,
        targetPrice
      );

      const reward = isWinner ? prediction.amount * 1.8 : 0; // 80% profit for winners
      const status = isWinner ? 'won' : 'lost';

      await PredictionModel.update(prediction.id, { reward, status });
      await LeaderboardModel.incrementStats(prediction.user_wallet, isWinner, reward);
    }
  }

  /**
   * Determine if prediction is a winner
   */
  private static checkWinner(
    direction: 'up' | 'down',
    predictedPrice: number,
    finalPrice: number,
    targetPrice: number
  ): boolean {
    if (direction === 'up') {
      return finalPrice >= targetPrice;
    } else {
      return finalPrice < targetPrice;
    }
  }
}