import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "../../test/render";
import { server } from "../../test/server";
import i18n from "../../i18n";
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
    expect(screen.getByRole("group")).toBeInTheDocument();
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
});
