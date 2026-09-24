// Curated CSE-wide closures long enough to otherwise register as a
// `missing_data` gap (docs/plans/data-gap-handling.md "What counts as a
// gap"). A gap in the data alone cannot tell a closure from an outage, so
// these are hand-verified rather than inferred. Extend this list only for a
// closure confirmed against a CSE circular or equivalent source — an
// unconfirmed absence of rows should surface as `missing_data` instead.
export interface MarketClosure {
  from: string;
  to: string;
  label: string;
  source: string;
}

export const KNOWN_MARKET_CLOSURES: MarketClosure[] = [
  {
    from: '2020-03-23',
    to: '2020-05-08',
    label: 'CSE closed (COVID-19)',
    // Sri Lanka's island-wide curfew shut the exchange from 20 Mar 2020;
    // trading resumed 11 May 2020 after the first data row on 2020-05-08.
    source: 'CSE trading calendar, COVID-19 curfew closure notice, 2020',
  },
  {
    from: '2022-04-11',
    to: '2022-04-22',
    label: 'CSE closed: holidays and crisis trading halt',
    // Sinhala/Tamil New Year holidays ran into the economic-crisis trading
    // halt CSE ordered while the rupee was floated.
    source: 'CSE trading calendar, April 2022 economic crisis halt notice',
  },
];
