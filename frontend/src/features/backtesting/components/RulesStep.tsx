import { CheckboxCard } from "@/components/base/checkbox/checkbox-card";
import { Input } from "@/components/base/input/input";
import { RadioCard } from "@/components/base/radio/radio-card";
import { RadioGroup } from "@/components/base/radio/radio";
import { cx } from "@/utils/cx";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { V1_BUY_RULES, V1_SELL_RULES } from "../domain/v1Rules";
import type { BuyConditionType, SellConditionType } from "../domain/types";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
  ParameterPanel,
} from "./BacktestStepLayout";

export function RulesStep({ embedded = false }: { embedded?: boolean }) {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const errors = getStepErrors("rules");
  const buyError = errors.find((error) => error.field.startsWith("buy"));
  const sellsError = errors.find((error) => error.field.startsWith("sells"));
  const selectedBuy = config.rules.buy;
  const selectedSells = config.rules.sells;
  const selectedBuyMeta = V1_BUY_RULES.find(
    (rule) => rule.type === selectedBuy.type,
  );

  const selectBuy = (type: BuyConditionType) => {
    let value: number | undefined;
    if (type === "price_falls_pct_from_period_start") value = 5;
    if (type === "price_falls_to") {
      value = config.security.price
        ? Math.round(config.security.price * 0.95)
        : 100;
    }
    updateConfig((previous) => ({
      ...previous,
      rules: { ...previous.rules, buy: { type, value } },
    }));
  };

  const updateBuyValue = (value: string) => {
    updateConfig((previous) => ({
      ...previous,
      rules: {
        ...previous.rules,
        buy: { ...previous.rules.buy, value: Number.parseFloat(value) },
      },
    }));
  };

  const toggleSell = (type: SellConditionType) => {
    updateConfig((previous) => {
      const exists = previous.rules.sells.some((rule) => rule.type === type);
      if (exists) {
        return {
          ...previous,
          rules: {
            ...previous.rules,
            sells: previous.rules.sells.filter((rule) => rule.type !== type),
          },
        };
      }

      let value: number | undefined;
      if (type === "take_profit_pct") value = 10;
      if (type === "stop_loss_pct") value = 5;
      if (type === "target_price") {
        value = config.security.price
          ? Math.round(config.security.price * 1.15)
          : 150;
      }
      return {
        ...previous,
        rules: {
          ...previous.rules,
          sells: [...previous.rules.sells, { type, value }],
        },
      };
    });
  };

  const updateSellValue = (type: SellConditionType, value: string) => {
    updateConfig((previous) => ({
      ...previous,
      rules: {
        ...previous.rules,
        sells: previous.rules.sells.map((rule) =>
          rule.type === type
            ? { ...rule, value: Number.parseFloat(value) }
            : rule,
        ),
      },
    }));
  };

  return (
    <div className="flex flex-col gap-7">
      <BacktestStepHeader
        embedded={embedded}
        title="When to buy and sell"
        description="Choose one buy rule and at least one sell rule"
      />

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Buy"
          info="The test buys once, the first time this rule is met. Only price rules are available for now."
        />
        <BacktestFieldError>{buyError?.message}</BacktestFieldError>
        <RadioGroup
          value={selectedBuy.type}
          onChange={(value) => selectBuy(value as BuyConditionType)}
          aria-label="Buy rule"
          className="grid gap-3 md:grid-cols-3"
          isInvalid={Boolean(buyError)}
        >
          {V1_BUY_RULES.map((rule) => (
            <RadioCard
              key={rule.type}
              value={rule.type}
              title={rule.label}
              description={rule.description}
              className={({ isSelected }) =>
                cx(
                  "h-full items-start",
                  isSelected &&
                    "border-border-button-active bg-status-blue-background",
                )
              }
            />
          ))}
        </RadioGroup>

        {selectedBuyMeta?.requiresValue && (
          <ParameterPanel>
            <Input
              type="number"
              label={selectedBuyMeta.valueLabel}
              value={Number.isNaN(selectedBuy.value)
                ? ""
                : String(selectedBuy.value ?? "")}
              onChange={updateBuyValue}
              min={selectedBuyMeta.min}
              max={selectedBuyMeta.max}
              step={selectedBuyMeta.step}
              placeholder={selectedBuyMeta.valuePlaceholder}
              fieldClassName="ring-1 ring-inset ring-border-button-default"
              className="max-w-sm"
            />
          </ParameterPanel>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-separator-border pt-6">
        <BacktestSectionHeader
          title="Sell"
          info="The first sell rule to trigger closes the trade. If stop loss and take profit trigger on the same day, stop loss goes first."
        />
        <BacktestFieldError>{sellsError?.message}</BacktestFieldError>
        <div
          className="grid gap-3 md:grid-cols-2"
          role="group"
          aria-label="Sell rules"
        >
          {V1_SELL_RULES.map((rule) => {
            const isSelected = selectedSells.some(
              (selected) => selected.type === rule.type,
            );
            return (
              <CheckboxCard
                key={rule.type}
                isSelected={isSelected}
                onChange={() => toggleSell(rule.type)}
                title={rule.label}
                description={rule.description}
                className={({ isSelected: selected }) =>
                  cx(
                    "h-full items-start",
                    selected &&
                      "border-border-button-active bg-status-blue-background",
                  )
                }
              />
            );
          })}
        </div>

        {selectedSells.some((selected) =>
          V1_SELL_RULES.find((rule) => rule.type === selected.type)
            ?.requiresValue,
        ) && (
          <ParameterPanel>
            <div className="grid gap-4 sm:grid-cols-2">
              {selectedSells.map((selected) => {
                const metadata = V1_SELL_RULES.find(
                  (rule) => rule.type === selected.type,
                );
                if (!metadata?.requiresValue) return null;
                return (
                  <Input
                    key={selected.type}
                    type="number"
                    label={metadata.valueLabel}
                    value={Number.isNaN(selected.value)
                      ? ""
                      : String(selected.value ?? "")}
                    onChange={(value) =>
                      updateSellValue(selected.type, value)
                    }
                    min={metadata.min}
                    max={metadata.max}
                    step={metadata.step}
                    placeholder={metadata.valuePlaceholder}
                    fieldClassName="ring-1 ring-inset ring-border-button-default"
                  />
                );
              })}
            </div>
          </ParameterPanel>
        )}
      </section>
    </div>
  );
}
