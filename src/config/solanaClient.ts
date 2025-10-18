import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { env } from './env';
import fs from 'fs';

export const connection = new Connection(env.SOLANA_RPC_URL, 'confirmed');

export const loadKeypair = (): Keypair => {
  const keypairFile = fs.readFileSync(env.AUTHORITY_KEYPAIR_PATH, 'utf-8');
  const keypairData = JSON.parse(keypairFile);
  return Keypair.fromSecretKey(new Uint8Array(keypairData));
};

export const getProvider = (): AnchorProvider => {
  const wallet = new Wallet(loadKeypair());
  return new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
};

export const programId = new PublicKey(env.PROGRAM_ID);