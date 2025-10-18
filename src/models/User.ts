import { supabase } from '../config/supabaseClient';

export interface User {
  id: string;
  wallet_address: string;
  username?: string;
  created_at: string;
}

export class UserModel {
  static async create(walletAddress: string, username?: string): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert([{ wallet_address: walletAddress, username }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findByWallet(walletAddress: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async update(walletAddress: string, updates: Partial<User>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('wallet_address', walletAddress)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}