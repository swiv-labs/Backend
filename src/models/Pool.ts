import { supabase } from '../config/supabaseClient';

export interface Pool {
  id: string;
  asset_symbol: string;
  target_price: number;
  final_price?: number;
  end_time: string;
  status: 'active' | 'closed';
  creator: string;
  blockchain_signature: string;
  pool_pubkey: string;
  vault_pubkey: string;
  entry_fee: number;
  max_participants: number;
  poolid: number;
  total_participants: number;
  total_pool_amount: number;
  created_at: string;
}

export class PoolModel {
  static async create(poolData: {
    asset_symbol: string;
    target_price: number;
    end_time: string;
    creator: string;
    blockchain_signature: string;
    pool_pubkey: string;
    vault_pubkey: string;
    entry_fee: number;
    max_participants: number;
    poolid: number;
  }): Promise<Pool> {
    const { data, error } = await supabase
      .from('pools')
      .insert([{ ...poolData, status: 'active' }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findById(id: string): Promise<Pool | null> {
    const { data, error } = await supabase
      .from('pools')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async findAll(status?: string): Promise<Pool[]> {
    let query = supabase.from('pools').select('*').order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async findExpiredPools(): Promise<Pool[]> {
    const { data, error } = await supabase
      .from('pools')
      .select('*')
      .eq('status', 'active')
      .lt('end_time', new Date().toISOString());

    if (error) throw error;
    return data || [];
  }

  static async update(id: string, updates: Partial<Pool>): Promise<Pool> {
    const { data, error } = await supabase
      .from('pools')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async close(id: string, finalPrice: number): Promise<Pool> {
    return this.update(id, { status: 'closed', final_price: finalPrice });
  }
}