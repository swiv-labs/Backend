import { LeaderboardModel, LeaderboardEntry } from '../models/Leaderboard';

export class LeaderboardService {
  static async getTopUsers(limit: number = 10): Promise<LeaderboardEntry[]> {
    return await LeaderboardModel.getTopUsers(limit);
  }

  static async getUserStats(userWallet: string): Promise<LeaderboardEntry | null> {
    return await LeaderboardModel.findByWallet(userWallet);
  }

  static calculateWinRate(wins: number, totalPredictions: number): number {
    if (totalPredictions === 0) return 0;
    return (wins / totalPredictions) * 100;
  }
}