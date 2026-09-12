import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { server } from "../../test/server";
import { renderWithProviders, screen, waitFor } from "../../test/render";
import {
  filledOrderFixture,
  ordersListFixture,
  portfolioFixture,
  rejectedOrderFixture,
} from "../../test/fixtures/paper-trading";
import * as queryKeys from "./queryKeys";
import { OrdersTable } from "./OrdersTable";

const t = i18n.t.bind(i18n);
const portfolioId = portfolioFixture.portfolio_id;

function ordersListResponse(data = ordersListFixture) {
  return HttpResponse.json({
    data,
    meta: { page: 1, page_size: 50, total: data.length },
  });
}

describe("OrdersTable", () => {
  // Issue #40, case 10: the same code, worded through the same map the
  // ticket used at submit time (order-messages.ts) — never re-derived here.
  it("shows a rejected order with its reason in the history table", async () => {
    server.use(
      http.get("*/portfolios/:portfolioId/orders", () => ordersListResponse()),
    );

    renderWithProviders(<OrdersTable portfolioId={portfolioId} />);

    const symbolCell = await screen.findByText(rejectedOrderFixture.symbol);
    const reasonNode = await screen.findByText(
      t("orders.codes.insufficientCash"),
    );
    expect(reasonNode).toHaveAttribute("role", "status");

    // "Rejected" also appears as a <option> in the status filter — scope to
    // this row's status badge rather than matching either occurrence.
    const row = symbolCell.closest("tr");
    if (!row) throw new Error("order row not found");
    expect(row.querySelector('[data-status="rejected"]')).toHaveTextContent(
      t("orders.status.rejected"),
    );
  });

  // Issue #40, case 7.
  it("fetches an order once on expand and serves a re-expand from cache", async () => {
    let detailCalls = 0;
    server.use(
      http.get("*/portfolios/:portfolioId/orders", () => ordersListResponse()),
      http.get("*/portfolios/:portfolioId/orders/:orderId", () => {
        detailCalls += 1;
        return HttpResponse.json({ data: filledOrderFixture });
      }),
    );

    // createTestQueryClient() (test/render.ts) deliberately zeroes staleTime
    // for fast error-path tests elsewhere; that would make a *remount*
    // refetch on every re-expand (OrderDetail is unmounted, not just
    // hidden, while collapsed — see OrdersTable.tsx). Mirroring main.tsx's
    // real staleTime here is what actually exercises "served from cache",
    // not just "happens not to refetch inside one mount".
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 15_000 } },
    });

    renderWithProviders(<OrdersTable portfolioId={portfolioId} />, {
      queryClient,
    });
    const user = userEvent.setup({ delay: null });

    await screen.findByText(filledOrderFixture.symbol);
    const expandButtons = screen.getAllByRole("button", {
      name: t("orders.expand"),
    });
    await user.click(expandButtons[0]);

    expect(
      await screen.findByText(t("orders.detail.price")),
    ).toBeInTheDocument();
    await waitFor(() => expect(detailCalls).toBe(1));

    await user.click(
      screen.getByRole("button", { name: t("orders.detail.close") }),
    );
    expect(
      screen.queryByText(t("orders.detail.price")),
    ).not.toBeInTheDocument();

    // Both rows now read "Show details" again — re-expand the same (first) row.
    await user.click(
      screen.getAllByRole("button", { name: t("orders.expand") })[0],
    );
    expect(
      await screen.findByText(t("orders.detail.price")),
    ).toBeInTheDocument();

    // Give a would-be background refetch a chance to land before asserting
    // the call count stayed put.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(detailCalls).toBe(1);
  });

  // Issue #40, case 8.
  it("gives each status filter value its own cache entry", async () => {
    server.use(
      http.get("*/portfolios/:portfolioId/orders", () => ordersListResponse()),
    );

    const { queryClient } = renderWithProviders(
      <OrdersTable portfolioId={portfolioId} />,
    );
    const user = userEvent.setup({ delay: null });

    await screen.findByText(filledOrderFixture.symbol);

    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`${t("orders.filter.label")}$`),
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: t("orders.status.filled") }),
    );
    await waitFor(() =>
      expect(
        queryClient.getQueryCache().find({
          queryKey: [...queryKeys.orders(portfolioId, "filled", 1)],
          exact: true,
        }),
      ).toBeTruthy(),
    );

    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`${t("orders.filter.label")}$`),
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: t("orders.status.rejected") }),
    );
    await waitFor(() =>
      expect(
        queryClient.getQueryCache().find({
          queryKey: [...queryKeys.orders(portfolioId, "rejected", 1)],
          exact: true,
        }),
      ).toBeTruthy(),
    );

    const entries = queryClient.getQueryCache().getAll();
    const cachedKeys = entries.map((entry) => entry.queryKey);
    expect(cachedKeys).toEqual(
      expect.arrayContaining([
        [...queryKeys.orders(portfolioId, undefined, 1)],
        [...queryKeys.orders(portfolioId, "filled", 1)],
        [...queryKeys.orders(portfolioId, "rejected", 1)],
      ]),
    );
  });
});
