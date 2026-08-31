/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MARKET_TRADING_API_URL: string;
  readonly VITE_IDENTITY_AUTH_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
