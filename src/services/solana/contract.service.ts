import { Program, AnchorProvider, BN, web3, Wallet } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair, ComputeBudgetProgram, Connection } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import { getProvider, programId, loadKeypair } from '../../config/solanaClient';
import * as nacl from 'tweetnacl';

// SwivPrivacy IDL
import type { SwivPrivacy } from './idl/swiv_privacy';
import IDL from './idl/swiv_privacy.json';

// MagicBlock TEE Configuration
const TEE_URL = process.env.MAGICBLOCK_TEE_URL || "https://tee.magicblock.app";
const TEE_WS_URL = process.env.MAGICBLOCK_TEE_WS_URL || "wss://tee.magicblock.app";

// Seed constants - MUST match contract constants.rs
const SEED_PROTOCOL = Buffer.from('global_config_v1'); // Seed bytes unchanged for backward compatibility
const SEED_POOL = Buffer.from('pool');
const SEED_BET = Buffer.from('bet');
const SEED_POOL_VAULT = Buffer.from('pool_vault');

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Auth token helper with retry logic
async function getAuthTokenWithRetry(
  endpoint: string,
  pubkey: PublicKey,
  signer: (msg: Uint8Array) => Promise<Uint8Array>,
  retries = 3,
): Promise<{ token: string }> {
  for (let i = 0; i < retries; i++) {
    try {
      const message = new TextEncoder().encode(`auth:${pubkey.toBase58()}:${Date.now()}`);
      const signature = await signer(message);
      
      const response = await fetch(`${endpoint}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: pubkey.toBase58(),
          signature: Buffer.from(signature).toString('base64'),
        }),
      });
      
      if (!response.ok) throw new Error('Auth failed');
      const data = (await response.json()) as { token: string };
      return { token: data.token };
    } catch (e: any) {
      if (i === retries - 1) throw e;
      console.log(`Auth failed ("${e.message}"). Retrying (${i + 1}/${retries})...`);
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error("Unreachable");
}


export class ContractService {
  private program: Program<SwivPrivacy>;
  private provider: AnchorProvider;
  private authority: web3.Keypair;
  private teeEndpoint: string;
  private teeWsEndpoint: string;

  constructor() {
    this.provider = getProvider();
    this.program = new Program(IDL as SwivPrivacy, this.provider);
    this.authority = loadKeypair();
    this.teeEndpoint = TEE_URL;
    this.teeWsEndpoint = TEE_WS_URL;
  }

  /**
   * Get protocol PDA (replaces globalConfig)
   * Seeds: [SEED_PROTOCOL]
   */
  private getProtocolPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PROTOCOL],
      this.program.programId
    );
  }

  /**
   * Derive pool PDA using admin and pool_id
   * Seeds: [SEED_POOL, admin, pool_id as LE u64]
   */
  private getPoolPDA(admin: PublicKey, poolId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        SEED_POOL,
        admin.toBuffer(),
        new BN(poolId).toBuffer('le', 8),
      ],
      this.program.programId
    );
  }

  /**
   * Derive pool vault PDA
   * Seeds: [SEED_POOL_VAULT, pool]
   */
  private getPoolVaultPDA(poolPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_POOL_VAULT, poolPubkey.toBuffer()],
      this.program.programId
    );
  }

  /**
   * Derive bet PDA
   * Seeds: [SEED_BET, pool, user, bump]
   */
  private getBetPDA(
    poolPubkey: PublicKey, 
    userPubkey: PublicKey,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        SEED_BET,
        poolPubkey.toBuffer(),
        userPubkey.toBuffer(),
      ],
      this.program.programId
    );
  }

  /**
   * Initialize the protocol (one-time setup)
   */
  async initializeProtocol(params: {
    protocolFeeBps?: number;
    treasuryWallet?: PublicKey;
  } = {}): Promise<string> {
    try {
      const protocolFeeBps = params.protocolFeeBps || 300;
      
      const [protocol] = this.getProtocolPDA();

      const tx = await this.program.methods
        .initializeProtocol(new BN(protocolFeeBps))
        .accountsPartial({
          admin: this.authority.publicKey,
          protocol,
          treasuryWallet: params.treasuryWallet,
          systemProgram: SystemProgram.programId,
        })
        .signers([this.authority])
        .rpc();

      console.log('Protocol initialized:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to initialize protocol:', error);
      throw error;
    }
  }

  /**
   * Update protocol configuration
   */
  async updateProtocol(params: {
    newTreasuryWallet?: PublicKey;
    newProtocolFeeBps?: number;
  }): Promise<string> {
    try {
      const [protocol] = this.getProtocolPDA();

      const tx = await this.program.methods
        .updateConfig(
          params.newTreasuryWallet || null,
          params.newProtocolFeeBps ? new BN(params.newProtocolFeeBps) : null,
        )
        .accountsPartial({
          admin: this.authority.publicKey,
          protocol,
        })
        .signers([this.authority])
        .rpc();

      console.log('Protocol updated:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to update protocol:', error);
      throw error;
    }
  }

  /**
   * Create a new prediction pool
   * Contract auto-increments pool_id from protocol.total_pools
   */
  async createPool(params: {
    name: string;
    tokenMint: PublicKey;
    startTime: number;
    endTime: number;
    maxAccuracyBuffer: number;
    convictionBonusBps: number;
    metadata?: string;
  }): Promise<{ 
    signature: string;
    poolId?: number; 
    poolPubkey: string; 
    vaultPubkey: string;
  }> {
    try {
      // Fetch current protocol to get next pool_id
      const [protocol] = this.getProtocolPDA();
      const protocolData = await this.program.account.protocol.fetch(protocol);
      const poolId = protocolData.totalPools.toNumber();

      // Derive pool PDA using admin and pool_id
      const [pool] = this.getPoolPDA(this.authority.publicKey, poolId);
      const [poolVault] = this.getPoolVaultPDA(pool);

      // Get admin's token account
      const adminAta = await getOrCreateAssociatedTokenAccount(
        this.provider.connection,
        this.authority,
        params.tokenMint,
        this.authority.publicKey,
      );

      const tx = await this.program.methods
        .createPool(
          new BN(poolId),
          params.name,
          params.metadata || null,
          new BN(params.startTime),
          new BN(params.endTime),
          new BN(params.maxAccuracyBuffer),
          new BN(params.convictionBonusBps),
        )
        .accountsPartial({
          protocol,
          pool,
          poolVault,
          tokenMint: params.tokenMint,
          admin: this.authority.publicKey,
          adminTokenAccount: adminAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([this.authority])
        .rpc();

      console.log('Pool created:', tx);

      return {
        signature: tx,
        poolId,
        poolPubkey: pool.toBase58(),
        vaultPubkey: poolVault.toBase58(),
      };
    } catch (error: any) {
      console.error('Failed to create pool:', error);
      throw error;
    }
  }

  /**
   * Initialize a bet (L1 step)
   * User deposits tokens and initializes bet account
   */
  async initBet(params: {
    poolId: number;
    userKeypair: Keypair;
    betAmount: number;
    requestId: string;
    userTokenAccount: PublicKey;
  }): Promise<{ signature: string; betPubkey: string }> {
    try {
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);
      const [poolVault] = this.getPoolVaultPDA(pool);
      const [bet] = this.getBetPDA(pool, params.userKeypair.publicKey);
      const [protocol] = this.getProtocolPDA();

      const tx = await this.program.methods
        .initBet(new BN(params.betAmount), params.requestId)
        .accountsPartial({
          user: params.userKeypair.publicKey,
          protocol,
          pool,
          poolVault,
          userTokenAccount: params.userTokenAccount,
          userBet: bet,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([params.userKeypair])
        .rpc();

      console.log('Bet initialized:', tx);
      return { signature: tx, betPubkey: bet.toBase58() };
    } catch (error: any) {
      console.error('Failed to initialize bet:', error);
      throw error;
    }
  }

  /**
   * Delegate bet to TEE for private prediction placement
   */
  async delegateBet(params: {
    poolId: number;
    userKeypair: Keypair;
    requestId: string;
  }): Promise<string> {
    try {
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);
      const [bet] = this.getBetPDA(pool, params.userKeypair.publicKey);

      const tx = await this.program.methods
        .delegateBet(params.requestId)
        .accountsPartial({
          user: params.userKeypair.publicKey,
          pool,
          userBet: bet,
        })
        .signers([params.userKeypair])
        .rpc();

      console.log('Bet delegated to TEE:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to delegate bet:', error);
      throw error;
    }
  }

  /**
   * Place bet on TEE (private execution)
   * Sends prediction to TEE for encrypted storage
   */
  async placeBetOnTEE(params: {
    poolId: number;
    userKeypair: Keypair;
    prediction: number; // Encrypted prediction value
    requestId: string;
  }): Promise<string> {
    try {
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);
      const [bet] = this.getBetPDA(pool, params.userKeypair.publicKey);

      // Get auth token for TEE
      let tokenString = "";
      try {
        const authToken = await getAuthTokenWithRetry(
          this.teeEndpoint,
          params.userKeypair.publicKey,
          async (message) => nacl.sign.detached(message, params.userKeypair.secretKey),
        );
        tokenString = `?token=${authToken.token}`;
        console.log('TEE auth token generated');
      } catch (e) {
        console.warn('TEE auth failed, using anonymous mode');
      }

      // Connect to TEE
      const teeConnection = new Connection(
        `${this.teeEndpoint}${tokenString}`,
        { 
          commitment: 'confirmed', 
          wsEndpoint: this.teeWsEndpoint 
        }
      );

      const teeProvider = new AnchorProvider(
        teeConnection,
        new Wallet(params.userKeypair),
        AnchorProvider.defaultOptions(),
      );
      const teeProgram = new Program(this.program.idl, teeProvider);

      // Place bet on TEE
      const tx = await teeProgram.methods
        .placeBet(new BN(params.prediction), params.requestId)
        .accountsPartial({
          user: params.userKeypair.publicKey,
          pool,
          userBet: bet,
        })
        .signers([params.userKeypair])
        .rpc({ skipPreflight: true });

      console.log('Bet placed on TEE:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to place bet on TEE:', error);
      throw error;
    }
  }

  /**
   * Delegate pool to TEE for resolution
   */
  async delegatePool(params: {
    poolId: number;
  }): Promise<string> {
    try {
      const [protocol] = this.getProtocolPDA();
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);

      const tx = await this.program.methods
        .delegatePool(new BN(params.poolId))
        .accountsPartial({
          admin: this.authority.publicKey,
          protocol,
          pool,
        })
        .signers([this.authority])
        .rpc();

      console.log('Pool delegated to TEE:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to delegate pool:', error);
      throw error;
    }
  }

  /**
   * Resolve pool with actual price (on TEE)
   */
  async resolvePool(params: {
    poolId: number;
    finalOutcome: number;
  }): Promise<string> {
    try {
      const [protocol] = this.getProtocolPDA();
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);

      // Connect to TEE
      const teeConnection = new Connection(
        this.teeEndpoint,
        { 
          commitment: 'confirmed', 
          wsEndpoint: this.teeWsEndpoint 
        }
      );

      const teeProvider = new AnchorProvider(
        teeConnection,
        new Wallet(this.authority),
        AnchorProvider.defaultOptions(),
      );
      const teeProgram = new Program(this.program.idl, teeProvider);

      const tx = await teeProgram.methods
        .resolvePool(new BN(params.finalOutcome))
        .accountsPartial({
          admin: this.authority.publicKey,
          protocol,
          pool,
        })
        .signers([this.authority])
        .rpc();

      console.log('Pool resolved on TEE:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to resolve pool:', error);
      throw error;
    }
  }

  /**
   * Batch calculate weights (on TEE)
   * Decrypts all predictions and calculates weights based on accuracy
   */
  async batchCalculateWeights(params: {
    poolId: number;
    betPubkeys: PublicKey[];
  }): Promise<string> {
    try {
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);

      // Connect to TEE
      const teeConnection = new Connection(
        this.teeEndpoint,
        { 
          commitment: 'confirmed', 
          wsEndpoint: this.teeWsEndpoint 
        }
      );

      const teeProvider = new AnchorProvider(
        teeConnection,
        new Wallet(this.authority),
        AnchorProvider.defaultOptions(),
      );
      const teeProgram = new Program(this.program.idl, teeProvider);

      const batchAccounts = params.betPubkeys.map((k) => ({
        pubkey: k,
        isWritable: true,
        isSigner: false,
      }));

      const tx = await teeProgram.methods
        .batchCalculateWeights()
        .accountsPartial({ 
          admin: this.authority.publicKey, 
          pool 
        })
        .remainingAccounts(batchAccounts)
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        ])
        .signers([this.authority])
        .rpc();

      console.log('Weights calculated on TEE:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to calculate weights:', error);
      throw error;
    }
  }

  /**
   * Batch undelegate bets (return to L1)
   */
  async batchUndelegateBets(params: {
    poolId: number;
    betPubkeys: PublicKey[];
  }): Promise<string> {
    try {
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);

      const teeConnection = new Connection(
        this.teeEndpoint,
        { 
          commitment: 'confirmed', 
          wsEndpoint: this.teeWsEndpoint 
        }
      );

      const teeProvider = new AnchorProvider(
        teeConnection,
        new Wallet(this.authority),
        AnchorProvider.defaultOptions(),
      );
      const teeProgram = new Program(this.program.idl, teeProvider);

      const batchAccounts = params.betPubkeys.map((k) => ({
        pubkey: k,
        isWritable: true,
        isSigner: false,
      }));

      const tx = await teeProgram.methods
        .batchUndelegateBets()
        .accounts({ 
          payer: this.authority.publicKey, 
          pool 
        })
        .remainingAccounts(batchAccounts)
        .signers([this.authority])
        .rpc();

      console.log('Bets undelegated:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to undelegate bets:', error);
      throw error;
    }
  }

  /**
   * Undelegate pool (return to L1)
   */
  async undelegatePool(params: {
    poolId: number;
  }): Promise<string> {
    try {
      const [protocol] = this.getProtocolPDA();
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);

      const teeConnection = new Connection(
        this.teeEndpoint,
        { 
          commitment: 'confirmed', 
          wsEndpoint: this.teeWsEndpoint 
        }
      );

      const teeProvider = new AnchorProvider(
        teeConnection,
        new Wallet(this.authority),
        AnchorProvider.defaultOptions(),
      );
      const teeProgram = new Program(this.program.idl, teeProvider);

      const tx = await teeProgram.methods
        .undelegatePool()
        .accounts({
          admin: this.authority.publicKey,
          protocol,
          pool,
        })
        .signers([this.authority])
        .rpc();

      console.log('Pool undelegated:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to undelegate pool:', error);
      throw error;
    }
  }

  /**
   * Finalize weights and distribute fees (on L1)
   * Called after all bets are undelegated
   */
  async finalizeWeights(params: {
    poolId: number;
    tokenMint: PublicKey;
  }): Promise<string> {
    try {
      const [protocol] = this.getProtocolPDA();
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);
      const [poolVault] = this.getPoolVaultPDA(pool);

      // Get protocol to retrieve treasury wallet
      const protocolData = await this.program.account.protocol.fetch(protocol);
      
      // Get treasury token account
      const treasuryAta = await getOrCreateAssociatedTokenAccount(
        this.provider.connection,
        this.authority,
        params.tokenMint,
        protocolData.treasuryWallet,
        true,
      );

      const tx = await this.program.methods
        .finalizeWeights()
        .accountsPartial({
          admin: this.authority.publicKey,
          protocol,
          pool,
          poolVault,
          treasuryTokenAccount: treasuryAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([this.authority])
        .rpc();

      console.log('Weights finalized:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to finalize weights:', error);
      throw error;
    }
  }

  /**
   * Claim reward for a user
   */
  async claimReward(params: {
    poolId: number;
    userKeypair: Keypair;
    userTokenAccount: PublicKey;
  }): Promise<string> {
    try {
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);
      const [poolVault] = this.getPoolVaultPDA(pool);
      const [bet] = this.getBetPDA(pool, params.userKeypair.publicKey);

      const tx = await this.program.methods
        .claimReward()
        .accountsPartial({
          user: params.userKeypair.publicKey,
          pool,
          poolVault,
          userBet: bet,
          userTokenAccount: params.userTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([params.userKeypair])
        .rpc();

      console.log('Reward claimed:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to claim reward:', error);
      throw error;
    }
  }

  /**
   * Fetch protocol state
   */
  async getProtocol(): Promise<any> {
    try {
      const [protocol] = this.getProtocolPDA();
      const protocolData = await this.program.account.protocol.fetch(protocol);

      return {
        admin: protocolData.admin.toBase58(),
        treasuryWallet: protocolData.treasuryWallet.toBase58(),
        protocolFeeBps: protocolData.protocolFeeBps.toNumber(),
        paused: protocolData.paused,
        totalUsers: protocolData.totalUsers.toNumber(),
        totalPools: protocolData.totalPools.toNumber(),
        batchSettleWaitDuration: protocolData.batchSettleWaitDuration.toNumber(),
      };
    } catch (error: any) {
      console.error('Failed to fetch protocol:', error);
      return null;
    }
  }

  /**
   * Fetch pool data
   */
  async getPool(poolId: number): Promise<any> {
    try {
      const [pool] = this.getPoolPDA(this.authority.publicKey, poolId);
      const poolData = await this.program.account.pool.fetch(pool);

      return {
        poolId: poolData.poolId.toNumber(),
        admin: poolData.admin.toBase58(),
        name: poolData.name,
        tokenMint: poolData.tokenMint.toBase58(),
        startTime: poolData.startTime.toNumber(),
        endTime: poolData.endTime.toNumber(),
        maxAccuracyBuffer: poolData.maxAccuracyBuffer.toNumber(),
        convictionBonusBps: poolData.convictionBonusBps.toNumber(),
        metadata: poolData.metadata,
        vaultBalance: poolData.vaultBalance.toNumber(),
        resolutionTarget: poolData.resolutionTarget?.toNumber() || null,
        isResolved: poolData.isResolved,
        resolutionTs: poolData.resolutionTs?.toNumber() || null,
        totalWeight: poolData.totalWeight?.toString() || '0',
        weightFinalized: poolData.weightFinalized,
        totalParticipants: poolData.totalParticipants.toNumber(),
      };
    } catch (error: any) {
      console.error('Failed to fetch pool:', error);
      return null;
    }
  }

  /**
   * Fetch bet data
   */
  async getBet(params: {
    poolId: number;
    userPubkey: PublicKey;
  }): Promise<any> {
    try {
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);
      const [bet] = this.getBetPDA(pool, params.userPubkey);
      
      const betData = await this.program.account.userBet.fetch(bet);

      return {
        owner: betData.owner.toBase58(),
        pool: betData.pool.toBase58(),
        deposit: betData.deposit.toNumber(),
        prediction: betData.prediction?.toNumber() || null,
        calculatedWeight: betData.calculatedWeight?.toString() || '0',
        isWeightAdded: betData.isWeightAdded,
        status: betData.status,
        creationTs: betData.creationTs.toNumber(),
        updateCount: betData.updateCount,
        endTimestamp: betData.endTimestamp?.toNumber() || null,
      };
    } catch (error: any) {
      console.error('Failed to fetch bet:', error);
      return null;
    }
  }

  /**
   * Complete bet flow helper (from init to TEE placement)
   */
  async completeBetFlow(params: {
    poolId: number;
    userKeypair: Keypair;
    betAmount: number;
    prediction: number;
    requestId: string;
    userTokenAccount: PublicKey;
  }): Promise<{
    initSignature: string;
    delegateSignature: string;
    placeBetSignature: string;
  }> {
    console.log('Starting complete bet flow...');

    // Step 1: Initialize bet on L1
    const { signature: initSignature } = await this.initBet({
      poolId: params.poolId,
      userKeypair: params.userKeypair,
      betAmount: params.betAmount,
      requestId: params.requestId,
      userTokenAccount: params.userTokenAccount,
    });

    // Step 2: Delegate to TEE
    const delegateSignature = await this.delegateBet({
      poolId: params.poolId,
      userKeypair: params.userKeypair,
      requestId: params.requestId,
    });

    // Step 3: Place bet on TEE
    const placeBetSignature = await this.placeBetOnTEE({
      poolId: params.poolId,
      userKeypair: params.userKeypair,
      prediction: params.prediction,
      requestId: params.requestId,
    });

    console.log('Complete bet flow finished');

    return {
      initSignature,
      delegateSignature,
      placeBetSignature,
    };
  }

  /**
   * Complete pool resolution flow (delegate, resolve, calculate, undelegate, finalize)
   */
  async completePoolResolution(params: {
    poolId: number;
    finalOutcome: number;
    betPubkeys: PublicKey[];
    tokenMint: PublicKey;
  }): Promise<{
    delegatePoolSignature: string;
    resolveSignature: string;
    calculateWeightsSignature: string;
    undelegateBetsSignature: string;
    undelegatePoolSignature: string;
    finalizeSignature: string;
  }> {
    console.log('Starting complete pool resolution flow...');

    // Step 1: Delegate pool to TEE
    const delegatePoolSignature = await this.delegatePool({
      poolId: params.poolId,
    });

    // Step 2: Resolve pool on TEE
    const resolveSignature = await this.resolvePool({
      poolId: params.poolId,
      finalOutcome: params.finalOutcome,
    });

    // Step 3: Calculate weights on TEE
    const calculateWeightsSignature = await this.batchCalculateWeights({
      poolId: params.poolId,
      betPubkeys: params.betPubkeys,
    });

    // Step 4: Undelegate bets
    const undelegateBetsSignature = await this.batchUndelegateBets({
      poolId: params.poolId,
      betPubkeys: params.betPubkeys,
    });

    // Step 5: Undelegate pool
    const undelegatePoolSignature = await this.undelegatePool({
      poolId: params.poolId,
    });

    // Step 6: Finalize weights on L1
    const finalizeSignature = await this.finalizeWeights({
      poolId: params.poolId,
      tokenMint: params.tokenMint,
    });

    console.log('Complete pool resolution flow finished');

    return {
      delegatePoolSignature,
      resolveSignature,
      calculateWeightsSignature,
      undelegateBetsSignature,
      undelegatePoolSignature,
      finalizeSignature,
    };
  }
}

export const contractService = new ContractService();
 