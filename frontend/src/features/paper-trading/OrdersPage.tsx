import { useTranslation } from 'react-i18next';
import { OrdersTable } from './OrdersTable';
import { PortfolioScope } from './PortfolioScope';

// No AppShell here: AppRoutes' ConsoleShellLayout already wraps every console
// page in it, same as PortfolioPage.tsx — mounting a second one would nest the
// sidebar inside itself.
export function OrdersPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-1-medium text-text-primary">{t('orders.page.title')}</h1>
        <p className="text-body-2-medium text-text-tertiary">{t('orders.page.subtitle')}</p>
      </header>

      <PortfolioScope>{(portfolioId) => <OrdersTable portfolioId={portfolioId} />}</PortfolioScope>
    </div>
  );
}
