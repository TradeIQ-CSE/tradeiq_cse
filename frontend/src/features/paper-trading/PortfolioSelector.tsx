import { useTranslation } from 'react-i18next';
import { Portfolio } from './types';
import './paper-trading.css';

interface PortfolioSelectorProps {
  portfolios: Portfolio[];
  selectedId: string | null;
  onSelect: (portfolioId: string) => void;
  onCreateNew: () => void;
}

// Native <select> + <button>, not a styled <div onClick> menu — the paper
// trading UI is keyboard-operated the same way the platform's own form
// controls are.
export function PortfolioSelector({
  portfolios,
  selectedId,
  onSelect,
  onCreateNew,
}: PortfolioSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="portfolio-selector">
      <label className="portfolio-selector__field">
        <span>{t('portfolio.selector.label')}</span>
        <select
          className="portfolio-select"
          value={selectedId ?? ''}
          onChange={(event) => onSelect(event.target.value)}
        >
          {portfolios.map((portfolio) => (
            <option key={portfolio.portfolio_id} value={portfolio.portfolio_id}>
              {portfolio.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="portfolio-selector__new" onClick={onCreateNew}>
        {t('portfolio.selector.new')}
      </button>
    </div>
  );
}
