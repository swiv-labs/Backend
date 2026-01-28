import { supabase } from '../config/supabaseClient';

export type PoolStatus = 'active' | 'resolved' | 'settled' | 'closed';

export interface Pool {
  id: string;
  pool_id: number;
  admin: string;
  name: string;
  token_mint: string;
  start_time: number;
  end_time: number;
  vault_balance: number;
  max_accuracy_buffer: number;
  conviction_bonus_bps: number;
  metadata?: string;
  resolution_target: number;
  is_resolved: boolean;
  resolution_ts: number;
  total_weight: string;
  weight_finalized: boolean;
  total_participants: number;
  pool_pubkey: string;
  vault_pubkey: string;
  status: PoolStatus;
  created_at: string;
  last_synced_at: string;
}

export class PoolModel {
  /**
   * Create a new pool
   */
  static async create(poolData: {
    pool_id: number;
    admin: string;
    name: string;
    token_mint: string;
    start_time: number;
    end_time: number;
    vault_balance: number;
    max_accuracy_buffer: number;
    conviction_bonus_bps: number;
    metadata?: string;
    pool_pubkey: string;
    vault_pubkey: string;
  }): Promise<Pool> {
    const { data, error } = await supabase
      .from('pools')
      .insert([{
        ...poolData,
        vault_balance: 0,
        resolution_target: 0,
        is_resolved: false,
        resolution_ts: 0,
        total_weight: '0',
        weight_finalized: false,
        total_participants: 0,
        status: 'active',
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Find pool by ID
   */
  static async findById(id: string): Promise<Pool | null> {
    const { data, error } = await supabase
      .from('pools')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  /**
   * Find pool by pool_id
   */
  static async findByPoolId(poolId: number): Promise<Pool | null> {
    const { data, error } = await supabase
      .from('pools')
      .select('*')
      .eq('pool_id', poolId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  /**
   * Get all pools with optional status filter
   */
  static async findAll(status?: PoolStatus): Promise<Pool[]> {
    let query = supabase.from('pools').select('*');
    
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get active pools
   */
  static async findActive(): Promise<Pool[]> {
    const { data, error } = await supabase
      .from('pools')
      .select('*')
      .in('status', ['active', 'resolved'])
      .order('end_time', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Update pool status
   */
  static async updateStatus(id: string, status: PoolStatus): Promise<Pool> {
    const { data, error } = await supabase
      .from('pools')
      .update({ status, last_synced_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Sync pool state from on-chain
   */
  static async syncFromChain(id: string, chainData: any): Promise<Pool> {
    const { data, error } = await supabase
      .from('pools')
      .update({
        vault_balance: chainData.vaultBalance.toNumber(),
        is_resolved: chainData.isResolved,
        resolution_ts: chainData.resolutionTs.toNumber(),
        total_weight: chainData.totalWeight.toString(),
        weight_finalized: chainData.weightFinalized,
        total_participants: chainData.totalParticipants.toNumber(),
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update resolution details
   */
  static async updateResolution(
    id: string, 
    target: number,
    status: PoolStatus
  ): Promise<Pool> {
    const { data, error } = await supabase
      .from('pools')
      .update({
        resolution_target: target,
        is_resolved: true,
        status,
        resolution_ts: Math.floor(Date.now() / 1000),
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}