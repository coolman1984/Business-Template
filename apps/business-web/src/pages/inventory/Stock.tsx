import { useCallback, useEffect, useState } from 'react';
import { can, describeError, get, type Me } from '../../api';
import { useI18n } from '../../i18n';
import { Balances } from './Balances';
import { Documents } from './Documents';
import { Import } from './Import';
import { Setup } from './Setup';
import type { Item, Warehouse } from './types';

type View = 'balances' | 'documents' | 'import' | 'setup';

export function Stock({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[] | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('balances');
  const [refreshKey, setRefreshKey] = useState(0);
  const canSetup = can(me, 'inventory_setup', 'manage');
  const canImport = can(me, 'stock', 'import');

  const load = useCallback(() => {
    Promise.all([get<{ items: Item[] }>('/inventory/items'), get<{ warehouses: Warehouse[] }>('/inventory/warehouses')])
      .then(([i, w]) => {
        setItems(i.items);
        setWarehouses(w.warehouses);
      })
      .catch((e) => setError(describeError(e)));
  }, []);
  useEffect(load, [load]);

  const views: { key: View; label: string; show: boolean }[] = [
    { key: 'balances', label: t('inventory.tabs.balances'), show: true },
    { key: 'documents', label: t('inventory.tabs.documents'), show: true },
    { key: 'import', label: t('inventory.tabs.import'), show: canImport },
    { key: 'setup', label: t('inventory.tabs.setup'), show: canSetup },
  ];

  if (error) return <p className="error">{error}</p>;
  if (!items || !warehouses) return <p className="muted">{t('common.loading')}</p>;
  const empty = items.length === 0 || warehouses.length === 0;

  return (
    <section>
      <h1>{t('inventory.title')}</h1>
      <nav className="segmented" aria-label={t('inventory.sectionsLabel')}>
        {views.filter((v) => v.show).map((v) => (
          <button key={v.key} className={view === v.key ? 'tab active' : 'tab'} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </nav>
      {empty && view !== 'setup' && (
        <p className="warn-box">
          {canSetup ? t('inventory.emptySetupHint') : t('inventory.emptyNoAccessHint')}
        </p>
      )}
      {view === 'balances' && <Balances key={refreshKey} warehouses={warehouses} />}
      {view === 'documents' && <Documents key={refreshKey} me={me} items={items} warehouses={warehouses} onPolicyChanged={onPolicyChanged} />}
      {view === 'import' && <Import me={me} warehouses={warehouses} onDone={() => setRefreshKey((k) => k + 1)} onPolicyChanged={onPolicyChanged} />}
      {view === 'setup' && <Setup me={me} items={items} warehouses={warehouses} onChanged={load} onPolicyChanged={onPolicyChanged} />}
    </section>
  );
}
