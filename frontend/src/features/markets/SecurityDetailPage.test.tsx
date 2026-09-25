import { describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useNavigate } from "react-router-dom";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "../../test/render";
import { server } from "../../test/server";
import {
  dailyOhlcvFixture,
  securityDetailFixture,
} from "../../test/fixtures/security-detail";
import { dataCoverageFixture } from "../../test/fixtures/data-coverage";
import i18n from "../../i18n";
import { setMobileViewport } from "../../test/setup";
import { DataGap } from "../../lib/data-gaps";
import { SecurityDetailPage } from "./SecurityDetailPage";

const t = i18n.t.bind(i18n);

function chipDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

async function openDateRange(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole("button", {
    name: t("securityDetail.range.label"),
  });
  await user.click(trigger);
  return {
    trigger,
    from: screen.getByLabelText(t("securityDetail.range.from")),
    to: screen.getByLabelText(t("securityDetail.range.to")),
  };
}

function editChip(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

function renderPage(path = "/markets/jkh.n0000") {
  return renderWithProviders(
    <Routes>
      <Route path="/markets/:symbol" element={<SecurityDetailPage />} />
    </Routes>,
    { initialEntries: [path] },
  );
}

function DetailWithNavigation() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/markets/COMB.N0000")}>
        Open COMB
      </button>
      <SecurityDetailPage />
    </>
  );
}

describe("SecurityDetailPage", () => {
  it("renders not found without requesting data for an encoded blank symbol", () => {
    let detailRequests = 0;
    server.use(
      http.get("*/securities/:symbol", () => {
        detailRequests += 1;
        return HttpResponse.json({ data: securityDetailFixture });
      }),
    );

    renderPage("/markets/%20");

    expect(
      screen.getByRole("heading", { name: "This company was not found" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: t("securityDetail.states.loading"),
      }),
    ).not.toBeInTheDocument();
    expect(detailRequests).toBe(0);
  });

  it("loads a lowercase URL and renders the API canonical symbol and real detail values", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: securityDetailFixture.symbol,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(securityDetailFixture.company_name),
    ).toBeInTheDocument();
    expect(screen.getByText("Consumer Discretionary")).toBeInTheDocument();
    expect(screen.getByText("871,355,047")).toBeInTheDocument();
    const rangeTrigger = screen.getByRole("button", {
      name: t("securityDetail.range.label"),
    });
    // The trigger offers to open the picker rather than naming the range: the
    // chart pans and zooms, so dates on the button would soon disagree with
    // the bars on screen. The loaded range is stated above the chart instead.
    //
    // Wait on the range text, not on the trigger: the placeholder is there
    // from the first render, so waiting for it would pass before the query
    // resolves and prove nothing.
    await waitFor(() =>
      expect(
        screen.getByText(
          t("securityDetail.chart.range", {
            from: "Sep 2, 2025",
            to: "Sep 2, 2026",
          }),
        ),
      ).toBeInTheDocument(),
    );
    expect(rangeTrigger).toHaveTextContent(
      t("securityDetail.range.placeholder"),
    );
    const { from, to } = await openDateRange(user);
    expect(from).toHaveValue(chipDate(dailyOhlcvFixture.from!));
    expect(to).toHaveValue(chipDate(dailyOhlcvFixture.to!));
    expect(
      await screen.findByRole("table", {
        name: t("securityDetail.chart.accessibleLabel", {
          symbol: "JKH.N0000",
          timeframe: t("securityDetail.timeframes.daily"),
        }),
      }),
    ).toBeInTheDocument();
  });

  it("labels the close-price fallback when the daily source cannot form real candles", async () => {
    const bars = Array.from({ length: 20 }, (_, index) => ({
      date: `2025-01-${String(index + 1).padStart(2, "0")}`,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100 + index,
      adjusted_close: null,
      volume: 1_000 + index,
    }));
    server.use(
      http.get("*/securities/:symbol/ohlcv", () =>
        HttpResponse.json({
          data: {
            symbol: "JKH.N0000",
            timeframe: "daily",
            from: "2025-01-01",
            to: "2025-01-31",
            bars,
          },
        }),
      ),
    );

    renderPage();

    expect(
      await screen.findByText(t("securityDetail.chart.legend.closePrice")),
    ).toBeInTheDocument();
    // The explanation sits in the "i" next to the legend.
    expect(
      screen.getByRole("button", {
        name: `More about ${t("securityDetail.chart.legend.closePrice")}`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", {
        name: t("securityDetail.chart.accessibleCloseLabel", {
          symbol: "JKH.N0000",
          timeframe: t("securityDetail.timeframes.daily"),
        }),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(t("securityDetail.chart.legend.up")),
    ).not.toBeInTheDocument();
  });

  it("shows one calendar month at a time on a narrow viewport", async () => {
    setMobileViewport();
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("table", {
      name: t("securityDetail.chart.accessibleLabel", {
        symbol: "JKH.N0000",
        timeframe: t("securityDetail.timeframes.daily"),
      }),
    });
    await openDateRange(user);

    const picker = screen.getByRole("dialog", {
      name: t("securityDetail.range.label"),
    });
    expect(within(picker).getAllByRole("grid")).toHaveLength(1);
  });

  it("renders nullable latest price and ratios without inventing values", async () => {
    server.use(
      http.get("*/securities/:symbol", () =>
        HttpResponse.json({
          data: {
            ...securityDetailFixture,
            latest: null,
            ratios: null,
          },
        }),
      ),
    );
    renderPage();

    expect(
      await screen.findByText(t("securityDetail.states.noLatestPrice")),
    ).toBeInTheDocument();
    const peItem = screen.getByText(
      t("securityDetail.info.peRatio"),
    ).parentElement;
    const pbItem = screen.getByText(
      t("securityDetail.info.pbRatio"),
    ).parentElement;
    expect(peItem).toHaveTextContent("—");
    expect(pbItem).toHaveTextContent("—");
  });

  it("sends committed dates exactly and retains them across timeframe changes", async () => {
    const user = userEvent.setup();
    const requests: URL[] = [];
    server.use(
      http.get("*/securities/:symbol/ohlcv", ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        return HttpResponse.json({
          data: {
            ...dailyOhlcvFixture,
            timeframe: url.searchParams.get("timeframe") ?? "daily",
            from: url.searchParams.get("from") ?? dailyOhlcvFixture.from,
            to: url.searchParams.get("to") ?? dailyOhlcvFixture.to,
          },
        });
      }),
    );
    renderPage();

    await screen.findByRole("table");
    const { from, to } = await openDateRange(user);
    editChip(from, "01/08/2026");
    editChip(to, "31/08/2026");
    await user.click(
      screen.getByRole("button", { name: t("securityDetail.actions.apply") }),
    );

    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get("from")).toBe("2026-08-01");
      expect(requests.at(-1)?.searchParams.get("to")).toBe("2026-08-31");
    });

    await user.click(
      // BoardUI's SegmentedControl is a radiogroup, so each timeframe is a
      // radio rather than a toggle button.
      screen.getByRole("radio", {
        name: t("securityDetail.timeframes.weekly"),
      }),
    );
    await waitFor(() => {
      const last = requests.at(-1);
      expect(last?.searchParams.get("timeframe")).toBe("weekly");
      expect(last?.searchParams.get("from")).toBe("2026-08-01");
      expect(last?.searchParams.get("to")).toBe("2026-08-31");
    });

    await user.click(
      screen.getByRole("button", { name: t("securityDetail.actions.reset") }),
    );
    await waitFor(() => {
      const last = requests.at(-1);
      expect(last?.searchParams.get("timeframe")).toBe("weekly");
      expect(last?.searchParams.has("from")).toBe(false);
      expect(last?.searchParams.has("to")).toBe(false);
    });
  });

  it("normalizes reversed manual dates before refetching", async () => {
    const user = userEvent.setup();
    const requests: URL[] = [];
    server.use(
      http.get("*/securities/:symbol/ohlcv", ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json({ data: dailyOhlcvFixture });
      }),
    );
    renderPage();
    await screen.findByRole("table");
    await waitFor(() => expect(requests).toHaveLength(1));
    const { from, to } = await openDateRange(user);

    editChip(from, "31/08/2026");
    editChip(to, "01/08/2026");
    await user.click(
      screen.getByRole("button", { name: t("securityDetail.actions.apply") }),
    );

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests.at(-1)?.searchParams.get("from")).toBe("2026-08-01");
    expect(requests.at(-1)?.searchParams.get("to")).toBe("2026-08-01");
  });

  it("resets timeframe and range defaults when the route symbol changes", async () => {
    const user = userEvent.setup();
    const requests: URL[] = [];
    server.use(
      http.get("*/securities/:symbol/ohlcv", ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json({ data: dailyOhlcvFixture });
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/markets/:symbol" element={<DetailWithNavigation />} />
      </Routes>,
      { initialEntries: ["/markets/JKH.N0000"] },
    );

    await screen.findByRole("table");
    const { from, to } = await openDateRange(user);
    editChip(from, "01/08/2026");
    editChip(to, "31/08/2026");
    await user.click(
      screen.getByRole("button", { name: t("securityDetail.actions.apply") }),
    );
    await user.click(
      screen.getByRole("radio", {
        name: t("securityDetail.timeframes.monthly"),
      }),
    );
    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get("timeframe")).toBe("monthly");
    });

    await user.click(screen.getByRole("button", { name: "Open COMB" }));
    await waitFor(() => {
      const combRequest = requests.find((request) =>
        request.pathname.includes("/COMB.N0000/ohlcv"),
      );
      expect(combRequest?.searchParams.get("timeframe")).toBe("daily");
      expect(combRequest?.searchParams.has("from")).toBe(false);
      expect(combRequest?.searchParams.has("to")).toBe(false);
    });
  });

  it("renders structured server field errors beside the range controls", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/securities/:symbol/ohlcv", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.has("from")) {
          return HttpResponse.json(
            {
              error: {
                code: "VALIDATION_FAILED",
                message: "Request validation failed.",
                fields: [{ field: "from", reason: "must be a trading date" }],
                trace_id: "trace-fields",
              },
            },
            { status: 400 },
          );
        }
        return HttpResponse.json({ data: dailyOhlcvFixture });
      }),
    );
    renderPage();
    await screen.findByRole("table");
    const { from, to } = await openDateRange(user);
    editChip(from, "01/08/2026");
    editChip(to, "31/08/2026");
    await user.click(
      screen.getByRole("button", { name: t("securityDetail.actions.apply") }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "from: must be a trading date",
    );
    expect(
      screen.getByText(t("securityDetail.chart.validationFailed")),
    ).toBeInTheDocument();
  });

  it("keeps security details visible when the chart service fails and offers retry", async () => {
    server.use(
      http.get("*/securities/:symbol/ohlcv", () =>
        HttpResponse.json(
          {
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              message: "OHLCV storage is temporarily unavailable.",
              trace_id: "trace-chart",
            },
          },
          { status: 503 },
        ),
      ),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: securityDetailFixture.symbol,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("OHLCV storage is temporarily unavailable."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t("securityDetail.actions.retry") }),
    ).toBeInTheDocument();
  });

  it("explains a valid empty range without substituting fixture bars", async () => {
    server.use(
      http.get("*/securities/:symbol/ohlcv", () =>
        HttpResponse.json({
          data: { ...dailyOhlcvFixture, bars: [] },
        }),
      ),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: t("securityDetail.chart.empty.title"),
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows distinct detail loading, not-found, and unavailable states", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("*/securities/:symbol", async () => {
        await gate;
        return HttpResponse.json({ data: securityDetailFixture });
      }),
    );
    const loadingView = renderPage();
    expect(
      await screen.findByRole("heading", {
        name: t("securityDetail.states.loading"),
      }),
    ).toBeInTheDocument();
    release();
    await screen.findByRole("heading", { name: securityDetailFixture.symbol });
    loadingView.unmount();

    server.use(
      http.get("*/securities/:symbol", () =>
        HttpResponse.json(
          {
            error: {
              code: "SECURITY_NOT_FOUND",
              message: "Security not found.",
              trace_id: "trace-404",
            },
          },
          { status: 404 },
        ),
      ),
    );
    const notFoundView = renderPage("/markets/nope.n0000");
    expect(
      await screen.findByRole("heading", { name: "nope.n0000 was not found" }),
    ).toBeInTheDocument();
    notFoundView.unmount();

    server.use(http.get("*/securities/:symbol", () => HttpResponse.error()));
    renderPage();
    const unavailable = await screen.findByRole("heading", {
      name: t("securityDetail.states.unavailable.title"),
    });
    expect(unavailable).toBeInTheDocument();
    const state = unavailable.closest('[role="alert"]');
    expect(state).not.toBeNull();
    expect(
      within(state as HTMLElement).getByRole("button", {
        name: t("securityDetail.actions.retry"),
      }),
    ).toBeInTheDocument();
  });

  describe("default range avoiding a missing_data gap", () => {
    it("opens on the latest full year with no gap when coverage reports one crossing the trailing year", async () => {
      const gap: DataGap = {
        from: "2026-01-01",
        to: "2026-12-31",
        sessions: 150,
        kind: "missing_data",
      };
      server.use(
        http.get("*/coverage", () =>
          HttpResponse.json({
            data: {
              ...dataCoverageFixture,
              prices: { ...dataCoverageFixture.prices, gaps: [gap] },
            },
          }),
        ),
      );
      const requests: URL[] = [];
      server.use(
        http.get("*/securities/:symbol/ohlcv", ({ request }) => {
          requests.push(new URL(request.url));
          return HttpResponse.json({ data: dailyOhlcvFixture });
        }),
      );

      renderPage();
      await screen.findByRole("table");

      // Exactly one request, and it already carries the gap-avoiding dates:
      // no earlier request with the plain API default, which would be the
      // flash/double-fetch this is meant to avoid.
      expect(requests).toHaveLength(1);
      expect(requests[0].searchParams.get("from")).toBe("2025-01-01");
      expect(requests[0].searchParams.get("to")).toBe("2025-12-31");
    });

    it("keeps the API's own default when coverage reports no missing_data gap", async () => {
      const requests: URL[] = [];
      server.use(
        http.get("*/securities/:symbol/ohlcv", ({ request }) => {
          requests.push(new URL(request.url));
          return HttpResponse.json({ data: dailyOhlcvFixture });
        }),
      );

      renderPage();
      await screen.findByRole("table");

      expect(requests).toHaveLength(1);
      expect(requests[0].searchParams.has("from")).toBe(false);
      expect(requests[0].searchParams.has("to")).toBe(false);
    });

    it("keeps the API's own default when the coverage request fails", async () => {
      server.use(http.get("*/coverage", () => HttpResponse.error()));
      const requests: URL[] = [];
      server.use(
        http.get("*/securities/:symbol/ohlcv", ({ request }) => {
          requests.push(new URL(request.url));
          return HttpResponse.json({ data: dailyOhlcvFixture });
        }),
      );

      renderPage();
      await screen.findByRole("table");

      expect(requests).toHaveLength(1);
      expect(requests[0].searchParams.has("from")).toBe(false);
      expect(requests[0].searchParams.has("to")).toBe(false);
    });
  });
});
