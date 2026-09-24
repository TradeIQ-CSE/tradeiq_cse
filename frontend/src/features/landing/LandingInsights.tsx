import { useTranslation } from 'react-i18next';
import { RiArrowRightUpLine, RiBookOpenLine, RiFileList3Line, RiLineChartLine } from '@remixicon/react';
import { LinkButton } from '@/components/base/buttons/link-button';
import { LANDING_CONTAINER } from './layout';

// What the page hasn't already shown: testing and practising have their own
// sections above, so these point at the rest of the site.
const CAPABILITIES = [
  { key: 'market', icon: RiLineChartLine, href: '/markets' },
  { key: 'history', icon: RiFileList3Line, href: '/orders' },
  { key: 'learn', icon: RiBookOpenLine, href: '/how-it-works' },
] as const;

export function LandingInsights() {
  const { t } = useTranslation();
  return (
    <section id="workspace" className={LANDING_CONTAINER}>
      <div className="landing-glass-panel landing-glass-panel-major rounded-3xl p-6 sm:p-8 lg:p-12">
        <p className="text-headline-semibold text-status-blue-text">{t('landing.insights.eyebrow')}</p>
        <h2 className="landing-display mt-4 text-display-4-bold text-text-primary sm:text-display-3-bold">{t('landing.insights.heading')}</h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {CAPABILITIES.map(({ key, icon: Icon, href }) => (
            <li key={key} className="landing-glass-card flex flex-col items-start rounded-3xl p-5 sm:p-6">
              <Icon className="mb-6 size-6 text-status-blue-text" aria-hidden />
              <h3 className="text-title-3-semibold text-text-primary">{t(`landing.insights.capabilities.${key}.title`)}</h3>
              <p className="mb-5 mt-2 text-body-regular text-text-secondary">{t(`landing.insights.capabilities.${key}.description`)}</p>
              <LinkButton href={href} trailingIcon={RiArrowRightUpLine} className="mt-auto text-title-3-semibold text-status-blue-text">
                {t(`landing.insights.capabilities.${key}.cta`)}
              </LinkButton>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
