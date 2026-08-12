import searchIcon from '../assets/icons/search.svg';
import aiAssistantIcon from '../assets/icons/ai-assistant.svg';
import './topbar.css';

interface TopBarProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export function TopBar({ search, onSearchChange }: TopBarProps) {
  return (
    <div className="topbar">
      <label className="topbar__search">
        <img src={searchIcon} alt="" width={11} height={11} />
        <input
          type="search"
          placeholder="Search symbol or company…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <div className="topbar__spacer" />
      <button type="button" className="topbar__ai-assistant" disabled>
        <img src={aiAssistantIcon} alt="" width={11} height={11} />
        AI Assistant
      </button>
    </div>
  );
}
