import { useTranslation } from 'react-i18next';
import searchIcon from '../assets/icons/search.svg';
import './topbar.css';

interface TopBarProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export function TopBar({ search, onSearchChange }: TopBarProps) {
  const { t } = useTranslation();

  return (
    <div className="topbar">
      <label className="topbar__search">
        <img src={searchIcon} alt="" width={11} height={11} />
        <input
          type="search"
          placeholder={t('topbar.searchPlaceholder')}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
    </div>
  );
}
