export interface OHLCPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Generates an array of OHLC points for a single security over the last 30 trading days.
export const MOCK_OHLC_DATA: Record<string, OHLCPoint[]> = {
  DEFAULT: [
    { date: '07-15', open: 185.0, high: 190.0, low: 184.0, close: 188.5, volume: 950000 },
    { date: '07-16', open: 189.0, high: 192.5, low: 187.0, close: 191.0, volume: 1100000 },
    { date: '07-17', open: 191.0, high: 191.5, low: 186.0, close: 187.5, volume: 800000 },
    { date: '07-20', open: 187.0, high: 189.0, low: 183.0, close: 184.2, volume: 750000 },
    { date: '07-21', open: 184.0, high: 188.0, low: 183.5, close: 186.8, volume: 620000 },
    { date: '07-22', open: 187.0, high: 191.0, low: 186.5, close: 190.2, volume: 900000 },
    { date: '07-23', open: 190.0, high: 194.0, low: 189.5, close: 193.5, volume: 1050000 },
    { date: '07-24', open: 194.0, high: 198.0, low: 193.0, close: 196.2, volume: 1300000 },
    { date: '07-27', open: 196.0, high: 197.0, low: 192.0, close: 193.0, volume: 850000 },
    { date: '07-28', open: 193.0, high: 195.5, low: 191.0, close: 194.8, volume: 700000 },
    { date: '07-29', open: 195.0, high: 196.0, low: 190.5, close: 191.2, volume: 650000 },
    { date: '07-30', open: 191.0, high: 192.5, low: 188.0, close: 189.5, volume: 800000 },
    { date: '07-31', open: 189.5, high: 192.0, low: 187.5, close: 188.0, volume: 720000 },
    { date: '08-03', open: 188.0, high: 190.5, low: 186.0, close: 189.0, volume: 590000 },
    { date: '08-04', open: 189.0, high: 194.0, low: 188.5, close: 193.2, volume: 1000000 },
    { date: '08-05', open: 193.0, high: 197.5, low: 192.0, close: 196.5, volume: 1400000 },
    { date: '08-06', open: 196.0, high: 198.0, low: 194.5, close: 195.0, volume: 850000 },
    { date: '08-07', open: 195.0, high: 196.5, low: 192.0, close: 193.5, volume: 920000 },
    { date: '08-10', open: 193.5, high: 195.0, low: 191.0, close: 192.0, volume: 680000 },
    { date: '08-11', open: 192.0, high: 196.0, low: 191.5, close: 195.5, volume: 1050000 },
    { date: '08-12', open: 195.0, high: 199.0, low: 194.5, close: 198.0, volume: 1250000 },
    { date: '08-13', open: 198.0, high: 202.0, low: 197.0, close: 201.2, volume: 1600000 },
    { date: '08-14', open: 201.0, high: 203.0, low: 199.0, close: 200.5, volume: 1100000 },
    { date: '08-17', open: 200.5, high: 202.0, low: 196.0, close: 197.0, volume: 950000 },
    { date: '08-18', open: 197.0, high: 199.5, low: 196.5, close: 198.2, volume: 730000 },
    { date: '08-19', open: 198.0, high: 201.0, low: 197.5, close: 200.1, volume: 880000 },
    { date: '08-20', open: 200.0, high: 204.0, low: 199.5, close: 203.5, volume: 1450000 },
    { date: '08-21', open: 203.5, high: 207.0, low: 203.0, close: 206.2, volume: 1750000 },
    { date: '08-24', open: 206.0, high: 207.5, low: 202.0, close: 203.0, volume: 1200000 },
    { date: '08-25', open: 203.0, high: 205.0, low: 201.5, close: 202.4, volume: 810000 },
    { date: '08-26', open: 202.5, high: 204.5, low: 201.0, close: 203.8, volume: 990000 },
    { date: '08-27', open: 203.8, high: 206.0, low: 203.0, close: 205.0, volume: 1150000 },
    { date: '08-28', open: 205.0, high: 209.0, low: 201.0, close: 205.0, volume: 1300000 },
  ],
};
