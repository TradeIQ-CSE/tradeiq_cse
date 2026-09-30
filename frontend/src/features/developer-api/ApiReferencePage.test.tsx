import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, within } from "@/test/render";
import { ApiReferencePage } from "./ApiReferencePage";
import {
  ENDPOINTS,
  referenceDocument,
  requestSnippet,
  schemaFields,
  schemaType,
  operationExamples,
} from "./reference-model";
import i18n from "@/i18n";

describe("Public API reference", () => {
  it('renders an array of union items and generated response enum constraints', () => {
    expect(schemaType({ type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number', nullable: true }] } })).toBe('(string | number | null)[]');
    renderWithProviders(<ApiReferencePage />);
    const ohlcv = within(document.getElementById('get-ohlcv')!);
    expect(ohlcv.getByText('(DailyBar | AggregateBar)[]')).toBeInTheDocument();
    expect(ohlcv.getByText('Allowed values: daily / weekly / monthly.')).toBeInTheDocument();
    expect(within(document.getElementById('get-security')!).getByText('Allowed values: listed / suspended / delisted.')).toBeInTheDocument();
    expect(within(document.getElementById('errors')!).getByText('Allowed values: UNAUTHENTICATED.')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Fields for Rate-limit error' })).toBeInTheDocument();
    expect(within(document.getElementById('errors')!).getByText('Per-key quota error | Per-IP rate-limit error')).toBeInTheDocument();
    expect(document.getElementById('reference-main')!.textContent).not.toMatch(/Redis|drift in CI|internal UUIDs|adjusted_close|RateLimitedErrorBody/);
  });
  it('changes paired request and response together for aggregate/null/empty worked examples', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ApiReferencePage />);
    const ohlcv = within(document.getElementById('get-ohlcv')!);
    await user.click(ohlcv.getByRole('button', { name: 'Partial week' }));
    expect(ohlcv.getByText(/curl --fail-with-body/)).toHaveTextContent('timeframe=weekly');
    expect(ohlcv.getByText(/"bars":/)).toHaveTextContent('"period_start": "2025-01-02"');
    expect(ohlcv.getByText(/"bars":/)).toHaveTextContent('"page_size": 500');
    await user.click(ohlcv.getByRole('button', { name: 'Empty range' }));
    expect(ohlcv.getByText(/"bars":/)).toHaveTextContent('"bars": []');
    expect(ohlcv.getByText(/"bars":/)).toHaveTextContent('"total": 0');
    for (const endpoint of ENDPOINTS) {
      for (const [key, example] of Object.entries(operationExamples(endpoint))) {
        expect(requestSnippet(endpoint, 'curl', key)).toContain(`https://tradeiqcse.tech/api/public/v1${example['x-request']}`);
      }
    }
  });

  it("renders all six operations, generated bounds and nullable daily/aggregate fields without a session", () => {
    const { container } = renderWithProviders(<ApiReferencePage />, {
      auth: { status: "anonymous" },
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "API reference" }),
    ).toBeInTheDocument();
    for (const endpoint of ENDPOINTS)
      expect(container.querySelector(`#${endpoint.id}`)).toBeInTheDocument();
    const security = within(
      container.querySelector("#get-security") as HTMLElement,
    );
    expect(
      security.getByText(/Min length: 1.*Max length: 20/),
    ).toBeInTheDocument();
    const ohlcv = within(container.querySelector("#get-ohlcv") as HTMLElement);
    expect(ohlcv.getByText("data.bars[] (1).open")).toBeInTheDocument();
    expect(ohlcv.getByText("data.bars[] (2).period_start")).toBeInTheDocument();
    expect(ohlcv.getAllByText("number | null").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/tiq_[A-Za-z0-9]{40}/);
    for (const link of screen.getAllByRole("link", {
      name: "Manage your API key",
    }))
      expect(link).toHaveAttribute("href", "/api-key");
    expect(
      screen.getByRole("link", { name: "Interactive explorer" }),
    ).toHaveAttribute("href", "http://localhost:3001/public/v1/docs");
  });

  it("switches request language for the chosen endpoint and copies that request", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ApiReferencePage />);
    const scope = within(document.getElementById("get-security")!);
    await user.click(scope.getByRole("radio", { name: "JavaScript" }));
    expect(scope.getByText(/const response = await fetch/)).toHaveTextContent(
      "/securities/COMB.N0000",
    );
    expect(scope.getByText(/const response = await fetch/)).toHaveTextContent(
      "if (!response.ok)",
    );
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    await user.click(
      scope.getByRole("button", {
        name: "Copy request for /public/v1/securities/{symbol}",
      }),
    );
    expect(write).toHaveBeenCalledWith(
      requestSnippet(ENDPOINTS[1], "javascript"),
    );
  });

  it("opens and closes mobile contents and exposes stable operation anchors", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ApiReferencePage />);
    const toggle = screen.getByRole("button", { name: "On this page" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const nav = within(document.getElementById("reference-mobile-contents")!);
    await user.click(nav.getByRole("link", { name: "End-of-day data" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen
        .getAllByRole("link", { name: "End-of-day data" })
        .some((link) => link.getAttribute("href") === "#get-eod"),
    ).toBe(true);
  });

  it('provides syntactically valid JavaScript requests for all six resources', () => {
    for (const endpoint of ENDPOINTS) {
      expect(() => new Function(`return async function() { ${requestSnippet(endpoint, 'javascript')} }`)).not.toThrow();
      expect(requestSnippet(endpoint, 'curl')).toContain('--fail-with-body');
      expect(requestSnippet(endpoint, 'python')).toContain('response.raise_for_status()');
    }
  });

  it("has Sinhala guides while keeping source-generated technical descriptions labelled", async () => {
    await i18n.changeLanguage("si");
    const { container } = renderWithProviders(<ApiReferencePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "API යොමුව" }),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("apiReference.");
    expect(container.querySelector('[lang="en"]')).toBeInTheDocument();
  });

  it("expands every public success/error schema without losing nullability", () => {
    for (const endpoint of ENDPOINTS) {
      const operation = referenceDocument.paths[endpoint.path].get;
      for (const response of Object.values(operation.responses)) {
        const schema = response.content?.["application/json"].schema;
        if (schema) expect(schemaFields(schema).length).toBeGreaterThan(0);
      }
    }
    expect(
      schemaFields(
        referenceDocument.components.schemas.PublicSecuritySchema,
      ).find((f) => f.name === "shares_outstanding")?.type,
    ).toBe("integer | null");
  });
});
