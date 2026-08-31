import { Controller, Get, Param } from '@nestjs/common';
import { QuoteSymbolParamDto } from './dto/quote-symbol-param.dto';
import { PaperTradingQuotesService } from './paper-trading-quotes.service';

// docs/api/paper-trading-v1.md §2.3 — GET /internal/paper-trading/quotes/{symbol}
//
// Service-to-service endpoint consumed by identity-auth. Unauthenticated, like
// every other market-trading route: it is read-only and exposes no user data
// (§2.3), and market-trading has no guard infrastructure. CORS stays locked to
// GET from the frontend origin, so a browser on another origin cannot reach it.
@Controller('internal/paper-trading/quotes')
export class PaperTradingQuotesController {
  constructor(private readonly quotes: PaperTradingQuotesService) {}

  @Get(':symbol')
  async get(@Param() params: QuoteSymbolParamDto) {
    return { data: await this.quotes.getQuote(params.symbol) };
  }
}
