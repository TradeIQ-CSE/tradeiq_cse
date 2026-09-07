import { useTranslation } from 'react-i18next';
import { OrdersTable } from './OrdersTable';
import { PortfolioScope } from './PortfolioScope';
import './paper-trading.css';

// No AppShell here: AppRoutes' ConsoleRoute already wraps every console page
// in it, same as PortfolioPage.tsx — mounting a second one would nest the
// sidebar inside itself.
export function OrdersPage() {
  const { t } = useTranslation();

  return (
    <div className="portfolio-page">
      <header className="portfolio-page__header">
        <h1>{t('orders.page.title')}</h1>
      </header>

      <PortfolioScope>{(portfolioId) => <OrdersTable portfolioId={portfolioId} />}</PortfolioScope>
    </div>
  );
}
