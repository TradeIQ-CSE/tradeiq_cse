import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.MARKET_DATA_DATABASE_URL,
}));
