import { Request, Response, NextFunction } from 'express';
import { contractService as ContractService} from '../services/solana/contract.service';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

export class ProtocolController {

  /**
   * Initialize protocol (one-time admin setup)
   */
  static async initializeProtocol(req: Request, res: Response, next: NextFunction) {
    try {
      const { protocolFeeBps, treasuryWallet } = req.body;

      const signature = await ContractService.initializeProtocol(
        protocolFeeBps || 250,
        treasuryWallet
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
      const state = await ContractService.getProtocol();

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

  /**
   * Transfer protocol admin
   */
  static async transferProtocolAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const { newAdmin } = req.body;
      console.log('Transferring protocol admin to:', newAdmin);

      const signature = await ContractService.transferProtocolAdmin(
        newAdmin
      );

      return successResponse(
        res,
        'Protocol admin transferred successfully',
        { signature, newAdmin },
        201
      );
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Update protocol fee basis points
   */
  static async updateProtocolFeeBps(req: Request, res: Response, next: NextFunction) {
    try {
      const { newFeeBps } = req.body;

      const signature = await ContractService.updateProtocolFeeBps(
        newFeeBps
      );

      return successResponse(
        res,
        'Protocol fee basis points updated successfully',
        { signature, newFeeBps },
        201
      );
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Initialize Arcium computation definitions (one-time setup)
   */
  static async initializeArciumCompDefs(req: Request, res: Response, next: NextFunction) {
    try {
      const results = {
        processBet: null as string | null,
        calculateReward: null as string | null,
        errors: [] as string[],
      };

      // Initialize process_bet comp def
      try {
        const processBetTx = await ContractService.initProcessBetCompDef();
        results.processBet = processBetTx;
      } catch (error: any) {
        console.error('Process bet comp def initialization failed:', error.message);
        results.errors.push(`Process bet: ${error.message}`);
      }

      // Initialize calculate_reward comp def
      try {
        const calculateRewardTx = await ContractService.initCalculateRewardCompDef();
        results.calculateReward = calculateRewardTx;
      } catch (error: any) {
        console.error('Calculate reward comp def initialization failed:', error.message);
        results.errors.push(`Calculate reward: ${error.message}`);
      }

      if (results.errors.length === 2) {
        throw new AppError(
          'Failed to initialize both computation definitions',
          500
        );
      }

      return successResponse(
        res,
        results.errors.length === 0 
          ? 'Arcium computation definitions initialized successfully'
          : 'Arcium computation definitions partially initialized',
        results,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Initialize process_bet computation definition only
   */
  static async initProcessBetCompDef(req: Request, res: Response, next: NextFunction) {
    try {
      const signature = await ContractService.initProcessBetCompDef();

      return successResponse(
        res,
        'Process bet computation definition initialized',
        { signature },
        201
      );
    } catch (error: any) {
      if (error.message.includes('already in use')) {
        throw new AppError('Process bet comp def already initialized', 400);
      }
      next(error);
    }
  }

  /**
   * Initialize calculate_reward computation definition only
   */
  static async initCalculateRewardCompDef(req: Request, res: Response, next: NextFunction) {
    try {
      const signature = await ContractService.initCalculateRewardCompDef();

      return successResponse(
        res,
        'Calculate reward computation definition initialized',
        { signature },
        201
      );
    } catch (error: any) {
      if (error.message.includes('already in use')) {
        throw new AppError('Calculate reward comp def already initialized', 400);
      }
      next(error);
    }
  }
}
