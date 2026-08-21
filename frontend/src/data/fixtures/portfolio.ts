export interface Holding {
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: "Pending" | "Executed" | "Cancelled";
  date: string;
}

export interface EquityPoint {
  date: string;
  value: number;
}

export const portfolioSummary = {
  totalValue: 1250000,
  todaysPnL: 12500,
  todaysPnLPercent: 1.01,
  cashBalance: 270000,
  investedValue: 980000,
  positionsCount: 12,
};

export const portfolioHoldings: Holding[] = [
  {
    symbol: "JKH",
    name: "John Keells Holdings",
    shares: 500,
    avgPrice: 1150.0,
    currentPrice: 1199.51,
    marketValue: 599755,
    pnl: 24755,
    pnlPercent: 4.31,
  },
  {
    symbol: "DIAL",
    name: "Dialog Axiata",
    shares: 15000,
    avgPrice: 11.8,
    currentPrice: 12.3,
    marketValue: 184500,
    pnl: 7500,
    pnlPercent: 4.24,
  },
  {
    symbol: "HNB",
    name: "Hatton National Bank",
    shares: 1000,
    avgPrice: 190.0,
    currentPrice: 195.5,
    marketValue: 195500,
    pnl: 5500,
    pnlPercent: 2.89,
  },
  {
    symbol: "TJL",
    name: "Teejay Lanka",
    shares: 1000,
    avgPrice: 22.0,
    currentPrice: 22.5,
    marketValue: 22500,
    pnl: 500,
    pnlPercent: 2.27,
  },
];

export const orderHistory: Order[] = [
  {
    id: "TXN-87421",
    symbol: "JKH",
    side: "BUY",
    quantity: 200,
    price: 1195.0,
    status: "Executed",
    date: "2026-08-20 14:32",
  },
  {
    id: "TXN-87410",
    symbol: "COMB",
    side: "SELL",
    quantity: 1000,
    price: 89.5,
    status: "Executed",
    date: "2026-08-20 11:15",
  },
  {
    id: "TXN-87399",
    symbol: "DIAL",
    side: "BUY",
    quantity: 5000,
    price: 12.3,
    status: "Pending",
    date: "2026-08-21 09:45",
  },
  {
    id: "TXN-87388",
    symbol: "LOLC",
    side: "BUY",
    quantity: 100,
    price: 325.0,
    status: "Cancelled",
    date: "2026-08-19 16:00",
  },
];

export const portfolioEquityHistory: EquityPoint[] = [
  { date: "2026-08-12", value: 1210000 },
  { date: "2026-08-13", value: 1222000 },
  { date: "2026-08-14", value: 1218000 },
  { date: "2026-08-15", value: 1225000 },
  { date: "2026-08-16", value: 1220000 },
  { date: "2026-08-17", value: 1231000 },
  { date: "2026-08-18", value: 1238000 },
  { date: "2026-08-19", value: 1242000 },
  { date: "2026-08-20", value: 1250000 },
];
