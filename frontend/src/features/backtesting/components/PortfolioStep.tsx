import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { CAPITAL_PRESETS } from "../domain/defaults";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
  ParameterPanel,
} from "./BacktestStepLayout";

export function PortfolioStep() {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const capitalError = getStepErrors("portfolio").find(
    (error) => error.field === "startingCapital",
  );
  const startingCapital = config.portfolio.startingCapital;

  const updateCapital = (value: string | number) => {
    const next =
      typeof value === "number" ? value : Number.parseFloat(value);
    updateConfig((previous) => ({
      ...previous,
      portfolio: { ...previous.portfolio, startingCapital: next },
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader
        title="Starting cash"
        description="Virtual money to start with. No real money is used"
      />

      <ParameterPanel>
        <div className="max-w-md">
          <Input
            type="number"
            label="Amount"
            leadingAddon={
              <span className="px-1 text-body-medium text-text-secondary">
                LKR
              </span>
            }
            value={Number.isNaN(startingCapital) ? "" : String(startingCapital)}
            onChange={updateCapital}
            min={1}
            step={1000}
            isInvalid={Boolean(capitalError)}
            fieldClassName="ring-1 ring-inset ring-border-button-default"
          />
          <BacktestFieldError>{capitalError?.message}</BacktestFieldError>
        </div>
      </ParameterPanel>

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader title="Quick picks" />
        <div className="flex flex-wrap gap-2">
          {CAPITAL_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              variant={
                startingCapital === preset.value ? "primary" : "secondary"
              }
              size="small"
              onClick={() => updateCapital(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
