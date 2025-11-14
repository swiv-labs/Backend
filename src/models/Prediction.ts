import { supabase } from '../config/supabaseClient';

export interface Prediction {
  id: string;
  pool_id: string;
  user_wallet: string;
  amount: number;
  reward?: number;
  status: 'pending' | 'resolved' | 'claimed';
  created_at: string;
}

export interface UserPredictionStats {
  activePredictions: number;
  totalStaked: number;
  totalRewards: number;
  avgAccuracy: number;
}

export class PredictionModel {
  static async create(predictionData: {
    pool_id: string;
    user_wallet: string;
    amount: number;
  }): Promise<Prediction> {
    const { data, error } = await supabase
      .from('predictions')
      .insert([{ ...predictionData, status: 'pending' }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findById(id: string): Promise<Prediction | null> {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async findByUser(userWallet: string): Promise<Prediction[]> {
    const { data, error } = await supabase
      .from('predictions')
      .select('*, pools(*)')
      .eq('user_wallet', userWallet)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async findByPool(poolId: string): Promise<Prediction[]> {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('pool_id', poolId);

    if (error) throw error;
    return data || [];
  }

  static async update(id: string, updates: Partial<Prediction>): Promise<Prediction> {
    const { data, error } = await supabase
      .from('predictions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateMany(ids: string[], updates: Partial<Prediction>): Promise<void> {
    const { error } = await supabase
      .from('predictions')
      .update(updates)
      .in('id', ids);

    if (error) throw error;
  }

  /**
   * Get user prediction statistics
   */
  static async getUserStats(userWallet: string): Promise<UserPredictionStats> {
    const predictions = await this.findByUser(userWallet);

    const stats: UserPredictionStats = {
      activePredictions: 0,
      totalStaked: 0,
      totalRewards: 0,
      avgAccuracy: 0,
    };

    if (predictions.length === 0) {
      return stats;
    }

    let totalAccuracy = 0;
    let accuracyCount = 0;

    predictions.forEach((prediction) => {
      // Active predictions (pending)
      if (prediction.status === 'pending') {
        stats.activePredictions++;
      }

      // Total staked
      stats.totalStaked += prediction.amount;

      // Total rewards (won + claimed)
      if (prediction.reward) {
        stats.totalRewards += prediction.reward;
      }

      // Calculate accuracy (only for finalized predictions)
      // Note: Actual accuracy is calculated on-chain based on encrypted predictions
      // This is a simplified version based on win/loss
      // if (prediction.status === 'won' || prediction.status === 'lost' || prediction.status === 'claimed') {
      //   accuracyCount++;
      //   if (prediction.status === 'won' || prediction.status === 'claimed') {
      //     // For simplicity, winners get 100% accuracy in this calculation
      //     // Real accuracy is calculated on-chain
      //     totalAccuracy += 100;
      //   }
      // }
    });

    // Average accuracy
    if (accuracyCount > 0) {
      stats.avgAccuracy = Math.round((totalAccuracy / accuracyCount) * 100) / 100;
    }

    return stats;
  }
}