import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { renderWithProviders, screen } from "../../test/render";
import { MarketTerm } from "./market-term";

const t = i18n.t.bind(i18n);

describe("MarketTerm", () => {
  it("reveals a simple definition on focus and exposes it to assistive technology", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketTerm term="volume" />);

    const trigger = screen.getByRole("button", {
      name: t("marketTerms.explain", {
        term: t("marketTerms.volume.label"),
      }),
    });
    await user.tab();
    expect(trigger).toHaveFocus();

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(t("marketTerms.volume.label"));
    expect(tooltip).toHaveTextContent(t("marketTerms.volume.description"));
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });
});
