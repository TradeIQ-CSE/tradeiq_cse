import { useTranslation } from 'react-i18next';
import { RiAddLine } from '@remixicon/react';
import { Button } from '../../components/base/buttons/button';
import { Field } from './ui';
import { fieldShell } from './ui-styles';
import { Portfolio } from './types';

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
    <div className="flex flex-wrap items-end gap-3">
      <Field label={t('portfolio.selector.label')} className="max-w-xs">
        <select
          className={fieldShell}
          value={selectedId ?? ''}
          onChange={(event) => onSelect(event.target.value)}
        >
          {portfolios.map((portfolio) => (
            <option key={portfolio.portfolio_id} value={portfolio.portfolio_id}>
              {portfolio.name}
            </option>
          ))}
        </select>
      </Field>
      <Button variant="secondary" leadingIcon={RiAddLine} onClick={onCreateNew}>
        {t('portfolio.selector.new')}
      </Button>
    </div>
  );
}
