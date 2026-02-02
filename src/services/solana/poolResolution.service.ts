import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { PoolModel } from '../../models/Pool';
import { PredictionModel } from '../../models/Prediction';

export class PoolResolutionService {
  static async resolvePoolComplete(
    poolId: number,
    finalOutcome: anchor.BN,
    adminKeypair: Keypair,
    l1Connection: Connection,
    program: anchor.Program<any>
  ): Promise<{
    delegatePoolSignature: string;
    resolveSignature: string;
    calculateWeightsSignature: string;
    undelegateBetsSignature: string;
    undelegatePoolSignature: string;
    finalizeSignature: string;
  }> {
    try {
      console.log(`\n🎲 Starting pool resolution for pool ${poolId}...`);

      // Get pool from database
      const poolDb = await PoolModel.findByPoolId(poolId);
      if (!poolDb) throw new Error(`Pool ${poolId} not found in database`);

      console.log(`📍 Pool: ${poolDb.pool_pubkey}`);
      console.log(`📍 Target Outcome: ${finalOutcome.toString()}`);

      // Get all bets for this pool
      const predictions = await PredictionModel.findByPoolId(poolId);
      console.log(`👥 Found ${predictions.length} bets to process`);

      // Update database
      console.log('\n💾 Updating database with resolution details...');
      await this.updateDatabaseAfterResolution(poolDb.id, finalOutcome.toNumber());
      console.log(`✅ Database updated`);

      console.log('\n🏁 Pool Resolution Complete!');

      // Return placeholder signatures - actual signatures come from contractService
      return {
        delegatePoolSignature: 'on-chain',
        resolveSignature: 'on-chain',
        calculateWeightsSignature: 'on-chain',
        undelegateBetsSignature: 'on-chain',
        undelegatePoolSignature: 'on-chain',
        finalizeSignature: 'on-chain',
      };
    } catch (error: any) {
      console.error('❌ Pool resolution failed:', error);
      throw error;
    }
  }

  private static async updateDatabaseAfterResolution(
    poolDbId: string,
    finalOutcome: number
  ): Promise<void> {
    await PoolModel.updateResolution(poolDbId, finalOutcome, 'resolved');

    const pool = await PoolModel.findById(poolDbId);
    if (!pool) return;

    const predictions = await PredictionModel.findByPoolId(pool.pool_id!);
    for (const prediction of predictions) {
      await PredictionModel.updateBetStatus(prediction.id, 'calculated');
    }

    console.log(`📊 Updated ${predictions.length} bet records in database`);
  }
}
