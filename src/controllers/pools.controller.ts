import { Request, Response, NextFunction } from 'express';
import { PoolModel, PoolStatus } from '../models/Pool';
import { contractService } from '../services/solana/contract.service';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';
import { PublicKey } from '@solana/web3.js';
import { env } from '../config/env';
import { PredictionModel } from '../models/Prediction';

const DEFAULT_TOKEN_MINT = new PublicKey(env.TOKEN_MINT!);

export class PoolsController {

  static async getAllPools(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.query;
      const pools = await PoolModel.findAll(status as PoolStatus);
      return successResponse(res, 'Pools retrieved successfully', pools);
    } catch (error) {
      next(error);
    }
  }

  static async getPoolById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const pool = await PoolModel.findById(id);
      
      if (!pool) {
        throw new AppError('Pool not found', 404);
      }

      try {
        const poolId = parseInt(pool.pool_id?.toString() || id);
        const onChainPool = await contractService.getPool(poolId);
        if (onChainPool) {
          pool.total_participants = onChainPool.totalParticipants;
          pool.vault_balance = onChainPool.vaultBalance;
          pool.is_resolved = onChainPool.isResolved;
        }
      } catch (error) {
        console.log('Could not fetch on-chain pool data:', error);
      }

      return successResponse(res, 'Pool retrieved successfully', pool);
    } catch (error) {
      next(error);
    }
  }


  static async createPool(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        metadata,
        startTime,
        endTime,
        maxAccuracyBuffer,
        convictionBonusBps,
        minPrediction,
        maxPrediction,
        creator,
      } = req.body;

      // Validate required fields
      if (!name || !startTime || !endTime) {
        throw new AppError('Missing required fields: name, startTime, endTime', 400);
      }

      if (minPrediction === undefined || maxPrediction === undefined) {
        throw new AppError('Missing required fields: minPrediction, maxPrediction', 400);
      }

      if (minPrediction >= maxPrediction) {
        throw new AppError('minPrediction must be less than maxPrediction', 400);
      }

      const startTimestamp = Math.floor(new Date(startTime).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(endTime).getTime() / 1000);

      if (startTimestamp >= endTimestamp) {
        throw new AppError('Start time must be before end time', 400);
      }
      if (endTimestamp <= Math.floor(Date.now() / 1000)) {
        throw new AppError('End time must be in the future', 400);
      }

      const maxAccuracyBuf = maxAccuracyBuffer || 500; // 5% default
      const convictionBonus = convictionBonusBps || 1000; // 10% default

      console.log(`Creating pool "${name}" on-chain...`);

      let blockchainResult;
      try {
        blockchainResult = await contractService.createPool({
          name,
          tokenMint: DEFAULT_TOKEN_MINT,
          startTime: startTimestamp,
          endTime: endTimestamp,
          maxAccuracyBuffer: maxAccuracyBuf,
          convictionBonusBps: convictionBonus,
          metadata: metadata || undefined,
        });

        console.log('Pool created on-chain:', blockchainResult.signature);
      } catch (blockchainError: any) {
        console.error('Blockchain pool creation failed:', blockchainError);
        throw new AppError(
          `Failed to create pool on blockchain: ${blockchainError.message}`,
          500
        );
      }

      const pool = await PoolModel.create({
        pool_id: blockchainResult.poolId!,
        admin: creator,
        name,
        token_mint: DEFAULT_TOKEN_MINT.toBase58(),
        start_time: startTimestamp,
        end_time: endTimestamp,
        vault_balance: 0,
        max_accuracy_buffer: maxAccuracyBuf,
        conviction_bonus_bps: convictionBonus,
        min_prediction: minPrediction,
        max_prediction: maxPrediction,
        metadata: metadata || null,
        pool_pubkey: blockchainResult.poolPubkey,
        vault_pubkey: blockchainResult.vaultPubkey,
      });

      const enrichedPool = {
        ...pool,
        blockchain_signature: blockchainResult.signature,
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

  static async resolvePool(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { finalOutcome } = req.body;

      if (finalOutcome === undefined) {
        throw new AppError('finalOutcome is required', 400);
      }

      const pool = await PoolModel.findById(id);
      if (!pool) {
        throw new AppError('Pool not found', 404);
      }

      const poolId = pool.pool_id!;

      const endTime = new Date(pool.end_time! * 1000).getTime();
      if (endTime > Date.now()) {
        throw new AppError('Pool end time has not been reached yet', 400);
      }

      if (pool.is_resolved) {
        throw new AppError('Pool already resolved', 400);
      }

      try {
        console.log(`Resolving pool ${poolId} with outcome ${finalOutcome}...`);
        const predictions = await PredictionModel.findByPoolId(poolId);
        const betPubkeys = predictions
          .filter((p) => p.bet_pubkey && p.bet_pubkey.length > 0)
          .map((p) => new PublicKey(p.bet_pubkey!));

        const resolutionResult = await contractService.completePoolResolution({
          poolId,
          finalOutcome,
          betPubkeys,
          tokenMint: new PublicKey(pool.token_mint!),
        });

        console.log('Pool resolved on-chain:', resolutionResult.resolveSignature);

        const updatedPool = await PoolModel.updateResolution(id, finalOutcome, "resolved");

        for (const prediction of predictions) {
          await PredictionModel.updateBetStatus(prediction.id, 'calculated');
        }

        return successResponse(res, 'Pool resolved successfully', {
          ...updatedPool,
          signatures: resolutionResult,
        });
      } catch (error: any) {
        console.error('Failed to resolve pool on-chain:', error);
        throw new AppError(
          `Failed to resolve pool on-chain: ${error.message}`,
          500
        );
      }
    } catch (error) {
      next(error);
    }
  }

  static async finalizePool(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const pool = await PoolModel.findById(id);
      if (!pool) {
        throw new AppError('Pool not found', 404);
      }

      const poolId = pool.pool_id!;

      if (!pool.is_resolved) {
        throw new AppError('Pool must be resolved before finalizing weights', 400);
      }

      if (pool.weight_finalized) {
        throw new AppError('Pool weights already finalized', 400);
      }

      try {
        console.log(`Finalizing weights for pool ${poolId} on-chain...`);
        const finalizeSig = await contractService.finalizeWeights({
          poolId,
          tokenMint: new PublicKey(pool.token_mint!),
        });

        console.log('Finalize tx signature:', finalizeSig);

        // Fetch on-chain pool to persist authoritative state
        const onChainPool = await contractService.getPool(poolId);
        if (!onChainPool) {
          throw new Error('Failed to fetch on-chain pool after finalize');
        }

        const updatedPool = await PoolModel.syncFromChain(id, onChainPool);
        await PoolModel.updateStatus(id, 'settled');

        // Mark finalized explicitly
        await PoolModel.finalizePool(id);

        return successResponse(res, 'Pool weights finalized', {
          signature: finalizeSig,
          pool: updatedPool,
        });
      } catch (error: any) {
        console.error('Failed to finalize pool on-chain:', error);
        throw new AppError(`Failed to finalize pool on-chain: ${error.message}`, 500);
      }
    } catch (error) {
      next(error);
    }
  }
}