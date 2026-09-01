import { Controller, Get } from '@nestjs/common';

// Deliberately unguarded: liveness has to answer before a caller has a token.
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'identity-auth' };
  }
}
