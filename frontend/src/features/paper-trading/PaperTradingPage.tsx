import { useTranslation } from 'react-i18next';
import { OrderTicket } from './OrderTicket';
import { PortfolioScope } from './PortfolioScope';

// No AppShell here: AppRoutes' ConsoleShellLayout already wraps every console
// page in one, and mounting a second would nest the sidebar inside itself —
// same reasoning as PortfolioPage.tsx. PortfolioScope is the first child,
// exactly as it is on the portfolio overview page, so portfolio selection and
// creation behave identically everywhere they appear.
export function PaperTradingPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-1-medium text-text-primary">{t('paperTrading.page.title')}</h1>
        <p className="text-body-2-medium text-text-tertiary">{t('paperTrading.page.notice')}</p>
      </header>

      <PortfolioScope>{(portfolioId) => <OrderTicket portfolioId={portfolioId} />}</PortfolioScope>
    </div>
  );
}
