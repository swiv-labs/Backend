import { supabase } from '../config/supabaseClient';

export interface WaitlistEntry {
  id: string;
  x_username: string;
  email: string;
  created_at: string;
}

export interface CreateWaitlistParams {
  xUsername: string;
  email: string;
}

export class WaitlistModel {
  /**
   * Add a new user to the waitlist
   */
  static async create(params: CreateWaitlistParams): Promise<WaitlistEntry> {
    const { data, error } = await supabase
      .from('waitlist')
      .insert([{
        x_username: params.xUsername,
        email: params.email,
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Find waitlist entry by email
   */
  static async findByEmail(email: string): Promise<WaitlistEntry | null> {
    const { data, error } = await supabase
      .from('waitlist')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Find waitlist entry by X username
   */
  static async findByXUsername(xUsername: string): Promise<WaitlistEntry | null> {
    const { data, error } = await supabase
      .from('waitlist')
      .select('*')
      .eq('x_username', xUsername)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Get all waitlist entries
   */
  static async getAll(limit?: number, offset?: number): Promise<WaitlistEntry[]> {
    let query = supabase
      .from('waitlist')
      .select('*')
      .order('created_at', { ascending: false });

    if (limit) query = query.limit(limit);
    if (offset) query = query.range(offset, offset + (limit || 10) - 1);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get total count of waitlist entries
   */
  static async getCount(): Promise<number> {
    const { count, error } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return count || 0;
  }

  /**
   * Delete waitlist entry by ID
   */
  static async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('waitlist')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
