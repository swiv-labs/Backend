import axios from 'axios';
import { env } from '../config/env';
import { BINANCE_SYMBOL_MAP, COINGECKO_ID_MAP } from '../utils/constants';

export class OracleService {
  /**
   * Fetch current price from Binance
   */
  static async getPriceFromBinance(assetSymbol: string): Promise<number> {
    try {
      const symbol = BINANCE_SYMBOL_MAP[assetSymbol];
      if (!symbol) throw new Error(`Unsupported asset: ${assetSymbol}`);

      const response = await axios.get(`${env.BINANCE_API_URL}/ticker/price`, {
        params: { symbol },
      });

      return parseFloat(response.data.price);
    } catch (error: any) {
      console.error('Binance API error:', error.message);
      throw new Error(`Failed to fetch price from Binance: ${error.message}`);
    }
  }

  /**
   * Fetch current price from CoinGecko (fallback)
   */
  static async getPriceFromCoinGecko(assetSymbol: string): Promise<number> {
    try {
      const coinId = COINGECKO_ID_MAP[assetSymbol];
      if (!coinId) throw new Error(`Unsupported asset: ${assetSymbol}`);

      const response = await axios.get(`${env.COINGECKO_API_URL}/simple/price`, {
        params: {
          ids: coinId,
          vs_currencies: 'usd',
        },
      });

      return response.data[coinId].usd;
    } catch (error: any) {
      console.error('CoinGecko API error:', error.message);
      throw new Error(`Failed to fetch price from CoinGecko: ${error.message}`);
    }
  }

  /**
   * Get current price with fallback logic
   */
  static async getCurrentPrice(assetSymbol: string): Promise<number> {
    try {
      return await this.getPriceFromBinance(assetSymbol);
    } catch (error) {
      console.log('Binance failed, trying CoinGecko...');
      return await this.getPriceFromCoinGecko(assetSymbol);
    }
  }
}