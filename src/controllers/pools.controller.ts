import { Request, Response, NextFunction } from 'express';
import { PoolModel } from '../models/Pool';
import { cyphercastClient } from '../services/solana/cyphercastClient';
import { PoolFinalizationService } from '../services/solana/poolFinalization.service';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

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

      return successResponse(res, 'Pool retrieved successfully', pool);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new pool
   */
  static async createPool(req: Request, res: Response, next: NextFunction) {
    try {
      const { assetSymbol, targetPrice, endTime, creator } = req.body;

      // Validate end time is in the future
      if (new Date(endTime) <= new Date()) {
        throw new AppError('End time must be in the future', 400);
      }

      // Create pool in database
      const pool = await PoolModel.create({
        asset_symbol: assetSymbol,
        target_price: targetPrice,
        end_time: endTime,
        creator,
      });

      // Create pool on blockchain
      try {
        await cyphercastClient.createPool({
          assetSymbol,
          targetPrice,
          endTime: new Date(endTime).getTime(),
        });
      } catch (error: any) {
        console.error('Blockchain pool creation failed:', error.message);
        // Continue even if blockchain fails - pool exists in DB
      }

      return successResponse(res, 'Pool created successfully', pool, 201);
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
      const { finalizedBy } = req.body;

      const pool = await PoolModel.findById(id);
      if (!pool) {
        throw new AppError('Pool not found', 404);
      }

      if (pool.status === 'closed') {
        throw new AppError('Pool already closed', 400);
      }

      // Finalize the pool
      await PoolFinalizationService.finalizePool(id);

      const updatedPool = await PoolModel.findById(id);
      return successResponse(res, 'Pool closed successfully', updatedPool);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Finalize pool with oracle
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

      await PoolFinalizationService.finalizePool(id);

      const updatedPool = await PoolModel.findById(id);
      return successResponse(res, 'Pool finalized successfully', updatedPool);
    } catch (error) {
      next(error);
    }
  }
}