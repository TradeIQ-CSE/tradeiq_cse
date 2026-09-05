import { MenuOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import searchIcon from '../../assets/icons/search.svg';
import './topbar.css';

interface TopbarProps {
  isMobile: boolean;
  onMenuClick: () => void;
  search?: string;
  onSearchChange?: (value: string) => void;
}

export function Topbar({
  isMobile,
  onMenuClick,
  search,
  onSearchChange,
}: TopbarProps) {
  const { t } = useTranslation();
  const hasSearch = search !== undefined && onSearchChange !== undefined;

  return (
    <header className={`topbar${isMobile ? ' topbar--mobile' : ''}`}>
      <div className="topbar__left">
        {isMobile && (
          <button
            type="button"
            className="topbar__menu"
            aria-label="Open navigation"
            onClick={onMenuClick}
          >
            <MenuOutlined />
          </button>
        )}

        {hasSearch && (
          <label className="topbar__search">
            <img src={searchIcon} alt="" width={11} height={11} />
            <input
              aria-label={t('topbar.searchPlaceholder')}
              placeholder={t('topbar.searchPlaceholder')}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
        )}
      </div>
    </header>
  );
}
