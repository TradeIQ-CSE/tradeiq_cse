import { useState } from "react";
import { RiRefreshLine, RiSettings3Line } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { RadioCard } from "@/components/base/radio/radio-card";
import { RadioGroup } from "@/components/base/radio/radio";
import { AppNotice } from "@/components/application/layout/application-layout";
import { cx } from "@/utils/cx";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import type { FeeConfig, PositionSizingType } from "../domain/types";
import { DEFAULT_CSE_FEES } from "../domain/defaults";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
  ParameterPanel,
} from "./BacktestStepLayout";

const SIZING_OPTIONS: Array<{
  type: PositionSizingType;
  label: string;
  description: string;
  valueLabel?: string;
  valueSuffix?: string;
  min?: number;
  max?: number;
  step?: number;
}> = [
  {
    type: "full_capital",
    label: "Use available cash",
    description: "Use all available simulated cash when an entry rule triggers.",
  },
  {
    type: "percentage",
    label: "Portfolio percentage",
    description: "Limit each entry to a fixed percentage of portfolio equity.",
    valueLabel: "Portfolio share",
    valueSuffix: "% of portfolio equity",
    min: 1,
    max: 100,
    step: 1,
  },
  {
    type: "absolute",
    label: "Fixed cash amount",
    description: "Use the same simulated cash amount for each entry.",
    valueLabel: "Cash amount",
    valueSuffix: "LKR per entry",
    min: 100,
    step: 100,
  },
  {
    type: "fixed_quantity",
    label: "Fixed share quantity",
    description: "Attempt to buy the same whole-share quantity at each entry.",
    valueLabel: "Number of shares",
    valueSuffix: "whole shares",
    min: 1,
    step: 1,
  },
];

const FEE_FIELDS: Array<{
  key: keyof FeeConfig;
  label: string;
  description: string;
}> = [
  {
    key: "brokerageRate",
    label: "Brokerage commission",
    description: "Broker transaction charge",
  },
  { key: "cseRate", label: "CSE fee", description: "Exchange fee" },
  { key: "cdsRate", label: "CDS fee", description: "Depository fee" },
  { key: "secCessRate", label: "SEC cess", description: "Regulatory cess" },
  {
    key: "stlRate",
    label: "Share transaction levy",
    description: "Statutory transaction levy",
  },
];

export function ExecutionStep() {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const sizingError = getStepErrors("execution").find((error) =>
    error.field.startsWith("positionSizing"),
  );
  const [isCustomFees, setIsCustomFees] = useState(false);
  const currentSizing = config.execution.positionSizing;
  const currentFees = config.execution.fees;
  const selectedSizing = SIZING_OPTIONS.find(
    (option) => option.type === currentSizing.type,
  );
  const totalFeePct = (
    Object.values(currentFees).reduce((sum, rate) => sum + rate, 0) * 100
  ).toFixed(3);

  const selectSizing = (type: PositionSizingType) => {
    let value: number | undefined;
    if (type === "percentage") value = 50;
    if (type === "absolute") value = 100_000;
    if (type === "fixed_quantity") value = 500;
    updateConfig((previous) => ({
      ...previous,
      execution: {
        ...previous.execution,
        positionSizing: { type, value },
      },
    }));
  };

  const updateSizingValue = (value: string) => {
    updateConfig((previous) => ({
      ...previous,
      execution: {
        ...previous.execution,
        positionSizing: {
          ...previous.execution.positionSizing,
          value: Number.parseFloat(value),
        },
      },
    }));
  };

  const updateFee = (key: keyof FeeConfig, value: string) => {
    updateConfig((previous) => ({
      ...previous,
      execution: {
        ...previous.execution,
        fees: {
          ...previous.execution.fees,
          [key]: Number.parseFloat(value) / 100,
        },
      },
    }));
  };

  const resetFees = () => {
    setIsCustomFees(false);
    updateConfig((previous) => ({
      ...previous,
      execution: {
        ...previous.execution,
        fees: { ...DEFAULT_CSE_FEES },
      },
    }));
  };

  return (
    <div className="flex flex-col gap-7">
      <BacktestStepHeader
        step={4}
        title="Set execution assumptions"
        description="These controls describe how much simulated capital each entry can use and which transaction charges are deducted. They make historical comparisons more realistic, but they cannot reproduce every market condition."
      />

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Position sizing"
          description="Choose how the engine calculates the maximum size of each simulated buy."
        />
        <BacktestFieldError>{sizingError?.message}</BacktestFieldError>
        <RadioGroup
          value={currentSizing.type}
          onChange={(value) => selectSizing(value as PositionSizingType)}
          aria-label="Position sizing strategy"
          className="grid gap-3 sm:grid-cols-2"
          isInvalid={Boolean(sizingError)}
        >
          {SIZING_OPTIONS.map((option) => (
            <RadioCard
              key={option.type}
              value={option.type}
              title={option.label}
              description={option.description}
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

        {selectedSizing?.valueLabel && (
          <ParameterPanel>
            <Input
              type="number"
              label={selectedSizing.valueLabel}
              value={Number.isNaN(currentSizing.value)
                ? ""
                : String(currentSizing.value ?? "")}
              onChange={updateSizingValue}
              min={selectedSizing.min}
              max={selectedSizing.max}
              step={selectedSizing.step}
              hint={selectedSizing.valueSuffix}
              fieldClassName="ring-1 ring-inset ring-border-button-default"
              className="max-w-sm"
            />
          </ParameterPanel>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-separator-border pt-6">
        <BacktestSectionHeader
          title="Transaction charges"
          description={`The current combined rate is ${totalFeePct}%. Rates are stored as execution assumptions and applied by the backtest engine.`}
          aside={
            <Button
              variant="secondary"
              size="small"
              leadingIcon={isCustomFees ? RiRefreshLine : RiSettings3Line}
              onClick={() =>
                isCustomFees ? resetFees() : setIsCustomFees(true)
              }
            >
              {isCustomFees ? "Use documented defaults" : "Customize rates"}
            </Button>
          }
        />

        <ParameterPanel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEE_FIELDS.map((field) =>
              isCustomFees ? (
                <Input
                  key={field.key}
                  type="number"
                  label={`${field.label} (%)`}
                  value={String((currentFees[field.key] * 100).toFixed(3))}
                  onChange={(value) => updateFee(field.key, value)}
                  min={0}
                  step={0.001}
                  hint={field.description}
                  fieldClassName="ring-1 ring-inset ring-border-button-default"
                />
              ) : (
                <div key={field.key} className="flex flex-col gap-0.5">
                  <p className="text-body-2-regular text-text-secondary">
                    {field.label}
                  </p>
                  <p className="text-headline-medium tabular-nums text-text-primary">
                    {(currentFees[field.key] * 100).toFixed(3)}%
                  </p>
                  <p className="text-caption-1-medium text-text-tertiary">
                    {field.description}
                  </p>
                </div>
              ),
            )}
            <div className="flex flex-col gap-0.5 rounded-xl bg-status-blue-background p-3">
              <p className="text-body-2-regular text-status-blue-text">
                Combined rate
              </p>
              <p className="text-title-3-semibold tabular-nums text-text-primary">
                {totalFeePct}%
              </p>
            </div>
          </div>
        </ParameterPanel>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <AppNotice title="Whole-share rounding">
          Fractional quantities are rounded down. Unused simulated cash stays
          in the portfolio.
        </AppNotice>
        <AppNotice title="Same-bar exit order">
          The first triggered rule wins. When stop loss and take profit trigger
          on the same bar, stop loss is evaluated first.
        </AppNotice>
      </div>
    </div>
  );
}
