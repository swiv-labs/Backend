import { Program, AnchorProvider, BN, web3, Wallet } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair, ComputeBudgetProgram, Connection } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import { getProvider, programId, loadKeypair } from '../../config/solanaClient';
import * as nacl from 'tweetnacl';
import {
  getAuthToken,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import type { SwivPrivacy } from './idl/swiv_privacy';
import IDL from './idl/swiv_privacy.json';

const TEE_URL = process.env.MAGICBLOCK_TEE_URL || "https://tee.magicblock.app";
const TEE_WS_URL = process.env.MAGICBLOCK_TEE_WS_URL || "wss://tee.magicblock.app";
const TEE_VALIDATOR = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");

const SEED_PROTOCOL = Buffer.from('protocol_v2');
const SEED_POOL = Buffer.from('pool');
const SEED_BET = Buffer.from('bet');
const SEED_POOL_VAULT = Buffer.from('pool_vault');

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  private getProtocolPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_PROTOCOL],
      this.program.programId
    );
  }


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

  private getPoolVaultPDA(poolPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_POOL_VAULT, poolPubkey.toBuffer()],
      this.program.programId
    );
  }


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
      const [protocol] = this.getProtocolPDA();
      const protocolData = await this.program.account.protocol.fetch(protocol);
      const poolId = protocolData.totalPools.toNumber();

      const [pool] = this.getPoolPDA(this.authority.publicKey, poolId);
      const [poolVault] = this.getPoolVaultPDA(pool);

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
      const poolData = await this.program.account.pool.fetch(pool);
      console.log("🔍 Current Pool Data:", poolData);

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
        const authToken = await getAuthToken(
          this.teeEndpoint,
          this.authority.publicKey,
          (message: Uint8Array) =>
            Promise.resolve(nacl.sign.detached(message, this.authority.secretKey))
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

  async delegatePool(params: {
    poolId: number;
  }): Promise<string> {
    try {
      console.log('Delegating pool to TEE...', this.authority.publicKey.toBase58(), params.poolId);
      const [protocol] = this.getProtocolPDA();
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);

      const poolAcc = await this.provider.connection.getAccountInfo(pool);
      console.log(poolAcc?.owner.toBase58());


      const tx = await this.program.methods
        .delegatePool(new BN(params.poolId))
        .accountsPartial({
          admin: this.authority.publicKey,
          protocol,
          pool,
          validator: TEE_VALIDATOR,
        })
        .rpc();

      console.log('Pool delegated to TEE:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to delegate pool:', error);
      throw error;
    }
  }

  async resolvePool(params: {
    poolId: number;
    finalOutcome: number;
  }): Promise<string> {
    try {
      const [protocol] = this.getProtocolPDA();
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);

      const authToken = await getAuthToken(
        this.teeEndpoint,
        this.authority.publicKey,
        (message: Uint8Array) =>
          Promise.resolve(nacl.sign.detached(message, this.authority.secretKey))
      );
      console.log("    ✅ Admin Auth Token obtained.");

      const teeConnection = new Connection(
        `${TEE_URL}?token=${authToken.token}`,
        {
          commitment: 'confirmed',
          wsEndpoint: `${TEE_WS_URL}?token=${authToken.token}`,
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

  async batchCalculateWeights(params: {
    poolId: number;
    betPubkeys: PublicKey[];
  }): Promise<string> {
    try {
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);

      const authToken = await getAuthToken(
        this.teeEndpoint,
        this.authority.publicKey,
        (message: Uint8Array) =>
          Promise.resolve(nacl.sign.detached(message, this.authority.secretKey))
      );
      console.log("    ✅ Admin Auth Token obtained.");

      const teeConnection = new Connection(
        `${TEE_URL}?token=${authToken.token}`,
        {
          commitment: 'confirmed',
          wsEndpoint: `${TEE_WS_URL}?token=${authToken.token}`,
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

  async batchUndelegateBets(params: {
    poolId: number;
    betPubkeys: PublicKey[];
  }): Promise<string> {
    try {
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);

      const authToken = await getAuthToken(
        this.teeEndpoint,
        this.authority.publicKey,
        (message: Uint8Array) =>
          Promise.resolve(nacl.sign.detached(message, this.authority.secretKey))
      );
      console.log("    ✅ Admin Auth Token obtained.");

      const teeConnection = new Connection(
        `${TEE_URL}?token=${authToken.token}`,
        {
          commitment: 'confirmed',
          wsEndpoint: `${TEE_WS_URL}?token=${authToken.token}`,
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

  async undelegatePool(params: {
    poolId: number;
  }): Promise<string> {
    try {
      const [protocol] = this.getProtocolPDA();
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);

      const authToken = await getAuthToken(
        this.teeEndpoint,
        this.authority.publicKey,
        (message: Uint8Array) =>
          Promise.resolve(nacl.sign.detached(message, this.authority.secretKey))
      );
      console.log("    ✅ Admin Auth Token obtained.");

      const teeConnection = new Connection(
        `${TEE_URL}?token=${authToken.token}`,
        {
          commitment: 'confirmed',
          wsEndpoint: `${TEE_WS_URL}?token=${authToken.token}`,
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

  async finalizeWeights(params: {
    poolId: number;
    tokenMint: PublicKey;
  }): Promise<string> {
    try {
      const [protocol] = this.getProtocolPDA();
      const [pool] = this.getPoolPDA(this.authority.publicKey, params.poolId);
      const [poolVault] = this.getPoolVaultPDA(pool);

      const protocolData = await this.program.account.protocol.fetch(protocol);
      const poolAccount = await this.program.account.pool.fetch(pool);

      console.log("🔍 Pool State:", poolAccount);

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

    const delegatePoolSignature = await this.delegatePool({
      poolId: params.poolId,
    });

    const resolveSignature = await this.resolvePool({
      poolId: params.poolId,
      finalOutcome: params.finalOutcome,
    });

    const calculateWeightsSignature = await this.batchCalculateWeights({
      poolId: params.poolId,
      betPubkeys: params.betPubkeys,
    });

    const undelegateBetsSignature = await this.batchUndelegateBets({
      poolId: params.poolId,
      betPubkeys: params.betPubkeys,
    });

    const undelegatePoolSignature = await this.undelegatePool({
      poolId: params.poolId,
    });

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

  getProgram(): Program<SwivPrivacy> {
    return this.program;
  }

  getConnection(): Connection {
    return this.provider.connection;
  }

  getAdminKeypair(): Keypair {
    return this.authority;
  }
}

export const contractService = new ContractService();
