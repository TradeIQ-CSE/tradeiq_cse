import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiFlagLine,
  RiPercentLine,
  RiShoppingCart2Line,
  RiWallet3Line,
} from "@remixicon/react";
import { IconList, type IconListItem } from "@/components/application/icon-list";
import {
  entryDescription,
  exitDescription,
  sizingDescription,
  tradeReason,
} from "../domain/descriptions";
import type { BacktestConfig } from "../domain/types";

const SELL_ICON: Record<string, Pick<IconListItem, "icon" | "tone">> = {
  price_falls_pct_from_period_start: { icon: RiShoppingCart2Line },
  price_falls_to: { icon: RiShoppingCart2Line },
  period_start: { icon: RiShoppingCart2Line },
  take_profit_pct: { icon: RiArrowUpLine, tone: "gain" },
  target_price: { icon: RiArrowUpLine, tone: "gain" },
  stop_loss_pct: { icon: RiArrowDownLine, tone: "loss" },
  end_of_period: { icon: RiFlagLine },
};

/** The buy rule, then each sell rule, one per row with an icon for its kind. */
export function RuleList({ rules }: { rules: BacktestConfig["rules"] }) {
  return (
    <IconList
      items={[
        {
          key: "buy",
          icon: RiShoppingCart2Line,
          text: entryDescription(rules.buy.type, rules.buy.value),
        },
        ...rules.sells.map((sell) => ({
          key: sell.type,
          ...(SELL_ICON[sell.type] ?? { icon: RiFlagLine }),
          text: exitDescription(sell.type, sell.value),
        })),
      ]}
    />
  );
}

/** How much each buy uses and what it costs, one per row. */
export function TradeSizeList({
  execution,
}: {
  execution: BacktestConfig["execution"];
}) {
  const totalFeesPct = (
    Object.values(execution.fees).reduce((sum, rate) => sum + rate, 0) * 100
  ).toFixed(3);
  return (
    <IconList
      items={[
        {
          key: "size",
          icon: RiWallet3Line,
          text: sizingDescription(
            execution.positionSizing.type,
            execution.positionSizing.value,
          ),
        },
        {
          key: "fees",
          icon: RiPercentLine,
          text: `${totalFeesPct}% charges per buy or sell`,
        },
      ]}
    />
  );
}

/** Why a trade happened, in plain words with the same icon as its rule. */
export function TradeReason({ code }: { code: string }) {
  const { type, text } = tradeReason(code);
  return (
    <IconList
      items={[{ key: type, ...(SELL_ICON[type] ?? { icon: RiFlagLine }), text }]}
      className="[&_li]:text-body-2-regular"
    />
  );
}
