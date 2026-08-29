export enum MarketFilter {
  All = 'all',
  Gainers = 'gainers',
  Losers = 'losers',
  MostActive = 'mostActive',
}

export const MARKET_FILTERS: readonly MarketFilter[] = [
  MarketFilter.All,
  MarketFilter.Gainers,
  MarketFilter.Losers,
  MarketFilter.MostActive,
];
