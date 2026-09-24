import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "../../test/render";
import { server } from "../../test/server";
import { dataCoverageFixture } from "../../test/fixtures/data-coverage";
import { aspiValuesFixture } from "../../test/fixtures/indices";
import i18n from "../../i18n";
import { DataGap } from "../../lib/data-gaps";
import { IndexDetailPage } from "./IndexDetailPage";

const t = i18n.t.bind(i18n);

function renderPage(path = "/markets/index/ASPI") {
  return renderWithProviders(
    <Routes>
      <Route path="/markets/index/:code" element={<IndexDetailPage />} />
    </Routes>,
    { initialEntries: [path] },
  );
}

describe("IndexDetailPage", () => {
  it("renders the index's latest close, change, and a chart", async () => {
    renderPage();

    // The same close also appears in the chart's sr-only accessible table,
    // so both matches are real, not a duplicate-rendering bug.
    expect(await screen.findAllByText("15,736.91")).not.toHaveLength(0);
    expect(screen.getByText("All Share Price Index")).toBeInTheDocument();
    expect(screen.getByText(/-87.40/)).toBeInTheDocument();
    // The chart itself waits on coverage settling before its own query
    // fires (see "default range avoiding a missing_data gap" below), so it
    // can still be loading at this point.
    expect(await screen.findByRole("group")).toBeInTheDocument();
  });

  it("accepts a lowercase code in the URL", async () => {
    renderPage("/markets/index/aspi");

    expect(await screen.findAllByText("15,736.91")).not.toHaveLength(0);
  });

  it("shows a not-found state for a code the API never returned", async () => {
    renderPage("/markets/index/NOPE");

    expect(
      await screen.findByText(t("markets.indices.notFound.title")),
    ).toBeInTheDocument();
  });

  it("reports its own failure without claiming the whole page is down", async () => {
    server.use(
      http.get("*/indices", () =>
        HttpResponse.json(
          { error: { code: "INTERNAL", message: "boom", trace_id: "t1" } },
          { status: 500 },
        ),
      ),
    );

    renderPage();

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("still renders a chart after switching to the weekly timeframe", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("15,736.91");
    await user.click(
      screen.getByRole("radio", { name: t("securityDetail.timeframes.weekly") }),
    );

    expect(await screen.findByRole("group")).toBeInTheDocument();
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
              indices: { ...dataCoverageFixture.indices, gaps: [gap] },
            },
          }),
        ),
      );
      const requests: URL[] = [];
      server.use(
        http.get("*/indices/:code/values", ({ request }) => {
          requests.push(new URL(request.url));
          return HttpResponse.json({ data: aspiValuesFixture });
        }),
      );

      renderPage();
      await screen.findByRole("group");

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
        http.get("*/indices/:code/values", ({ request }) => {
          requests.push(new URL(request.url));
          return HttpResponse.json({ data: aspiValuesFixture });
        }),
      );

      renderPage();
      await screen.findByRole("group");

      expect(requests).toHaveLength(1);
      expect(requests[0].searchParams.has("from")).toBe(false);
      expect(requests[0].searchParams.has("to")).toBe(false);
    });

    it("keeps the API's own default when the coverage request fails", async () => {
      server.use(http.get("*/coverage", () => HttpResponse.error()));
      const requests: URL[] = [];
      server.use(
        http.get("*/indices/:code/values", ({ request }) => {
          requests.push(new URL(request.url));
          return HttpResponse.json({ data: aspiValuesFixture });
        }),
      );

      renderPage();
      await screen.findByRole("group");

      expect(requests).toHaveLength(1);
      expect(requests[0].searchParams.has("from")).toBe(false);
      expect(requests[0].searchParams.has("to")).toBe(false);
    });
  });
});
