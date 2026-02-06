import { supabase } from '../config/supabaseClient';

export type BetStatus = 'initialized' | 'active' | 'calculated' | 'claimed';

export interface UserBet {
  id: string;
  user_wallet: string;
  pool_pubkey: string;
  request_id: string;
  pool_id: number;
  deposit: number;
  prediction: number;
  calculated_weight: string;
  is_weight_added: boolean;
  status: BetStatus;
  creation_ts: number;
  update_count: number;
  end_timestamp: number;
  bet_pubkey: string;
  reward?: number;
  claim_tx?: string;
  claimed_at?: string;
  created_at: string;
  last_synced_at: string;
  pnl?: number;
  roi?: number;
}

export interface UserPredictionStats {
  activePredictions: number;
  totalStaked: number;
  totalRewards: number;
  totalClaimed: number;
}

export class PredictionModel {
  static async create(betData: {
    user_wallet: string;
    pool_pubkey: string;
    request_id: string;
    pool_id: number;
    deposit: number;
    end_timestamp: number;
    bet_pubkey: string;
  }): Promise<UserBet> {
    const { data, error } = await supabase
      .from('predictions')
      .insert([{
        ...betData,
        calculated_weight: '0',
        is_weight_added: false,
        status: 'initialized',
        creation_ts: Math.floor(Date.now() / 1000),
        update_count: 0,
        pnl: 0,
        roi: 0,
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findById(id: string): Promise<UserBet | null> {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  static async findByPubkey(betPubkey: string): Promise<UserBet | null> {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('bet_pubkey', betPubkey)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  static async findByUser(userWallet: string): Promise<UserBet[]> {
    const { data, error } = await supabase
      .from('predictions')
      .select('*, pools(*)')
      .eq('user_wallet', userWallet)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async findByPoolId(poolId: number): Promise<UserBet[]> {
    return this.findByPool(poolId);
  }

  static async findByPool(poolId: number): Promise<UserBet[]> {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('pool_id', poolId);

    if (error) throw error;
    return data || [];
  }

  static async findActiveByUser(userWallet: string): Promise<UserBet[]> {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('user_wallet', userWallet)
      .in('status', ['active', 'calculated'])
      .order('end_timestamp', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async updateBetStatus(id: string, status: BetStatus): Promise<UserBet> {
    return this.updateStatus(id, status);
  }

  static async updateStatus(id: string, status: BetStatus): Promise<UserBet> {
    const { data, error } = await supabase
      .from('predictions')
      .update({ status, last_synced_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateWithCalculation(id: string, {
    calculatedWeight,
    isWeightAdded,
    status,
    pnl,
    roi,
  }: {
    calculatedWeight: string;
    isWeightAdded: boolean;
    status: BetStatus;
    pnl?: number;
    roi?: number;
  }): Promise<UserBet> {
    const payload: any = {
      calculated_weight: calculatedWeight,
      is_weight_added: isWeightAdded,
      status,
      last_synced_at: new Date().toISOString(),
    };

    if (typeof pnl !== 'undefined') payload.pnl = pnl;
    if (typeof roi !== 'undefined') payload.roi = roi;

    const { data, error } = await supabase
      .from('predictions')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async claimReward(id: string, reward: number, claimTx?: string): Promise<UserBet> {
    const payload: any = {
      status: 'claimed',
      claimed: true,
      reward,
      last_synced_at: new Date().toISOString(),
    };

    if (claimTx) {
      payload.claim_tx = claimTx;
      payload.claimed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('predictions')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async syncFromChain(id: string, chainData: any): Promise<UserBet> {
    const payload: any = {
      prediction: chainData.prediction?.toNumber ? chainData.prediction.toNumber() : chainData.prediction,
      calculated_weight: chainData.calculatedWeight?.toString ? chainData.calculatedWeight.toString() : String(chainData.calculatedWeight || '0'),
      is_weight_added: chainData.isWeightAdded,
      status: chainData.status,
      update_count: chainData.updateCount,
      last_synced_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('predictions')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getUserStats(userWallet: string): Promise<UserPredictionStats> {
    const bets = await this.findByUser(userWallet);

    const stats: UserPredictionStats = {
      activePredictions: 0,
      totalStaked: 0,
      totalRewards: 0,
      totalClaimed: 0,
    };

    if (bets.length === 0) {
      return stats;
    }

    bets.forEach((bet) => {
      if (bet.status === 'active' || bet.status === 'calculated') {
        stats.activePredictions++;
      }

      stats.totalStaked += bet.deposit;

      if (bet.status === 'claimed' && bet.reward) {
        stats.totalRewards += bet.reward;
        stats.totalClaimed++;
      }
    });

    return stats;
  }
}