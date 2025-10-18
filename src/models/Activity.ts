import { supabase } from '../config/supabaseClient';

export interface Activity {
  id: string;
  user_wallet: string;
  type: string;
  description: string;
  metadata?: any;
  created_at: string;
}

export class ActivityModel {
  static async create(activityData: {
    user_wallet: string;
    type: string;
    description: string;
    metadata?: any;
  }): Promise<Activity> {
    const { data, error } = await supabase
      .from('activity')
      .insert([activityData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findByUser(userWallet: string, limit: number = 50): Promise<Activity[]> {
    const { data, error } = await supabase
      .from('activity')
      .select('*')
      .eq('user_wallet', userWallet)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }
}