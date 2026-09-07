import { randomUUID } from 'node:crypto';

const REQUEST_TIMEOUT_MS = 10_000;
const READINESS_TIMEOUT_MS = 120_000;
const RETRY_INTERVAL_MS = 1_000;

function requiredOrigin(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use http or https`);
  }
  return url.origin;
}

const origins = {
  market: requiredOrigin('SMOKE_MARKET_URL'),
  auth: requiredOrigin('SMOKE_AUTH_URL'),
  ml: requiredOrigin('SMOKE_ML_URL'),
  frontend: requiredOrigin('SMOKE_FRONTEND_URL'),
};

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function checkString(value, field) {
  check(typeof value === 'string' && value.length > 0, `${field} must be a non-empty string`);
}

function checkNumber(value, field) {
  check(typeof value === 'number' && Number.isFinite(value), `${field} must be a finite number`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function timedFetch(url, init = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function parseJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label}: response was not valid JSON`);
  }
}

async function requestJson(label, origin, path, expectedStatus, init = {}) {
  const response = await timedFetch(new URL(path, origin), init);
  const body = await parseJson(response, label);
  if (response.status !== expectedStatus) {
    const code = typeof body?.error?.code === 'string' ? ` (${body.error.code})` : '';
    throw new Error(
      `${label}: expected HTTP ${expectedStatus}, received ${response.status}${code}`,
    );
  }
  return { response, body };
}

async function waitForHealth(label, origin, service) {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  let lastFailure = 'no response received';

  while (Date.now() < deadline) {
    try {
      const response = await timedFetch(new URL('/health', origin));
      if (response.ok) {
        const body = await parseJson(response, `${label} health`);
        if (body?.status === 'ok' && body?.service === service) {
          console.log(`smoke: ${label} is ready`);
          return;
        }
        lastFailure = 'health body did not match the service contract';
      } else {
        lastFailure = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await delay(RETRY_INTERVAL_MS);
  }

  throw new Error(`${label} did not become ready: ${lastFailure}`);
}

async function waitForFrontend() {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  let lastFailure = 'no response received';

  while (Date.now() < deadline) {
    try {
      const response = await timedFetch(new URL('/', origins.frontend));
      if (response.ok) {
        const html = await response.text();
        if (/<div\s+id=["']root["']><\/div>/.test(html)) {
          console.log('smoke: frontend is ready');
          return html;
        }
        lastFailure = 'HTML did not contain the application root';
      } else {
        lastFailure = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await delay(RETRY_INTERVAL_MS);
  }

  throw new Error(`frontend did not become ready: ${lastFailure}`);
}

async function checkFrontendAssets(html) {
  const assetPaths = [
    ...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g),
  ].map((match) => match[1]);
  const uniqueAssets = [...new Set(assetPaths)];
  check(uniqueAssets.length >= 2, 'frontend must reference at least one JS and one CSS asset');

  for (const asset of uniqueAssets) {
    const response = await timedFetch(new URL(asset, `${origins.frontend}/`));
    check(response.ok, `frontend asset ${new URL(asset, origins.frontend).pathname} returned HTTP ${response.status}`);
  }
  console.log(`smoke: frontend served ${uniqueAssets.length} entry assets`);
}

async function checkCors(label, origin, path, method, expectsCredentials) {
  const response = await timedFetch(new URL(path, origin), {
    method: 'OPTIONS',
    headers: {
      Origin: origins.frontend,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': 'content-type,authorization,idempotency-key',
    },
  });
  check(response.ok, `${label} CORS preflight returned HTTP ${response.status}`);
  check(
    response.headers.get('access-control-allow-origin') === origins.frontend,
    `${label} CORS preflight did not allow the configured frontend origin`,
  );
  if (expectsCredentials) {
    check(
      response.headers.get('access-control-allow-credentials') === 'true',
      `${label} CORS preflight did not allow credentials`,
    );
  }
  console.log(`smoke: ${label} CORS wiring is valid`);
}

async function checkPublicMarketJourney() {
  const { body: list } = await requestJson(
    'list securities',
    origins.market,
    '/securities?page=1&page_size=50',
    200,
  );
  check(Array.isArray(list?.data), 'list securities: data must be an array');
  check(list.data.length === 6, 'list securities: bundled sample must contain six securities');
  check(list?.meta?.total === 6, 'list securities: meta.total must be six');
  check(list?.meta?.as_of === '2025-01-10', 'list securities: unexpected sample as_of');
  check(
    list.data.some((security) => security?.symbol === 'COMB.N0000'),
    'list securities: COMB.N0000 was not returned',
  );

  const { body: detail } = await requestJson(
    'security detail',
    origins.market,
    '/securities/comb.n0000',
    200,
  );
  check(detail?.data?.symbol === 'COMB.N0000', 'security detail: symbol was not canonical');
  check(
    detail?.data?.latest?.trade_date === '2025-01-10',
    'security detail: unexpected latest sample date',
  );

  const { body: history } = await requestJson(
    'security OHLCV',
    origins.market,
    '/securities/COMB.N0000/ohlcv?timeframe=daily&from=2025-01-02&to=2025-01-10',
    200,
  );
  check(history?.data?.symbol === 'COMB.N0000', 'security OHLCV: unexpected symbol');
  check(history?.data?.timeframe === 'daily', 'security OHLCV: unexpected timeframe');
  check(history?.data?.from === '2025-01-02', 'security OHLCV: unexpected from bound');
  check(history?.data?.to === '2025-01-10', 'security OHLCV: unexpected to bound');
  check(Array.isArray(history?.data?.bars), 'security OHLCV: bars must be an array');
  check(history.data.bars.length > 0, 'security OHLCV: expected seeded bars');
  const dates = history.data.bars.map((bar) => bar.date);
  check(
    dates.every((date, index) => index === 0 || dates[index - 1] <= date),
    'security OHLCV: bars were not ordered ascending',
  );
  check(dates[0] === '2025-01-02', 'security OHLCV: unexpected first date');
  check(dates.at(-1) === '2025-01-10', 'security OHLCV: unexpected last date');

  console.log('smoke: seeded public market journey passed');
}

function jsonRequest(body, headers = {}) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

function bearer(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function checkAuthenticatedJourney() {
  const unique = randomUUID();
  const email = `compose-smoke-${unique}@example.lk`;
  const signup = await requestJson(
    'signup',
    origins.auth,
    '/auth/signup',
    201,
    jsonRequest({
      email,
      password: 'Correct-Horse-Battery-Staple-82!',
      display_name: 'Compose Smoke Investor',
    }),
  );
  checkString(signup.body?.data?.access_token, 'signup access_token');
  check(signup.body?.data?.user?.role === 'investor', 'signup user role must be investor');

  const setCookie = signup.response.headers.get('set-cookie');
  checkString(setCookie, 'signup Set-Cookie');
  const refreshCookie = setCookie.split(';', 1)[0];
  check(refreshCookie.startsWith('refresh_token='), 'signup did not set the refresh cookie');

  const refreshed = await requestJson(
    'refresh session',
    origins.auth,
    '/auth/refresh',
    200,
    { method: 'POST', headers: { Cookie: refreshCookie } },
  );
  checkString(refreshed.body?.data?.access_token, 'refresh access_token');
  const refreshedCookieHeader = refreshed.response.headers.get('set-cookie');
  checkString(refreshedCookieHeader, 'refresh Set-Cookie');
  check(
    refreshedCookieHeader.split(';', 1)[0] !== refreshCookie,
    'refresh cookie was not rotated',
  );
  const accessToken = refreshed.body.data.access_token;

  const { body: me } = await requestJson('current user', origins.auth, '/auth/me', 200, {
    headers: bearer(accessToken),
  });
  check(me?.data?.email === email, 'current user: email did not match signup');
  check(me?.data?.role === 'investor', 'current user: role must be investor');

  const unauthorized = await requestJson(
    'unauthenticated portfolio list',
    origins.auth,
    '/portfolios',
    401,
  );
  check(
    unauthorized.body?.error?.code === 'UNAUTHENTICATED',
    'unauthenticated portfolio list: unexpected error code',
  );
  checkString(unauthorized.body?.error?.trace_id, 'unauthenticated trace_id');

  const portfolioKey = `smoke-portfolio-${unique}`;
  const portfolioPayload = {
    name: 'Compose smoke portfolio',
    starting_capital: 1_000_000,
  };
  const portfolioHeaders = bearer(accessToken, { 'Idempotency-Key': portfolioKey });
  const created = await requestJson(
    'create portfolio',
    origins.auth,
    '/portfolios',
    201,
    jsonRequest(portfolioPayload, portfolioHeaders),
  );
  checkString(created.body?.data?.portfolio_id, 'portfolio_id');
  check(created.body?.data?.cash_balance === 1_000_000, 'portfolio opening cash was incorrect');
  const portfolioId = created.body.data.portfolio_id;

  const replayed = await requestJson(
    'replay portfolio creation',
    origins.auth,
    '/portfolios',
    201,
    jsonRequest(portfolioPayload, portfolioHeaders),
  );
  check(
    replayed.body?.data?.portfolio_id === portfolioId,
    'portfolio replay returned a different resource',
  );
  check(
    replayed.response.headers.get('idempotent-replayed') === 'true',
    'portfolio replay did not set Idempotent-Replayed',
  );

  const order = await requestJson(
    'submit cross-service order',
    origins.auth,
    `/portfolios/${portfolioId}/orders`,
    201,
    jsonRequest(
      { symbol: 'comb.n0000', side: 'buy', quantity: 10 },
      bearer(accessToken, { 'Idempotency-Key': `smoke-order-${unique}` }),
    ),
  );
  check(order.body?.data?.symbol === 'COMB.N0000', 'order symbol was not canonical');
  check(order.body?.data?.status === 'filled', 'cross-service order was not filled');
  check(order.body?.data?.filled_quantity === 10, 'order filled quantity was incorrect');
  check(order.body?.data?.fill?.fill_date === '2025-01-10', 'order used an unexpected market date');

  const authHeaders = { headers: bearer(accessToken) };
  const { body: positions } = await requestJson(
    'portfolio positions',
    origins.auth,
    `/portfolios/${portfolioId}/positions`,
    200,
    authHeaders,
  );
  check(Array.isArray(positions?.data), 'positions data must be an array');
  check(positions.data.length === 1, 'positions must contain one holding');
  check(positions.data[0]?.symbol === 'COMB.N0000', 'position symbol was unexpected');
  check(positions.data[0]?.quantity === 10, 'position quantity was unexpected');
  check(positions?.meta?.as_of === '2025-01-10', 'positions used an unexpected market date');

  const { body: cash } = await requestJson(
    'cash transactions',
    origins.auth,
    `/portfolios/${portfolioId}/cash-transactions`,
    200,
    authHeaders,
  );
  check(Array.isArray(cash?.data), 'cash transactions data must be an array');
  check(cash.data.length === 2, 'cash transactions must contain opening cash and buy debit');
  check(
    cash.data.some((transaction) => transaction?.type === 'buy_debit'),
    'cash transactions did not contain a buy debit',
  );

  const { body: summary } = await requestJson(
    'portfolio summary',
    origins.auth,
    `/portfolios/${portfolioId}/summary`,
    200,
    authHeaders,
  );
  const summaryData = summary?.data;
  for (const field of [
    'starting_capital',
    'cash_balance',
    'holdings_value',
    'total_equity',
    'total_pnl',
  ]) {
    checkNumber(summaryData?.[field], `portfolio summary ${field}`);
  }
  check(summaryData.as_of === '2025-01-10', 'portfolio summary used an unexpected market date');
  check(summaryData.cash_balance < summaryData.starting_capital, 'buy did not reduce portfolio cash');
  check(summaryData.holdings_value > 0, 'portfolio holdings value must be positive');
  check(
    Math.abs(summaryData.total_equity - (summaryData.cash_balance + summaryData.holdings_value)) <
      0.0001,
    'portfolio total equity did not reconcile',
  );
  check(
    Math.abs(summaryData.total_pnl - (summaryData.total_equity - summaryData.starting_capital)) <
      0.0001,
    'portfolio total P/L did not reconcile',
  );

  console.log('smoke: authenticated cross-service journey passed');
}

async function main() {
  await Promise.all([
    waitForHealth('market-trading', origins.market, 'market-trading'),
    waitForHealth('identity-auth', origins.auth, 'identity-auth'),
    waitForHealth('ml-prediction', origins.ml, 'ml-prediction'),
  ]);
  const frontendHtml = await waitForFrontend();

  await checkFrontendAssets(frontendHtml);
  await checkCors('market-trading', origins.market, '/securities', 'GET', false);
  await checkCors('identity-auth', origins.auth, '/auth/signup', 'POST', true);
  await checkPublicMarketJourney();
  await checkAuthenticatedJourney();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`smoke: FAIL: ${message}`);
  process.exitCode = 1;
});
