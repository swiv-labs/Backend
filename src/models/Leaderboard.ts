import { supabase } from '../config/supabaseClient';

export interface LeaderboardEntry {
  id: string;
  user_wallet: string;
  total_predictions: number;
  wins: number;
  losses: number;
  earnings: number;
}

export class LeaderboardModel {
  static async findOrCreate(userWallet: string): Promise<LeaderboardEntry> {
    let { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('user_wallet', userWallet)
      .single();

    if (error && error.code === 'PGRST116') {
      const { data: newData, error: insertError } = await supabase
        .from('leaderboard')
        .insert([{
          user_wallet: userWallet,
          total_predictions: 0,
          wins: 0,
          losses: 0,
          earnings: 0,
        }])
        .select()
        .single();

      if (insertError) throw insertError;
      return newData;
    }

    if (error) throw error;
    return data;
  }

  static async update(userWallet: string, updates: Partial<LeaderboardEntry>): Promise<LeaderboardEntry> {
    const { data, error } = await supabase
      .from('leaderboard')
      .update(updates)
      .eq('user_wallet', userWallet)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async incrementStats(userWallet: string, won: boolean, reward: number): Promise<void> {
    const entry = await this.findOrCreate(userWallet);
    
    await this.update(userWallet, {
      total_predictions: entry.total_predictions + 1,
      wins: won ? entry.wins + 1 : entry.wins,
      losses: won ? entry.losses : entry.losses + 1,
      earnings: entry.earnings + reward,
    });
  }

  static async getTopUsers(limit: number = 10): Promise<LeaderboardEntry[]> {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('earnings', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  static async findByWallet(userWallet: string): Promise<LeaderboardEntry | null> {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('user_wallet', userWallet)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
}