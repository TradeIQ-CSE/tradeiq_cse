import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.AUTH_DATABASE_URL,
}));
