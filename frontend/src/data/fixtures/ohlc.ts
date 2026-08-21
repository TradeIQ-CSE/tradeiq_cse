export interface OHLCDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const ohlcData: OHLCDataPoint[] = [
  { date: "2026-08-01", open: 1150.0, high: 1175.0, low: 1145.0, close: 1170.0, volume: 150000 },
  { date: "2026-08-02", open: 1170.0, high: 1185.0, low: 1160.0, close: 1165.0, volume: 120000 },
  { date: "2026-08-03", open: 1165.0, high: 1190.0, low: 1165.0, close: 1180.0, volume: 180000 },
  { date: "2026-08-04", open: 1180.0, high: 1185.0, low: 1155.0, close: 1160.0, volume: 90000 },
  { date: "2026-08-05", open: 1160.0, high: 1170.0, low: 1140.0, close: 1145.0, volume: 110000 },
  { date: "2026-08-06", open: 1145.0, high: 1165.0, low: 1145.0, close: 1162.0, volume: 130000 },
  { date: "2026-08-07", open: 1162.0, high: 1180.0, low: 1158.0, close: 1175.0, volume: 145000 },
  { date: "2026-08-08", open: 1175.0, high: 1195.0, low: 1170.0, close: 1190.0, volume: 210000 },
  { date: "2026-08-09", open: 1190.0, high: 1205.0, low: 1185.0, close: 1198.5, volume: 250000 },
  { date: "2026-08-10", open: 1198.5, high: 1200.0, low: 1180.0, close: 1185.0, volume: 160000 },
  { date: "2026-08-11", open: 1185.0, high: 1192.0, low: 1175.0, close: 1188.0, volume: 105000 },
  { date: "2026-08-12", open: 1188.0, high: 1210.0, low: 1185.0, close: 1205.0, volume: 320000 },
  { date: "2026-08-13", open: 1205.0, high: 1220.0, low: 1200.0, close: 1215.0, volume: 290000 },
  { date: "2026-08-14", open: 1215.0, high: 1218.0, low: 1195.0, close: 1200.0, volume: 185000 },
  { date: "2026-08-15", open: 1200.0, high: 1212.0, low: 1198.0, close: 1210.0, volume: 140000 },
  { date: "2026-08-16", open: 1210.0, high: 1215.0, low: 1188.0, close: 1192.0, volume: 165000 },
  { date: "2026-08-17", open: 1192.0, high: 1205.0, low: 1190.0, close: 1201.0, volume: 125000 },
  { date: "2026-08-18", open: 1201.0, high: 1210.0, low: 1195.0, close: 1205.5, volume: 115000 },
  { date: "2026-08-19", open: 1205.5, high: 1222.0, low: 1202.0, close: 1218.0, volume: 195000 },
  { date: "2026-08-20", open: 1218.0, high: 1225.0, low: 1180.0, close: 1199.51, volume: 245300 },
];
