import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getProvider, programId, loadKeypair } from '../../config/solanaClient';
import * as nacl from 'tweetnacl';

// Actual SwivPrivacy IDL from Arcium build
import type { SwivPrivacy } from './idl/swiv_privacy';
import IDL from './idl/swiv_privacy.json';
import { getArciumAccountBaseSeed, getArciumProgAddress, getCompDefAccOffset, getMXEAccAddress } from '@arcium-hq/client';

const ARCIUM_PROGRAM_ID = new PublicKey('BKck65TgoKRokMjQM3datB9oRwJ8rAj2jxPXvHXUvcL6');

export class CypherCastClient {
  private program: Program<SwivPrivacy>;
  private provider: AnchorProvider;
  private authority: web3.Keypair;

  constructor() {
    this.provider = getProvider();
    this.program = new Program(IDL as SwivPrivacy, this.provider);
    this.authority = loadKeypair();
  }

  private deriveMxePDA(): PublicKey {
    const [mxePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('mxe_pda')],
      ARCIUM_PROGRAM_ID
    );
    console.log('Derived MXE PDA:', mxePda.toBase58());
    return mxePda;
  }

  private getProtocolStatePDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('protocol_state')],
      this.program.programId
    );
  }

  /**
   * Derive pool PDA
   */
  private getPoolPDA(poolId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), new BN(poolId).toArrayLike(Buffer, 'le', 8)],
      this.program.programId
    );
  }

  /**
   * Derive pool vault PDA
   */
  private getPoolVaultPDA(poolId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('pool_vault'), new BN(poolId).toArrayLike(Buffer, 'le', 8)],
      this.program.programId
    );
  }

  /**
   * Derive bet PDA
   */
  private getBetPDA(poolPubkey: PublicKey, userPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('bet'), poolPubkey.toBuffer(), userPubkey.toBuffer()],
      this.program.programId
    );
  }

  /**
   * Initialize the protocol (one-time setup)
   */
  async initializeProtocol(protocolFeeBps: number = 250): Promise<string> {
    try {
      const [protocolState] = this.getProtocolStatePDA();

      const tx = await this.program.methods
        .initialize(protocolFeeBps)
        .accounts({
          protocolState,
          admin: this.authority.publicKey,
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
   * Create a new prediction pool on-chain
   */
  async createPool(params: {
    poolId: number;
    assetSymbol: string;
    entryFee: number;
    targetTimestamp: number;
    maxParticipants: number;
    tokenMint: PublicKey;
  }): Promise<{ signature: string; poolPubkey: string; vaultPubkey: string }> {
    try {
      const [protocolState] = this.getProtocolStatePDA();
      const [pool] = this.getPoolPDA(params.poolId);
      const [poolVault] = this.getPoolVaultPDA(params.poolId);

      const tx = await this.program.methods
        .createPool(
          new BN(params.poolId),
          params.assetSymbol,
          new BN(params.entryFee),
          new BN(params.targetTimestamp),
          params.maxParticipants
        )
        .accounts({
          protocolState,
          pool,
          poolVault,
          tokenMint: params.tokenMint,
          admin: this.authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([this.authority])
        .rpc();

      console.log('Pool created on-chain:', tx);

      return {
        signature: tx,
        poolPubkey: pool.toBase58(),
        vaultPubkey: poolVault.toBase58(),
      };
    } catch (error: any) {
      console.error('Failed to create pool on-chain:', error);
      throw error;
    }
  }

  /**
   * Fetch pool data from blockchain
   */
  async getPool(poolId: number): Promise<any> {
    try {
      const [pool] = this.getPoolPDA(poolId);
      const poolData = await this.program.account.pool.fetch(pool);

      return {
        poolId: poolData.poolId.toString(),
        admin: poolData.admin.toBase58(),
        assetSymbol: poolData.assetSymbol,
        entryFee: poolData.entryFee.toNumber(),
        targetTimestamp: poolData.targetTimestamp.toNumber(),
        maxParticipants: poolData.maxParticipants,
        totalParticipants: poolData.totalParticipants,
        totalPoolAmount: poolData.totalPoolAmount.toNumber(),
        status: poolData.status,
        actualPrice: poolData.actualPrice.toNumber(),
        bump: poolData.bump,
        vaultBump: poolData.vaultBump,
      };
    } catch (error: any) {
      console.error('Failed to fetch pool:', error);
      return null;
    }
  }

  /**
   * Finalize pool with oracle price
   */
  async finalizePool(params: {
    poolId: number;
    actualPrice: number;
  }): Promise<string> {
    try {
      const [pool] = this.getPoolPDA(params.poolId);

      const tx = await this.program.methods
        .finalizePool(new BN(params.actualPrice))
        .accounts({
          pool,
          admin: this.authority.publicKey,
        })
        .signers([this.authority])
        .rpc();

      console.log('Pool finalized on-chain:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to finalize pool on-chain:', error);
      throw error;
    }
  }

  /**
   * Close pool (emergency)
   */
  async closePool(poolId: number): Promise<string> {
    try {
      const [pool] = this.getPoolPDA(poolId);

      const tx = await this.program.methods
        .closePool()
        .accounts({
          pool,
          admin: this.authority.publicKey,
        })
        .signers([this.authority])
        .rpc();

      console.log('Pool closed on-chain:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to close pool on-chain:', error);
      throw error;
    }
  }

  /**
   * Get protocol state
   */
  async getProtocolState(): Promise<any> {
    try {
      const [protocolState] = this.getProtocolStatePDA();
      const state = await this.program.account.protocolState.fetch(protocolState);

      return {
        admin: state.admin.toBase58(),
        protocolFeeBps: state.protocolFeeBps,
        totalPoolsCreated: state.totalPoolsCreated.toString(),
        bump: state.bump,
      };
    } catch (error: any) {
      console.error('Failed to fetch protocol state:', error);
      return null;
    }
  }

  /**
   * Initialize process_bet computation definition (one-time setup)
   */
  async initProcessBetCompDef(): Promise<string> {
    try {
      const baseSeedCompDefAcc = getArciumAccountBaseSeed(
        "ComputationDefinitionAccount"
      );
      const offset = getCompDefAccOffset("process_bet");

      const compDefPDA = PublicKey.findProgramAddressSync(
        [baseSeedCompDefAcc, this.program.programId.toBuffer(), offset],
        getArciumProgAddress()
      )[0];
      console.log("getMXEAccAddress:", getMXEAccAddress(this.program.programId));

      console.log(
        "Init process bet computation definition pda is ",
        compDefPDA.toBase58()
      );
      const tx = await this.program.methods
        .initProcessBetCompDef()
        .accounts({
          payer: this.authority.publicKey,
          mxeAccount: getMXEAccAddress(this.program.programId),
          compDefAccount: compDefPDA,
        })
        .signers([this.authority])
        .rpc();

      console.log('Process bet comp def initialized:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to initialize process bet comp def:', error);
      throw error;
    }
  }

  /**
   * Initialize calculate_reward computation definition (one-time setup)
   */
  async initCalculateRewardCompDef(): Promise<string> {
    try {
      const baseSeedCompDefAcc = getArciumAccountBaseSeed(
        "ComputationDefinitionAccount"
      );
      const offset = getCompDefAccOffset("calculate_reward");

      const compDefPDA = PublicKey.findProgramAddressSync(
        [baseSeedCompDefAcc, this.program.programId.toBuffer(), offset],
        getArciumProgAddress()
      )[0];
      console.log("getMXEAccAddress:", getMXEAccAddress(this.program.programId));

      console.log(
        "Init calculate reward computation definition pda is ",
        compDefPDA.toBase58()
      );
      const tx = await this.program.methods
        .initCalculateRewardCompDef()
        .accounts({
          payer: this.authority.publicKey,
          mxeAccount: getMXEAccAddress(this.program.programId),
          compDefAccount: compDefPDA,
        })
        .signers([this.authority])
        .rpc();

      console.log('Calculate reward comp def initialized:', tx);
      return tx;
    } catch (error: any) {
      console.error('Failed to initialize calculate reward comp def:', error);
      throw error;
    }
  }

  /**
   * Derive computation definition PDA
   */
  private getCompDefPDA(offset: number): [PublicKey, number] {
    console.log('Deriving comp def PDA with offset:', new BN(offset).toArrayLike(Buffer, 'le', 4));
    return PublicKey.findProgramAddressSync(
      [Buffer.from('comp_def'), new BN(offset).toArrayLike(Buffer, 'le', 4)],
      this.program.programId
    );
  }

  /**
   * Helper: Encrypt prediction price (for client-side use)
   * This is an example - in production, encryption happens client-side
   */
  encryptPrediction(predictedPrice: number, userSecretKey: Uint8Array): {
    ciphertext: Uint8Array;
    publicKey: Uint8Array;
    nonce: bigint;
  } {
    const nonceBytes = nacl.randomBytes(24);
    const nonce = BigInt('0x' + Buffer.from(nonceBytes).toString('hex'));

    const priceBuffer = Buffer.alloc(8);
    priceBuffer.writeBigUInt64LE(BigInt(predictedPrice));

    const plaintext = new Uint8Array(32);
    plaintext.set(priceBuffer);

    const key = userSecretKey.slice(0, 32);
    const encrypted = nacl.secretbox(plaintext, nonceBytes, key);

    const paddedCiphertext = new Uint8Array(32);
    paddedCiphertext.set(encrypted.slice(0, 32));

    return {
      ciphertext: paddedCiphertext,
      publicKey: userSecretKey.slice(32, 64), // public key part
      nonce,
    };
  }
}

export const cyphercastClient = new CypherCastClient();