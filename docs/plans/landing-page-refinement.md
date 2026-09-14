# Landing page refinement

Date: 2026-09-07
Branch: `nimesh/landing-page-refinement`
Base: `87dd335` on `nimesh/tiq-61-order-ticket`, as requested for this follow-up.
Worktree: `.worktrees/tradeiq-landing` relative to the workspace root.

## Direction

Build on the existing BoardUI refresh and Markets reference. The original
`frontend-boardui-refresh.md` remains in the source checkout as an untracked
planning document; its initial rollout constraints describe the earlier refresh.
This follow-up is centred on the public landing page, with the shared brand mark
and dark semantic palette deliberately flowing into the app shell so the
transition to Markets does not feel like a different product.

- Keep the original Figma copy hierarchy and heavier shared Inter type ramp,
  using the supplied market video as an autoplaying, looping hero backdrop.
  Contain the video in the same max-width rounded panel geometry as the product
  sections, with the shared theme-aware blue gradient visible around it.
- Carry the hero's rounded liquid-glass treatment into the market, workspace,
  backtesting, CTA, navigation and footer surfaces with semantic BoardUI tokens.
- Place the post-hero product sections over a restrained, CSS-only aurora field
  adapted from the Aceternity registry component. It uses the same navy and
  blue family as the product theme, switches to pale blue, ice and white
  glass in light mode, keeps the hero's exact 64% navy glass recipe in dark
  mode, and becomes static for reduced-motion users. The background uses three
  bounded fields animated only with transforms and opacity; nested cards retain
  the glass visual recipe without recursive backdrop blur.
- Use BoardUI `ButtonLink`, `LinkButton`, `Chip`, and Remix Icon conventions for
  landing actions instead of one-off button and text-link styling.
- Centralise the TradeIQ mark and use it in the landing header/footer, product
  preview, and application sidebar.
- Keep the landing preview synchronous with five fixed, clearly labelled sample
  rows. Markets remains API-backed; the public page makes no securities request
  and claims no live session date. Do not invent charts, model predictions or
  investment performance.
- Use a restrained white/slate light theme and extend the landing's navy,
  blue-slate dark palette through global semantic tokens to Markets and the
  other shell pages.

## Validation

- TypeScript, full frontend ESLint and production build passed.
- 42 test files / 253 tests passed, including three synchronous market-preview
  tests and three video playback/reduced-motion tests.
- With the installed Node 22, tests require
  `NODE_OPTIONS=--no-experimental-webstorage ./node_modules/.bin/vitest run`.
  Otherwise test cleanup sees Node's experimental localStorage instead of jsdom's.
- Browser review covered desktop, 768px tablet and 360px mobile, light and dark
  landing modes, section anchors, the labelled sample state, and Markets with
  the shared navy palette and product mark.
- The build reports a shared chunk above 500 kB. The free BoardUI `link-button`
  source component was added through the BoardUI MCP; it required no new npm
  package. The Aceternity aurora primitive was added through its shadcn registry
  and adapted without retaining the demo-only Motion dependency.

## Local preview

The review server runs at `http://127.0.0.1:5176/`. Its temporary config is
`/private/tmp/tradeiq-landing-preview.config.mts`; it proxies public market API
requests to the existing service on port 3001 because the alternate frontend
origin is outside the normal API CORS allowlist. This is a development-only
configuration; deployment and application API settings are unchanged.

The hot-reload process is registered as the user-scoped macOS service
`com.openai.tradeiq-landing-preview`, so it survives terminal/tool sessions. It
can be stopped with `launchctl remove com.openai.tradeiq-landing-preview`.

Existing dependencies are linked from the original checkout. No commits,
pushes or remote issue/PR changes were made.
