import { Request, Response, NextFunction } from 'express';
import { LeaderboardService } from '../services/leaderboard.service';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

export class LeaderboardController {
  /**
   * Get leaderboard
   */
  static async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const leaderboard = await LeaderboardService.getTopUsers(limit);
      
      const enriched = leaderboard.map(entry => ({
        ...entry,
        winRate: LeaderboardService.calculateWinRate(entry.wins, entry.total_predictions),
      }));

      return successResponse(res, 'Leaderboard retrieved successfully', enriched);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user leaderboard stats
   */
  static async getUserStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { walletAddress } = req.params;
      const stats = await LeaderboardService.getUserStats(walletAddress);
      
      if (!stats) {
        throw new AppError('User stats not found', 404);
      }

      const enriched = {
        ...stats,
        winRate: LeaderboardService.calculateWinRate(stats.wins, stats.total_predictions),
      };

      return successResponse(res, 'User stats retrieved successfully', enriched);
    } catch (error) {
      next(error);
    }
  }
}