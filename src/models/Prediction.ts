import { supabase } from '../config/supabaseClient';

export interface Prediction {
  id: string;
  pool_id: string;
  user_wallet: string;
  predicted_price: number;
  direction: 'up' | 'down';
  amount: number;
  reward?: number;
  status: 'pending' | 'won' | 'lost' | 'claimed';
  created_at: string;
}

export class PredictionModel {
  static async create(predictionData: {
    pool_id: string;
    user_wallet: string;
    predicted_price: number;
    direction: 'up' | 'down';
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
}