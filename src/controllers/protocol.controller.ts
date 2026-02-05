import { Request, Response, NextFunction } from 'express';
import { contractService as ContractService } from '../services/solana/contract.service';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

export class ProtocolController {
  static async initializeProtocol(req: Request, res: Response, next: NextFunction) {
    try {
      const { protocolFeeBps, treasuryWallet } = req.body;

      const signature = await ContractService.initializeProtocol(
        { protocolFeeBps, treasuryWallet }
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

  static async getProtocolState(req: Request, res: Response, next: NextFunction) {
    try {
      const state = await ContractService.getProtocol();

      console.log('Protocol state:', state);

      if (!state) {
        throw new AppError('Protocol not initialized', 404);
      }

      return successResponse(res, 'Protocol state retrieved', {
        admin: state.admin,
        treasuryWallet: state.treasuryWallet,
        paused: state.paused,
        batchSettleWaitDuration: state.batchSettleWaitDuration,
        protocolFeeBps: state.protocolFeeBps,
        totalPoolsCreated: state.totalPools,
        totalUsers: state.totalUsers,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateProtocolFeeBps(req: Request, res: Response, next: NextFunction) {
    try {
      const { newTreasuryWallet, newProtocolFeeBps } = req.body;

      const signature = await ContractService.updateProtocol(
        { newProtocolFeeBps: newProtocolFeeBps, newTreasuryWallet: newTreasuryWallet }
      );

      return successResponse(
        res,
        'Protocol updated successfully',
        { signature, newProtocolFeeBps, newTreasuryWallet },
        201
      );
    } catch (error: any) {
      next(error);
    }
  }
}
