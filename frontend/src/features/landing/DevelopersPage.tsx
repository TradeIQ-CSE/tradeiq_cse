import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  RiBuilding4Line,
  RiCodeSSlashLine,
  RiExternalLinkLine,
  RiFileList3Line,
  RiFundsLine,
  RiKeyLine,
  RiLineChartLine,
  RiSendPlaneLine,
} from '@remixicon/react';
import { ButtonLink } from '@/components/base/buttons/button';
import { InfoTip } from '@/components/domain/info-tip';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/base/segmented-control/segmented-control';
import { AuroraBackground } from '@/components/ui/aurora-background';
import {
  PUBLIC_API_BASE_URL,
  PUBLIC_API_DOCS_URL,
  PUBLIC_API_EXAMPLE_PATH,
  PUBLIC_API_KEY_HEADER,
} from '@/features/developer-api/constants';
import { CodeBlock } from '@/features/developer-api/CodeBlock';
import { LandingFooter } from './LandingFooter';
import { LandingNav } from './LandingNav';
import { LANDING_CONTAINER } from './layout';
import './landing.css';

const READS = [
  { key: 'companies', Icon: RiBuilding4Line },
  { key: 'prices', Icon: RiLineChartLine },
  { key: 'indices', Icon: RiFundsLine },
  { key: 'eod', Icon: RiFileList3Line },
] as const;

const STEP_ICONS = [RiKeyLine, RiSendPlaneLine, RiCodeSSlashLine];

const EXAMPLE_URL = `${PUBLIC_API_BASE_URL}${PUBLIC_API_EXAMPLE_PATH}`;

type SnippetTab = 'curl' | 'python' | 'javascript';

const SNIPPETS: Record<SnippetTab, string> = {
  curl: `curl "${EXAMPLE_URL}" \\\n  -H "${PUBLIC_API_KEY_HEADER}: YOUR_KEY"`,
  python: [
    'import requests',
    '',
    'response = requests.get(',
    `    "${EXAMPLE_URL}",`,
    `    headers={"${PUBLIC_API_KEY_HEADER}": "YOUR_KEY"},`,
    ')',
    'print(response.json())',
  ].join('\n'),
  javascript: [
    `const response = await fetch("${EXAMPLE_URL}", {`,
    `  headers: { "${PUBLIC_API_KEY_HEADER}": "YOUR_KEY" },`,
    '});',
    'const data = await response.json();',
  ].join('\n'),
};

const SNIPPET_TABS: SnippetTab[] = ['curl', 'python', 'javascript'];

export function DevelopersPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SnippetTab>('curl');

  return (
    <div className="landing-page min-h-full bg-background-primary-default">
      <a href="#main-content" className="landing-skip-link">
        Skip to content
      </a>
      <LandingNav />
      <main id="main-content">
        <AuroraBackground className="landing-aurora">
          <div className="relative z-10 flex w-full flex-col gap-16 pb-20 pt-8 sm:gap-20 sm:pb-24 sm:pt-12">
            <section className={LANDING_CONTAINER}>
              <div className="landing-glass-panel landing-glass-panel-major flex flex-col items-center rounded-3xl px-6 py-14 text-center sm:px-10 sm:py-20">
                <p className="text-headline-semibold text-status-blue-text">{t('developers.hero.eyebrow')}</p>
                <h1 className="landing-display mt-5 max-w-4xl text-display-4-bold text-text-primary sm:text-display-2-bold">
                  {t('developers.hero.heading')}
                </h1>
                <p className="landing-lead mt-6 max-w-2xl text-headline-regular text-text-secondary">
                  {t('developers.hero.facts')}
                  <InfoTip label={t('developers.hero.limitLabel')} className="ml-1.5">
                    {t('developers.hero.limitTip')}
                  </InfoTip>
                </p>
                <ButtonLink
                  href={PUBLIC_API_DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  variant="secondary"
                  trailingIcon={RiExternalLinkLine}
                  className="mt-6"
                >
                  {t('developers.hero.reference')}
                </ButtonLink>
              </div>
            </section>

            <section className={LANDING_CONTAINER} aria-labelledby="reads-heading">
              <div className="landing-glass-panel landing-glass-panel-major rounded-3xl p-6 sm:p-8 lg:p-12">
                <h2 id="reads-heading" className="landing-display text-display-4-bold text-text-primary sm:text-display-3-bold">
                  {t('developers.reads.heading')}
                </h2>
                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {READS.map(({ key, Icon }) => (
                    <li
                      key={key}
                      className="landing-glass-card flex items-center gap-3 rounded-2xl p-4"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background-secondary-default text-status-blue-text">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="text-body-medium text-text-primary">
                        {t(`developers.reads.items.${key}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className={LANDING_CONTAINER} aria-labelledby="start-heading">
              <div className="landing-glass-panel landing-glass-panel-major rounded-3xl p-6 sm:p-8 lg:p-12">
                <h2 id="start-heading" className="landing-display text-display-4-bold text-text-primary sm:text-display-3-bold">
                  {t('developers.start.heading')}
                </h2>

                <ol className="mt-8 flex flex-col gap-6">
                  <li className="landing-glass-card rounded-3xl p-5 sm:p-6">
                    <StepHeading index={0} title={t('developers.start.create.title')} />
                    <Link
                      to="/api-key"
                      className="mt-3 inline-flex items-center gap-1 text-body-medium text-status-blue-text hover:underline"
                    >
                      {t('developers.start.create.link')}
                    </Link>
                  </li>

                  <li className="landing-glass-card rounded-3xl p-5 sm:p-6">
                    <StepHeading index={1} title={t('developers.start.send.title')} />
                    <div className="mt-3">
                      <CodeBlock
                        code={`${PUBLIC_API_KEY_HEADER}: YOUR_KEY`}
                        copyLabel={t('developers.start.send.copyLabel')}
                      />
                    </div>
                  </li>

                  <li className="landing-glass-card rounded-3xl p-5 sm:p-6">
                    <StepHeading index={2} title={t('developers.start.read.title')} />
                    <div className="mt-4 flex flex-col gap-3">
                      <SegmentedControl
                        aria-label={t('developers.start.read.tabsLabel')}
                        selectedKeys={new Set([tab])}
                        onSelectionChange={(keys) => {
                          const [next] = [...keys];
                          if (next) setTab(next as SnippetTab);
                        }}
                      >
                        {SNIPPET_TABS.map((key) => (
                          <SegmentedControlItem key={key} id={key}>
                            {t(`developers.start.read.tabs.${key}`)}
                          </SegmentedControlItem>
                        ))}
                      </SegmentedControl>
                      <CodeBlock code={SNIPPETS[tab]} copyLabel={t('developers.start.read.copyLabel')} />
                    </div>
                  </li>
                </ol>
              </div>
            </section>
          </div>
        </AuroraBackground>
      </main>
      <LandingFooter />
    </div>
  );
}

function StepHeading({ index, title }: { index: number; title: string }) {
  const { t } = useTranslation();
  const Icon = STEP_ICONS[index];
  return (
    <div className="flex items-start gap-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background-secondary-default text-status-blue-text">
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <p className="text-body-semibold text-status-blue-text">
          {t('developers.start.step', { number: index + 1 })}
        </p>
        <h3 className="mt-1 text-title-3-semibold text-text-primary">{title}</h3>
      </div>
    </div>
  );
}

export default DevelopersPage;
