import { useEffect, useState } from "react";
import { RiRefreshLine, RiSettings3Line } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { RadioCard } from "@/components/base/radio/radio-card";
import { RadioGroup } from "@/components/base/radio/radio";
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
  min?: number;
  max?: number;
  step?: number;
}> = [
  {
    type: "full_capital",
    label: "All available cash",
    description: "Each buy uses all the virtual cash you have",
  },
  {
    type: "percentage",
    label: "Part of your portfolio",
    description: "Each buy uses a set percentage of your portfolio",
    valueLabel: "Share of portfolio (%)",
    min: 1,
    max: 100,
    step: 1,
  },
  {
    type: "absolute",
    label: "Fixed amount",
    description: "Each buy spends the same amount of cash",
    valueLabel: "Amount per buy (LKR)",
    min: 100,
    step: 100,
  },
  {
    type: "fixed_quantity",
    label: "Fixed number of shares",
    description: "Each buy gets the same number of shares",
    valueLabel: "Shares per buy",
    min: 1,
    step: 1,
  },
];

const FEE_FIELDS: Array<{
  key: keyof FeeConfig;
  label: string;
}> = [
  { key: "brokerageRate", label: "Brokerage commission" },
  { key: "cseRate", label: "CSE fee" },
  { key: "cdsRate", label: "CDS fee" },
  { key: "secCessRate", label: "SEC cess" },
  { key: "stlRate", label: "Share transaction levy" },
];

export function ExecutionStep({ embedded = false }: { embedded?: boolean }) {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const sizingError = getStepErrors("execution").find((error) =>
    error.field.startsWith("positionSizing"),
  );
  const feeErrors = getStepErrors("execution").filter((error) => error.field.startsWith("fees.") || error.field.includes("Rate"));
  const hasFeeErrors = feeErrors.length > 0;
  const [isCustomFees, setIsCustomFees] = useState(() =>
    Object.keys(DEFAULT_CSE_FEES).some((key) => config.execution.fees[key as keyof FeeConfig] !== DEFAULT_CSE_FEES[key as keyof FeeConfig]),
  );
  useEffect(() => {
    if (hasFeeErrors) setIsCustomFees(true);
  }, [hasFeeErrors]);
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
        embedded={embedded}
        title="Trade size and charges"
        description="How much each buy uses, and the fees taken"
      />

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Trade size"
          info="Shares are bought in whole numbers. Any cash left over stays in the portfolio."
        />
        <BacktestFieldError>{sizingError?.message}</BacktestFieldError>
        <RadioGroup
          value={currentSizing.type}
          onChange={(value) => selectSizing(value as PositionSizingType)}
          aria-label="Trade size"
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
              isInvalid={Boolean(sizingError)}
              max={selectedSizing.max}
              step={selectedSizing.step}
              fieldClassName="ring-1 ring-inset ring-border-button-default"
              className="max-w-sm"
            />
          </ParameterPanel>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-separator-border pt-6">
        <BacktestSectionHeader
          title="Charges"
          description={`${totalFeePct}% on each buy or sell`}
          info="These are the standard CSE trading fees. Change them if your broker charges differently."
          aside={
            <Button
              variant="secondary"
              size="small"
              leadingIcon={isCustomFees ? RiRefreshLine : RiSettings3Line}
              onClick={() =>
                isCustomFees ? resetFees() : setIsCustomFees(true)
              }
            >
              {isCustomFees ? "Reset to CSE rates" : "Edit charges"}
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
                  isInvalid={feeErrors.some((error) => error.field.includes(field.key))}
                  hint={feeErrors.find((error) => error.field.includes(field.key))?.message}
                  fieldClassName="ring-1 ring-inset ring-border-button-default"
                />
              ) : (
                <div key={field.key} className="flex flex-col gap-0.5">
                  <p className="text-body-2-regular text-text-secondary">
                    {field.label}
                  </p>
                  <p className="text-body-medium tabular-nums text-text-primary">
                    {(currentFees[field.key] * 100).toFixed(3)}%
                  </p>
                </div>
              ),
            )}
            <div className="flex flex-col gap-0.5">
              <p className="text-body-2-regular text-text-secondary">Total</p>
              <p className="text-body-medium tabular-nums text-text-primary">
                {totalFeePct}%
              </p>
            </div>
          </div>
        </ParameterPanel>
      </section>
    </div>
  );
}
