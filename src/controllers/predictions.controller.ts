import { Request, Response, NextFunction } from 'express';
import { PredictionModel } from '../models/Prediction';
import { PoolModel } from '../models/Pool';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';
import { ContractService } from '../services/solana/contract.service';

const contractService = new ContractService();

export class PredictionsController {
  static async placeBet(req: Request, res: Response, next: NextFunction) {
    try {
      const { poolId, userWallet, deposit, requestId, bet_pubkey } = req.body;

      if (!poolId || !userWallet || !deposit) {
        throw new AppError('Missing required fields: poolId, userWallet, deposit', 400);
      }

      const pool = await PoolModel.findByPoolId(poolId);
      if (!pool) {
        throw new AppError('Pool not found', 404);
      }

      const now = Math.floor(Date.now() / 1000);
      if (now < pool.start_time! || now > pool.end_time!) {
        throw new AppError('Pool is not in active period', 400);
      }

      try {
        const onChainPoolData = await contractService.getPool(poolId);

        console.log(`[placeBet] On-chain pool data for poolId ${poolId}:`, onChainPoolData);

        await PoolModel.syncFromChain(pool.id!, {
          vaultBalance: onChainPoolData.vaultBalance,
          totalParticipants: onChainPoolData.totalParticipants,
        });

        console.log(`[placeBet] Synced pool ${poolId} - Vault Balance: ${onChainPoolData.vaultBalance}, Participants: ${onChainPoolData.totalParticipants}`);
      } catch (syncError) {
        console.error(`[placeBet] Error syncing pool data from chain:`, syncError);
      }

      const bet = await PredictionModel.create({
        user_wallet: userWallet,
        pool_pubkey: pool.pool_pubkey!,
        pool_id: pool.pool_id!,
        request_id: requestId,
        deposit,
        end_timestamp: pool.end_time,
        bet_pubkey: bet_pubkey || '',
      });

      return successResponse(res, 'Bet placed successfully', bet, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getUserBets(req: Request, res: Response, next: NextFunction) {
    try {
      const { userWallet } = req.params;

      const predictions = await PredictionModel.findByUser(userWallet);

      const stats = await PredictionModel.getUserStats(userWallet);

      return successResponse(res, 'User bets retrieved successfully', {
        stats: {
          activePredictions: stats.activePredictions,
          totalStaked: stats.totalStaked,
          totalRewards: stats.totalRewards,
          totalClaimed: stats.totalClaimed,
        },
        predictions: predictions,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPoolBets(req: Request, res: Response, next: NextFunction) {
    try {
      const { poolId } = req.params;

      const bets = await PredictionModel.findByPool(parseInt(poolId));

      return successResponse(res, 'Pool bets retrieved successfully', bets);
    } catch (error) {
      next(error);
    }
  }

  static async claimReward(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { userWallet, claimTxSignature, rewardAmount } = req.body;

      if (!userWallet || !claimTxSignature) {
        throw new AppError('userWallet and claimTxSignature are required', 400);
      }

      const bet = await PredictionModel.findById(id);
      if (!bet) {
        throw new AppError('Bet not found', 404);
      }

      if (bet.user_wallet !== userWallet) {
        throw new AppError('Unauthorized', 403);
      }

      if (bet.status === 'claimed') {
        throw new AppError('Reward already claimed', 400);
      }

      if (bet.status !== 'calculated') {
        throw new AppError('Bet must be calculated before claiming reward', 400);
      }

      const updatedBet = await PredictionModel.claimReward(
        id,
        rewardAmount || 0,
        claimTxSignature
      );

      return successResponse(res, 'Reward claimed successfully', updatedBet);
    } catch (error) {
      next(error);
    }
  }

  static async updateBetPrediction(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { prediction } = req.body;

      if (prediction === undefined) {
        throw new AppError('Prediction value is required', 400);
      }

      const bet = await PredictionModel.findById(id);
      if (!bet) {
        throw new AppError('Bet not found', 404);
      }

      if (bet.status !== 'initialized') {
        throw new AppError('Can only update prediction for initialized bets', 400);
      }

      const updatedBet = await PredictionModel.updateWithCalculation(id, {
        calculatedWeight: "0",
        isWeightAdded: true,
        status: "active",
      });

      return successResponse(res, 'Bet prediction updated successfully', updatedBet);
    } catch (error) {
      next(error);
    }
  }
}