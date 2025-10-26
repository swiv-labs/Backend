import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SOLANA_RPC_URL: string;
  SOLANA_NETWORK: string;
  PROGRAM_ID: string;
  AUTHORITY_KEYPAIR_PATH: string;
  TOKEN_MINT: string;
  BINANCE_API_KEY: string;
  BINANCE_API_URL: string;
  COINGECKO_API_URL: string;
  CORS_ORIGIN: string;
}

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

export const env: EnvConfig = {
  PORT: parseInt(getEnv('PORT', '5000'), 10),
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  SUPABASE_URL: getEnv('SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY'),
  SOLANA_RPC_URL: getEnv('SOLANA_RPC_URL'),
  SOLANA_NETWORK: getEnv('SOLANA_NETWORK', 'devnet'),
  PROGRAM_ID: getEnv('PROGRAM_ID'),
  AUTHORITY_KEYPAIR_PATH: getEnv('AUTHORITY_KEYPAIR_PATH'),
  TOKEN_MINT: getEnv('TOKEN_MINT', 'So11111111111111111111111111111111111111112'),
  BINANCE_API_KEY: getEnv('BINANCE_API_KEY', ''),
  BINANCE_API_URL: getEnv('BINANCE_API_URL', 'https://api.binance.com/api/v3'),
  COINGECKO_API_URL: getEnv('COINGECKO_API_URL', 'https://api.coingecko.com/api/v3'),
  CORS_ORIGIN: getEnv('CORS_ORIGIN', 'http://localhost:3000'),
};