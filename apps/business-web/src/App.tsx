import { useCallback, useEffect, useState } from 'react';
import { ApiError, can, get, post, type Me } from './api';
import { ChooseCompany } from './pages/ChooseCompany';
import { Login } from './pages/Login';
import { Orders } from './pages/Orders';
import { Permissions } from './pages/Permissions';

type Stage = { kind: 'loading' } | { kind: 'signed-out' } | { kind: 'choose' } | { kind: 'ready'; me: Me };

export function App() {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [page, setPage] = useState<'orders' | 'permissions'>('orders');

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
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>▦</span>
          <strong>{me.tenant.name}</strong>
        </div>
        <nav>
          <button className={page === 'orders' ? 'tab active' : 'tab'} onClick={() => setPage('orders')}>
            الطلبات
          </button>
          {canSeePermissions && (
            <button className={page === 'permissions' ? 'tab active' : 'tab'} onClick={() => setPage('permissions')}>
              الصلاحيات
            </button>
          )}
        </nav>
        <div className="who">
          <span>{me.membership.displayName}</span>
          <button className="link" onClick={() => setStage({ kind: 'choose' })}>تغيير الشركة</button>
          <button className="link" onClick={signOut}>خروج</button>
        </div>
      </header>
      <main className="content">
        {page === 'permissions' && canSeePermissions ? <Permissions me={me} onPolicyChanged={refresh} /> : <Orders me={me} onPolicyChanged={refresh} />}
      </main>
    </div>
  );
}
