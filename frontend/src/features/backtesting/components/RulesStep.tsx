import { Chip } from "@/components/base/badges/chip";
import { CheckboxCard } from "@/components/base/checkbox/checkbox-card";
import { Input } from "@/components/base/input/input";
import { RadioCard } from "@/components/base/radio/radio-card";
import { RadioGroup } from "@/components/base/radio/radio";
import { AppNotice } from "@/components/application/layout/application-layout";
import { cx } from "@/utils/cx";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import {
  DISALLOWED_INDICATOR_STRATEGIES,
  V1_BUY_RULES,
  V1_SELL_RULES,
} from "../domain/v1Rules";
import type { BuyConditionType, SellConditionType } from "../domain/types";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
  ParameterPanel,
} from "./BacktestStepLayout";

export function RulesStep() {
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
        step={3}
        title="Define entry and exit rules"
        description="An entry rule decides when the simulation buys. One or more exit rules decide when it sells; if several trigger on the same bar, the engine uses its fixed precedence rules."
      />

      <AppNotice title="Version 1 supports price rules only">
        Indicators such as{" "}
        {DISALLOWED_INDICATOR_STRATEGIES.map((item) => item.code).join(", ")}
        {" "}may be useful for research, but the current execution API does not
        accept them as backtest rules.
      </AppNotice>

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Entry rule"
          description="Choose exactly one condition that opens a long position."
          aside={<Chip color="blue">One required</Chip>}
        />
        <BacktestFieldError>{buyError?.message}</BacktestFieldError>
        <RadioGroup
          value={selectedBuy.type}
          onChange={(value) => selectBuy(value as BuyConditionType)}
          aria-label="Entry rule"
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
              hint={
                selectedBuyMeta.valueSuffix
                  ? `Enter a value in ${selectedBuyMeta.valueSuffix}.`
                  : undefined
              }
              fieldClassName="ring-1 ring-inset ring-border-button-default"
              className="max-w-sm"
            />
          </ParameterPanel>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-separator-border pt-6">
        <BacktestSectionHeader
          title="Exit rules"
          description="Choose one or more. The first condition reached closes the open position."
          aside={<Chip color="blue">At least one required</Chip>}
        />
        <BacktestFieldError>{sellsError?.message}</BacktestFieldError>
        <div
          className="grid gap-3 md:grid-cols-2"
          role="group"
          aria-label="Exit rules"
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
                    hint={
                      metadata.valueSuffix
                        ? `Enter a value in ${metadata.valueSuffix}.`
                        : undefined
                    }
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
