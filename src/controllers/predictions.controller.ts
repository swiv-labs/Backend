import { Request, Response, NextFunction } from 'express';
import { PredictionModel } from '../models/Prediction';
import { PoolModel } from '../models/Pool';
import { cyphercastClient } from '../services/solana/cyphercastClient';
import { PublicKey } from '@solana/web3.js';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

export class PredictionsController {
  /**
   * Create a new prediction
   */
  static async createPrediction(req: Request, res: Response, next: NextFunction) {
    try {
      const { poolId, userWallet, predictedPrice, direction, amount } = req.body;

      // Validate pool exists and is active
      const pool = await PoolModel.findById(poolId);
      if (!pool) {
        throw new AppError('Pool not found', 404);
      }

      if (pool.status !== 'active') {
        throw new AppError('Pool is not active', 400);
      }

      if (new Date(pool.end_time) <= new Date()) {
        throw new AppError('Pool has expired', 400);
      }

      // Create prediction in database
      const prediction = await PredictionModel.create({
        pool_id: poolId,
        user_wallet: userWallet,
        predicted_price: predictedPrice,
        direction,
        amount,
      });

      // Place prediction on blockchain
      try {
        await cyphercastClient.placePrediction({
          poolId,
          userWallet: new PublicKey(userWallet),
          predictedPrice,
          direction,
          amount,
        });
      } catch (error: any) {
        console.error('Blockchain prediction failed:', error.message);
      }

      return successResponse(res, 'Prediction placed successfully', prediction, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user predictions
   */
  static async getUserPredictions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userWallet } = req.params;
      const predictions = await PredictionModel.findByUser(userWallet);
      return successResponse(res, 'Predictions retrieved successfully', predictions);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Claim reward
   */
  static async claimReward(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { userWallet } = req.body;

      const prediction = await PredictionModel.findById(id);
      if (!prediction) {
        throw new AppError('Prediction not found', 404);
      }

      if (prediction.user_wallet !== userWallet) {
        throw new AppError('Unauthorized', 403);
      }

      if (prediction.status !== 'won') {
        throw new AppError('Prediction did not win', 400);
      }

      if (prediction.status === 'claimed') {
        throw new AppError('Reward already claimed', 400);
      }

      // Update prediction status
      const updatedPrediction = await PredictionModel.update(id, {
        status: 'claimed',
      });

      return successResponse(res, 'Reward claimed successfully', updatedPrediction);
    } catch (error) {
      next(error);
    }
  }
}