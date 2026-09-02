import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListValuationsQueryDto } from './dto/list-valuations-query.dto';
import { QuoteSymbolParamDto } from './dto/quote-symbol-param.dto';
import { PaperTradingQuotesService } from './paper-trading-quotes.service';

// docs/api/paper-trading-v1.md §2.3 and §2.4 — the two price boundaries
// identity-auth reads.
//
// Service-to-service endpoints consumed by identity-auth. Unauthenticated, like
// every other market-trading route: they are read-only and expose no user data,
// and market-trading has no guard infrastructure. CORS stays locked to GET from
// the frontend origin, so a browser on another origin cannot reach them.
@Controller('internal/paper-trading')
export class PaperTradingQuotesController {
  constructor(private readonly quotes: PaperTradingQuotesService) {}

  // §2.4 — closes for a set of symbols at one session, for portfolio valuation.
  @Get('valuations')
  async getValuations(@Query() query: ListValuationsQueryDto) {
    return {
      data: await this.quotes.getValuations(query.symbols, query.as_of),
    };
  }

  // §2.3 — the single execution quote an order fills at.
  @Get('quotes/:symbol')
  async get(@Param() params: QuoteSymbolParamDto) {
    return { data: await this.quotes.getQuote(params.symbol) };
  }
}
