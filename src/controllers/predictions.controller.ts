import { Request, Response, NextFunction } from 'express';
import { PredictionModel } from '../models/Prediction';
import { PoolModel } from '../models/Pool';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';
import { contractService } from '../services/solana/contract.service';
import { PublicKey, Keypair } from '@solana/web3.js';

export class PredictionsController {
  /**
   * Place a bet (create prediction/user bet)
   * Called after frontend has:
   * 1. Initialized bet on-chain (init_bet instruction)
   * 2. Delegated prediction to TEE (place_bet instruction via MagicBlock)
   * 
   * This endpoint saves the metadata to database
   */
  static async placeBet(req: Request, res: Response, next: NextFunction) {
    try {
      const { poolId, userWallet, deposit, prediction, requestId, bet_pubkey } = req.body;

      // Validate required fields (bet_pubkey now optional - can come from on-chain)
      if (!poolId || !userWallet || !deposit) {
        throw new AppError('Missing required fields: poolId, userWallet, deposit', 400);
      }

      // Validate pool exists and is active
      const pool = await PoolModel.findById(poolId);
      if (!pool) {
        throw new AppError('Pool not found', 404);
      }

      const now = Math.floor(Date.now() / 1000);
      if (now < pool.start_time! || now > pool.end_time!) {
        throw new AppError('Pool is not in active period', 400);
      }

      // Create bet in database
      const bet = await PredictionModel.create({
        user_wallet: userWallet,
        pool_pubkey: pool.pool_pubkey!,
        pool_id: pool.pool_id!,
        request_id: requestId,
        deposit,
        // prediction: prediction || 0, // Can be encrypted on TEE side
        end_timestamp: pool.end_time,
        bet_pubkey: bet_pubkey || '', // Can be populated later from on-chain sync
        // status: 'initialized' // Matches BetStatus enum
      });

      return successResponse(res, 'Bet placed successfully', bet, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user bets/predictions
   */
  static async getUserBets(req: Request, res: Response, next: NextFunction) {
    try {
      const { userWallet } = req.params;

      // Get bets
      const predictions = await PredictionModel.findByUser(userWallet);

      // Get stats
      const stats = await PredictionModel.getUserStats(userWallet);

      return successResponse(res, 'User bets retrieved successfully', {
        stats: {
          activeBets: stats.activeBets,
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

  /**
   * Get bets for a specific pool
   */
  static async getPoolBets(req: Request, res: Response, next: NextFunction) {
    try {
      const { poolId } = req.params;

      const bets = await PredictionModel.findByPool(parseInt(poolId));

      return successResponse(res, 'Pool bets retrieved successfully', bets);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Claim reward for a bet
   */
  static async claimReward(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { userWallet, reward } = req.body;

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

      // Update bet with reward and mark as claimed
      const updatedBet = await PredictionModel.claimReward(id, reward || 0);

      return successResponse(res, 'Reward claimed successfully', updatedBet);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update bet prediction (before delegate to TEE)
   */
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

      // Update status to active and store prediction
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