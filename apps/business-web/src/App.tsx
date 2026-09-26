import { useCallback, useEffect, useState } from 'react';
import { ApiError, can, get, post, type Me } from './api';
import { useI18n } from './i18n';
import { useTheme } from './theme/ThemeProvider';
import {
  BuildingIcon,
  ClipboardIcon,
  LedgerIcon,
  ListChecksIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  PackageIcon,
  ShieldIcon,
  SunIcon,
  TrashIcon,
  WrenchIcon,
} from './design/icons';
import { Accounting } from './pages/accounting/Accounting';
import { ChooseCompany } from './pages/ChooseCompany';
import { Login } from './pages/Login';
import { Orders } from './pages/Orders';
import { Jobs } from './pages/Jobs';
import { Permissions } from './pages/Permissions';
import { RecycleBin } from './pages/RecycleBin';
import { Stock } from './pages/inventory/Stock';
import { Tickets } from './pages/service/Tickets';

type Stage = { kind: 'loading' } | { kind: 'signed-out' } | { kind: 'choose' } | { kind: 'ready'; me: Me };
type PageKey = 'accounting' | 'service' | 'orders' | 'stock' | 'recycle' | 'jobs' | 'permissions';

export function App() {
  const { t, locale, toggleLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [page, setPage] = useState<PageKey | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStage({ kind: 'ready', me: await get<Me>('/me') });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'no_membership_selected') setStage({ kind: 'choose' });
      else setStage({ kind: 'signed-out' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  const signOut = async () => {
    await post('/api/auth/sign-out', {});
    setStage({ kind: 'signed-out' });
  };

  if (stage.kind === 'loading') return <main className="center muted">{t('common.loading')}</main>;
  if (stage.kind === 'signed-out') return <Login onSignedIn={refresh} />;
  if (stage.kind === 'choose') return <ChooseCompany onChosen={refresh} onSignOut={signOut} />;

  const { me } = stage;
  const canSeePermissions = can(me, 'permissions', 'view');
  const canSeeRecycle = can(me, 'orders', 'restore') || can(me, 'attachments', 'restore');
  const tabs: { key: PageKey; label: string; icon: typeof WrenchIcon; show: boolean }[] = [
    { key: 'accounting', label: t('nav.accounting'), icon: LedgerIcon, show: can(me, 'journal', 'view') || can(me, 'financial_reports', 'view') || can(me, 'accounting_setup', 'manage') },
    { key: 'service', label: t('nav.service'), icon: WrenchIcon, show: can(me, 'service_tickets', 'view') },
    { key: 'orders', label: t('nav.orders'), icon: ClipboardIcon, show: can(me, 'orders', 'view') },
    { key: 'stock', label: t('nav.stock'), icon: PackageIcon, show: can(me, 'stock', 'view') || can(me, 'inventory_setup', 'manage') },
    { key: 'recycle', label: t('nav.recycle'), icon: TrashIcon, show: canSeeRecycle },
    { key: 'jobs', label: t('nav.jobs'), icon: ListChecksIcon, show: true },
    { key: 'permissions', label: t('nav.permissions'), icon: ShieldIcon, show: canSeePermissions },
  ];
  // Each company sees the screens of its own recipe; the first one the person may use opens by default.
  const current = tabs.find((tb) => tb.key === page && tb.show)?.key ?? tabs.find((tb) => tb.show)!.key;
  const select = (key: PageKey) => {
    setPage(key);
    setMobileNavOpen(false);
  };

  return (
    <div className="shell">
      <div className={`sidebar-scrim ${mobileNavOpen ? 'open' : ''}`} onClick={() => setMobileNavOpen(false)} />
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="mark" aria-hidden>BSF</span>
          <span className="name">{me.tenant.name}</span>
        </div>
        <nav className="sidebar-nav" aria-label={t('shell.appName')}>
          {tabs.filter((tb) => tb.show).map((tb) => {
            const Icon = tb.icon;
            return (
              <button
                key={tb.key}
                className={current === tb.key ? 'nav-item active' : 'nav-item'}
                aria-current={current === tb.key ? 'page' : undefined}
                onClick={() => select(tb.key)}
              >
                <Icon size={16} />
                <span>{tb.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-start">
            <button className="icon-button menu-button" aria-label={t('shell.toggleMenu')} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((v) => !v)}>
              <MenuIcon size={18} />
            </button>
          </div>
          <div className="topbar-end">
            <button className="icon-button" aria-label={t('shell.toggleTheme')} onClick={toggleTheme}>
              {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
            </button>
            <button className="icon-button" aria-label={locale === 'ar' ? 'English' : 'العربية'} onClick={toggleLocale} title={locale === 'ar' ? 'English' : 'العربية'}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{locale === 'ar' ? 'EN' : 'AR'}</span>
            </button>
            <span className="who">
              <BuildingIcon size={14} />
              <span className="name">{me.membership.displayName}</span>
            </span>
            <button className="icon-button" aria-label={t('shell.changeCompany')} title={t('shell.changeCompany')} onClick={() => setStage({ kind: 'choose' })}>
              <BuildingIcon size={16} />
            </button>
            <button className="icon-button" aria-label={t('shell.signOut')} title={t('shell.signOut')} onClick={signOut}>
              <LogOutIcon size={16} />
            </button>
          </div>
        </header>
        {/* Keyed by language: pages remount on a switch, so messages already on screen never stay in the old language. */}
        <main className="content" key={locale}>
          {current === 'permissions' ? (
            <Permissions me={me} onPolicyChanged={refresh} />
          ) : current === 'accounting' ? (
            <Accounting me={me} onPolicyChanged={refresh} />
          ) : current === 'service' ? (
            <Tickets me={me} onPolicyChanged={refresh} />
          ) : current === 'stock' ? (
            <Stock me={me} onPolicyChanged={refresh} />
          ) : current === 'recycle' ? (
            <RecycleBin me={me} onPolicyChanged={refresh} />
          ) : current === 'jobs' ? (
            <Jobs me={me} onPolicyChanged={refresh} />
          ) : (
            <Orders me={me} onPolicyChanged={refresh} />
          )}
        </main>
      </div>
    </div>
  );
}
