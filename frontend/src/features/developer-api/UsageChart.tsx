import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, ResponsiveContainer, Tooltip, TooltipProps, XAxis } from 'recharts';
import type { DeveloperUsageDay } from './api';

// A neutral series colour, not the site's one green/red (--color-gain /
// --color-loss) — this bar counts calls, it isn't a gain or a loss.
const BAR_COLOR = 'var(--color-chart-1)';
const BAR_ACTIVE_COLOR = 'var(--color-chart-1-active)';
const TICK_COLOR = 'var(--color-text-tertiary)';

function asUtcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function formatTick(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    asUtcDate(day),
  );
}

function formatTooltipDate(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(asUtcDate(day));
}

// Every 7th day counting back from today (the last entry), so the ticks land
// on an even spacing instead of whatever preserveStartEnd/minTickGap picked.
function evenlySpacedTicks(daily: DeveloperUsageDay[]): string[] {
  const ticks: string[] = [];
  for (let index = daily.length - 1; index >= 0; index -= 7) {
    ticks.push(daily[index].date);
  }
  return ticks.reverse();
}

interface UsageTooltipPayloadItem {
  payload: DeveloperUsageDay;
}

function UsageTooltip({
  active,
  payload,
  locale,
}: Omit<TooltipProps<number, string>, 'payload'> & {
  payload?: UsageTooltipPayloadItem[];
  locale: string;
}) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-border-table bg-background-primary-default px-3.5 py-2.5 text-caption-1-medium text-text-primary shadow-lg">
      {t('developerApi.usage.tooltip', {
        count: point.request_count,
        date: formatTooltipDate(point.date, locale),
      })}
    </div>
  );
}

interface UsageChartProps {
  daily: DeveloperUsageDay[];
  locale?: string;
}

/** The 30-day call-volume bar chart in the Developer API card's usage section. */
export function UsageChart({ daily, locale = 'en-US' }: UsageChartProps) {
  const { t } = useTranslation();
  const captionId = useId();
  const accessibleLabel = t('developerApi.usage.chartLabel');

  if (daily.every((day) => day.request_count === 0)) {
    return <p className="text-body-2-regular text-text-secondary">{t('developerApi.usage.none')}</p>;
  }

  const ticks = evenlySpacedTicks(daily);

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <p id={captionId} className="text-body-2-regular text-text-secondary">
        {accessibleLabel}
      </p>
      <div role="group" aria-labelledby={captionId}>
        <div className="h-24 w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <XAxis
                dataKey="date"
                ticks={ticks}
                tickFormatter={(value: string) => formatTick(value, locale)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: TICK_COLOR, fontSize: 10 }}
              />
              <Tooltip cursor={{ fill: 'var(--color-background-secondary-hover)' }} content={<UsageTooltip locale={locale} />} />
              <Bar dataKey="request_count" fill={BAR_COLOR} activeBar={{ fill: BAR_ACTIVE_COLOR }} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <table className="sr-only">
          <caption>{accessibleLabel}</caption>
          <thead>
            <tr>
              <th>{t('developerApi.usage.tableDate')}</th>
              <th>{t('developerApi.usage.tableCount')}</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((day) => (
              <tr key={day.date}>
                <th scope="row">{formatTooltipDate(day.date, locale)}</th>
                <td>{day.request_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
