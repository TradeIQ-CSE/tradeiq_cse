import { registerAs } from '@nestjs/config';

export default registerAs('ingestion', () => ({
  token: process.env.MARKET_INGESTION_TOKEN ?? '',
}));
