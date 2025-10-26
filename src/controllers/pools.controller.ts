import { Request, Response, NextFunction } from 'express';
import { PoolModel } from '../models/Pool';
import { cyphercastClient } from '../services/solana/cyphercastClient';
import { PoolFinalizationService } from '../services/solana/poolFinalization.service';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';
import { PublicKey } from '@solana/web3.js';
import { env } from '../config/env';

// Default token mint (should be configured in .env)
const DEFAULT_TOKEN_MINT = new PublicKey(
  env.TOKEN_MINT || 'So11111111111111111111111111111111111111112' // SOL mint as default
);

export class PoolsController {
  /**
   * Get all pools
   */
  static async getAllPools(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.query;
      const pools = await PoolModel.findAll(status as string);
      return successResponse(res, 'Pools retrieved successfully', pools);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get pool by ID
   */
  static async getPoolById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const pool = await PoolModel.findById(id);
      
      if (!pool) {
        throw new AppError('Pool not found', 404);
      }

      try {
        const onChainPool = await cyphercastClient.getPool(parseInt(pool.poolid.toString()));
        // console.log('On-chain pool data:', onChainPool);
        if (onChainPool) {
          pool.total_participants = onChainPool.totalParticipants;
          pool.total_pool_amount = onChainPool.totalPoolAmount;
        }
      } catch (error) {
        console.log('Could not fetch on-chain pool data:', error);
      }

      return successResponse(res, 'Pool retrieved successfully', pool);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new pool (creates on-chain and in database)
   */
  static async createPool(req: Request, res: Response, next: NextFunction) {
    try {
      const { assetSymbol, targetPrice, endTime, creator } = req.body;

      // Validate end time is in the future
      const targetTimestamp = new Date(endTime).getTime() / 1000;
      if (targetTimestamp <= Date.now() / 1000) {
        throw new AppError('End time must be in the future', 400);
      }

      // Generate unique pool ID (timestamp-based)
      const poolId = Date.now();

      // Entry fee in lamports (0.1 SOL = 100_000_000 lamports)
      const entryFee = 100_000_000; // 0.1 SOL
      const maxParticipants = 100;

      console.log(`Creating pool ${poolId} on-chain...`);

      // Create pool on blockchain FIRST
      let blockchainResult;
      try {
        blockchainResult = await cyphercastClient.createPool({
          poolId,
          assetSymbol,
          entryFee,
          targetTimestamp: Math.floor(targetTimestamp),
          maxParticipants,
          tokenMint: DEFAULT_TOKEN_MINT,
        });

        console.log('Pool created on-chain:', blockchainResult.signature);
      } catch (blockchainError: any) {
        console.error('Blockchain pool creation failed:', blockchainError);
        throw new AppError(
          `Failed to create pool on blockchain: ${blockchainError.message}`,
          500
        );
      }

      // Create pool in database
      const pool = await PoolModel.create({
        asset_symbol: assetSymbol,
        target_price: targetPrice,
        end_time: endTime,
        creator,
        blockchain_signature: blockchainResult.signature,
        pool_pubkey: blockchainResult.poolPubkey,
        vault_pubkey: blockchainResult.vaultPubkey,
        entry_fee: entryFee,
        max_participants: maxParticipants,
        poolid: poolId,
      });

      // Store blockchain references
      const enrichedPool = {
        ...pool,
        poolId,
        blockchain_signature: blockchainResult.signature,
        pool_pubkey: blockchainResult.poolPubkey,
        vault_pubkey: blockchainResult.vaultPubkey,
        entry_fee: entryFee,
        max_participants: maxParticipants,
      };

      return successResponse(
        res,
        'Pool created successfully on blockchain and database',
        enrichedPool,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Close pool manually
   */
  static async closePool(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const pool = await PoolModel.findById(id);
      if (!pool) {
        throw new AppError('Pool not found', 404);
      }

      if (pool.status === 'closed') {
        throw new AppError('Pool already closed', 400);
      }

      // Close on blockchain
      try {
        const poolId = parseInt(pool.id);
        await cyphercastClient.closePool(poolId);
        console.log(`Pool ${poolId} closed on-chain`);
      } catch (error: any) {
        console.error('Failed to close pool on-chain:', error.message);
      }

      // Update database
      const updatedPool = await PoolModel.update(id, { status: 'closed' });
      
      return successResponse(res, 'Pool closed successfully', updatedPool);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Finalize pool with oracle price
   */
  static async finalizePool(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const pool = await PoolModel.findById(id);
      if (!pool) {
        throw new AppError('Pool not found', 404);
      }

      if (pool.status === 'closed') {
        throw new AppError('Pool already finalized', 400);
      }

      // Check if end time has passed
      if (new Date(pool.end_time) > new Date()) {
        throw new AppError('Pool end time has not been reached yet', 400);
      }

      // Finalize through service (handles oracle + blockchain + db)
      await PoolFinalizationService.finalizePool(id);

      const updatedPool = await PoolModel.findById(id);
      return successResponse(res, 'Pool finalized successfully', updatedPool);
    } catch (error) {
      next(error);
    }
  }
}