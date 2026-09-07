import { useTranslation } from 'react-i18next';
import { OrderTicket } from './OrderTicket';
import { PortfolioScope } from './PortfolioScope';
import './paper-trading.css';

// No AppShell here: AppRoutes' ConsoleRoute already wraps every console page
// in one, and mounting a second would nest the sidebar inside itself — same
// reasoning as PortfolioPage.tsx. PortfolioScope is the first child, exactly
// as it is on the portfolio overview page, so portfolio selection/creation
// behaves identically everywhere it appears.
export function PaperTradingPage() {
  const { t } = useTranslation();

  return (
    <div className="portfolio-page">
      <header className="portfolio-page__header">
        <h1>{t('paperTrading.page.title')}</h1>
      </header>

      <PortfolioScope>{(portfolioId) => <OrderTicket portfolioId={portfolioId} />}</PortfolioScope>
    </div>
  );
}
