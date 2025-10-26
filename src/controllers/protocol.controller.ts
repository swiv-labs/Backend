import { Request, Response, NextFunction } from 'express';
import { cyphercastClient } from '../services/solana/cyphercastClient';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

export class ProtocolController {

  /**
   * Initialize protocol (one-time admin setup)
   */
  static async initializeProtocol(req: Request, res: Response, next: NextFunction) {
    try {
      const { protocolFeeBps } = req.body;

      const signature = await cyphercastClient.initializeProtocol(
        protocolFeeBps || 250
      );

      return successResponse(
        res,
        'Protocol initialized successfully',
        { signature, protocolFeeBps: protocolFeeBps || 250 },
        201
      );
    } catch (error: any) {
      if (error.message.includes('already in use')) {
        throw new AppError('Protocol already initialized', 400);
      }
      next(error);
    }
  }

  /**
   * Get protocol state from blockchain
   */
  static async getProtocolState(req: Request, res: Response, next: NextFunction) {
    try {
      const state = await cyphercastClient.getProtocolState();

      console.log('Protocol state:', state);
      
      if (!state) {
        throw new AppError('Protocol not initialized', 404);
      }

      return successResponse(res, 'Protocol state retrieved', {
        admin: state.admin,
        protocolFeeBps: state.protocolFeeBps,
        totalPoolsCreated: state.totalPoolsCreated.toString(),
      });
    } catch (error) {
      next(error);
    }
  }
}