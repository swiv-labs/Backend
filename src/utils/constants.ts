export const POOL_STATUS = {
    ACTIVE: 'active',
    CLOSED: 'closed',
  } as const;
  
  export const PREDICTION_STATUS = {
    PENDING: 'pending',
    WON: 'won',
    LOST: 'lost',
    CLAIMED: 'claimed',
  } as const;
  
  export const PREDICTION_DIRECTION = {
    UP: 'up',
    DOWN: 'down',
  } as const;
  
  export const ASSET_SYMBOLS = {
    BTC: 'BTC',
    ETH: 'ETH',
    SOL: 'SOL',
    USDT: 'USDT',
  } as const;
  
  export const BINANCE_SYMBOL_MAP: Record<string, string> = {
    BTC: 'BTCUSDT',
    ETH: 'ETHUSDT',
    SOL: 'SOLUSDT',
  };
  
  export const COINGECKO_ID_MAP: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
  };