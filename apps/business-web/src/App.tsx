import { useCallback, useEffect, useState } from 'react';
import { ApiError, can, get, post, type Me } from './api';
import { ChooseCompany } from './pages/ChooseCompany';
import { Login } from './pages/Login';
import { Orders } from './pages/Orders';
import { Jobs } from './pages/Jobs';
import { Permissions } from './pages/Permissions';
import { RecycleBin } from './pages/RecycleBin';
import { Stock } from './pages/inventory/Stock';
import { Tickets } from './pages/service/Tickets';

type Stage = { kind: 'loading' } | { kind: 'signed-out' } | { kind: 'choose' } | { kind: 'ready'; me: Me };

export function App() {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [page, setPage] = useState<'service' | 'orders' | 'stock' | 'recycle' | 'jobs' | 'permissions' | null>(null);

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

  const signOut = async () => {
    await post('/api/auth/sign-out', {});
    setStage({ kind: 'signed-out' });
  };

  if (stage.kind === 'loading') return <main className="center muted">جارٍ التحميل…</main>;
  if (stage.kind === 'signed-out') return <Login onSignedIn={refresh} />;
  if (stage.kind === 'choose') return <ChooseCompany onChosen={refresh} onSignOut={signOut} />;

  const { me } = stage;
  const canSeePermissions = can(me, 'permissions', 'view');
  const canSeeRecycle = can(me, 'orders', 'restore') || can(me, 'attachments', 'restore');
  const tabs = [
    { key: 'service', label: 'طلبات الصيانة', show: can(me, 'service_tickets', 'view') },
    { key: 'orders', label: 'الطلبات', show: can(me, 'orders', 'view') },
    { key: 'stock', label: 'المخزون', show: can(me, 'stock', 'view') || can(me, 'inventory_setup', 'manage') },
    { key: 'recycle', label: 'سلة المحذوفات', show: canSeeRecycle },
    { key: 'jobs', label: 'المهام', show: true },
    { key: 'permissions', label: 'الصلاحيات', show: canSeePermissions },
  ] as const;
  // Each company sees the screens of its own recipe; the first one the person may use opens by default.
  const current = tabs.find((t) => t.key === page && t.show)?.key ?? tabs.find((t) => t.show)!.key;
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>▦</span>
          <strong>{me.tenant.name}</strong>
        </div>
        <nav>
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.key} className={current === t.key ? 'tab active' : 'tab'} onClick={() => setPage(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="who">
          <span>{me.membership.displayName}</span>
          <button className="link" onClick={() => setStage({ kind: 'choose' })}>تغيير الشركة</button>
          <button className="link" onClick={signOut}>خروج</button>
        </div>
      </header>
      <main className="content">
        {current === 'permissions' ? (
          <Permissions me={me} onPolicyChanged={refresh} />
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
  );
}
