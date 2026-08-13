const CHART_PATH =
  'M4,238 C24,214 44,200 64,206 C84,212 104,232 124,224 C144,216 164,178 184,170 C204,162 224,180 244,174 C264,168 284,132 304,120 C324,108 344,118 364,112 C384,106 404,74 424,66 C444,58 464,80 484,72 C504,64 524,20 544,14 C564,8 584,34 604,26 C624,18 644,-4 658,4';

const CHART_AREA_PATH = `${CHART_PATH} L658,268 L4,268 Z`;

const Y_LABELS = ['1200', '1160', '1120', '1080', '1040'];
const X_LABELS = ['Oct 3', 'Nov 1', 'Nov 29', 'Jan 3', 'Jan 31'];

const INDEX_STATS = [
  { label: 'ASPI', value: '8,423.5', change: '+0.84%', positive: true },
  { label: 'S&P SL20', value: '2,847.3', change: '+1.12%', positive: true },
  { label: 'MPI', value: '14,091.2', change: '-0.30%', positive: false },
];

const NAV_ITEMS = [
  { group: 'MARKETS', items: [{ label: 'Markets', active: true }, { label: 'Watchlist', active: false }] },
  { group: 'MY PORTFOLIO', items: [{ label: 'Portfolio', active: false }, { label: 'Trades', active: false }] },
  { group: 'TRADING', items: [{ label: 'Paper Trading', active: false }] },
  { group: 'ANALYSIS', items: [{ label: 'AI Insights', active: false }] },
];

const AI_SIGNALS = [
  { symbol: 'JKH', bull: 53, neutral: 20, bear: 27, arrow: '↑', tone: 'up' },
  { symbol: 'COMB', bull: 33, neutral: 40, bear: 27, arrow: '→', tone: 'flat' },
  { symbol: 'DIAL', bull: 48, neutral: 24, bear: 28, arrow: '↑', tone: 'up' },
  { symbol: 'LOLC', bull: 21, neutral: 29, bear: 50, arrow: '↓', tone: 'down' },
] as const;

const PORTFOLIO_ROWS = [
  { symbol: 'JKH', change: '+10.6%', positive: true },
  { symbol: 'COMB', change: '-3.0%', positive: false },
  { symbol: 'DIAL', change: '+9.8%', positive: true },
];

export function LandingHeroMockup() {
  return (
    <div className="landing-hero-mockup">
      <div className="landing-hero-mockup__titlebar">
        <div className="landing-hero-mockup__dots">
          <span className="landing-hero-mockup__dot landing-hero-mockup__dot--red" />
          <span className="landing-hero-mockup__dot landing-hero-mockup__dot--yellow" />
          <span className="landing-hero-mockup__dot landing-hero-mockup__dot--green" />
        </div>
        <div className="landing-hero-mockup__url">app.tradeiq.lk</div>
        <div className="landing-hero-mockup__indices">
          {INDEX_STATS.map((stat) => (
            <div key={stat.label} className="landing-hero-mockup__index">
              <span className="landing-hero-mockup__index-label">{stat.label}</span>
              <span className="landing-hero-mockup__index-value">{stat.value}</span>
              <span
                className={
                  stat.positive
                    ? 'landing-hero-mockup__index-change landing-hero-mockup__index-change--up'
                    : 'landing-hero-mockup__index-change landing-hero-mockup__index-change--down'
                }
              >
                {stat.change}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="landing-hero-mockup__body">
        <aside className="landing-hero-mockup__sidebar">
          <div className="landing-hero-mockup__brand">
            <span className="landing-hero-mockup__brand-badge" />
            <span className="landing-hero-mockup__brand-name">TradeIQ CSE</span>
          </div>
          {NAV_ITEMS.map((group) => (
            <div key={group.group} className="landing-hero-mockup__nav-group">
              <p className="landing-hero-mockup__nav-label">{group.group}</p>
              {group.items.map((item) => (
                <div
                  key={item.label}
                  className={
                    item.active
                      ? 'landing-hero-mockup__nav-item landing-hero-mockup__nav-item--active'
                      : 'landing-hero-mockup__nav-item'
                  }
                >
                  {item.label}
                </div>
              ))}
            </div>
          ))}
          <div className="landing-hero-mockup__profile">
            <span className="landing-hero-mockup__avatar">N</span>
            <div>
              <p className="landing-hero-mockup__profile-name">Nimesh</p>
              <p className="landing-hero-mockup__profile-role">Live trader</p>
            </div>
          </div>
        </aside>

        <div className="landing-hero-mockup__chart">
          <div className="landing-hero-mockup__chart-header">
            <div>
              <p className="landing-hero-mockup__symbol">JKH.N0000</p>
              <p className="landing-hero-mockup__symbol-name">John Keells Holdings</p>
            </div>
            <span className="landing-hero-mockup__price">1,199.51</span>
            <span className="landing-hero-mockup__price-change">+1.22%</span>
            <div className="landing-hero-mockup__ranges">
              <span>1D</span>
              <span>1W</span>
              <span>1M</span>
              <span className="landing-hero-mockup__range--active">All</span>
            </div>
          </div>

          <div className="landing-hero-mockup__chart-plot">
            <div className="landing-hero-mockup__chart-yaxis">
              {Y_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <svg
              className="landing-hero-mockup__chart-svg"
              viewBox="0 0 662 300"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="landing-hero-chart-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(124, 58, 237, 0.35)" />
                  <stop offset="100%" stopColor="rgba(124, 58, 237, 0)" />
                </linearGradient>
              </defs>
              {Y_LABELS.map((_, i) => (
                <line
                  key={i}
                  x1="0"
                  x2="662"
                  y1={4 + i * 66}
                  y2={4 + i * 66}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />
              ))}
              <path d={CHART_AREA_PATH} fill="url(#landing-hero-chart-fill)" stroke="none" />
              <path d={CHART_PATH} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="landing-hero-mockup__chart-xaxis">
              {X_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        </div>

        <aside className="landing-hero-mockup__signals">
          <p className="landing-hero-mockup__signals-label">AI Signals · 1W</p>
          {AI_SIGNALS.map((signal) => (
            <div key={signal.symbol} className="landing-hero-mockup__signal-row">
              <span className="landing-hero-mockup__signal-symbol">{signal.symbol}</span>
              <span className="landing-hero-mockup__signal-bar">
                <span
                  className="landing-hero-mockup__signal-seg landing-hero-mockup__signal-seg--bull"
                  style={{ width: `${signal.bull}%` }}
                />
                <span
                  className="landing-hero-mockup__signal-seg landing-hero-mockup__signal-seg--neutral"
                  style={{ width: `${signal.neutral}%` }}
                />
                <span
                  className="landing-hero-mockup__signal-seg landing-hero-mockup__signal-seg--bear"
                  style={{ width: `${signal.bear}%` }}
                />
              </span>
              <span className={`landing-hero-mockup__signal-arrow landing-hero-mockup__signal-arrow--${signal.tone}`}>
                {signal.arrow}
              </span>
            </div>
          ))}

          <p className="landing-hero-mockup__signals-label landing-hero-mockup__signals-label--divider">
            Portfolio
          </p>
          {PORTFOLIO_ROWS.map((row) => (
            <div key={row.symbol} className="landing-hero-mockup__portfolio-row">
              <span>{row.symbol}</span>
              <span className={row.positive ? 'landing-hero-mockup__index-change--up' : 'landing-hero-mockup__index-change--down'}>
                {row.change}
              </span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
