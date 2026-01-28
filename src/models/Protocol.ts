import { supabase } from '../config/supabaseClient';

export interface Protocol {
  id: string;
  admin: string;
  treasury_wallet: string;
  protocol_fee_bps: number;
  paused: boolean;
  total_users: number;
  total_pools: number;
  batch_settle_wait_duration: number;
  last_synced_at: string;
  created_at: string;
}

export class ProtocolModel {
  /**
   * Create or update protocol state
   */
  static async upsert(data: Partial<Protocol>): Promise<Protocol> {
    const { data: result, error } = await supabase
      .from('protocol')
      .upsert([{
        id: 'singleton',
        ...data,
        last_synced_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  /**
   * Get current protocol state
   */
  static async getCurrent(): Promise<Protocol | null> {
    const { data, error } = await supabase
      .from('protocol')
      .select('*')
      .eq('id', 'singleton')
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  /**
   * Sync protocol state from on-chain
   */
  static async syncFromChain(chainData: any): Promise<Protocol> {
    return this.upsert({
      admin: chainData.admin.toBase58(),
      treasury_wallet: chainData.treasuryWallet.toBase58(),
      protocol_fee_bps: chainData.protocolFeeBps,
      paused: chainData.paused,
      total_users: chainData.totalUsers.toNumber(),
      total_pools: chainData.totalPools.toNumber(),
      batch_settle_wait_duration: chainData.batchSettleWaitDuration.toNumber(),
    });
  }
}
