import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import './app-shell.css';

interface AppShellProps {
  search: string;
  onSearchChange: (value: string) => void;
  children: ReactNode;
}

export function AppShell({ search, onSearchChange, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <TopBar search={search} onSearchChange={onSearchChange} />
        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
