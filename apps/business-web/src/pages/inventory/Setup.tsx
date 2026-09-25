import { useState, type FormEvent } from 'react';
import { ApiError, describeError, runCommand, type Me } from '../../api';
import { useI18n } from '../../i18n';
import type { Item, Warehouse } from './types';

/** Items (company-wide) and warehouses (one branch each). Deactivating keeps history; nothing is deleted. */
export function Setup({ me, items, warehouses, onChanged, onPolicyChanged }: { me: Me; items: Item[]; warehouses: Warehouse[]; onChanged: () => void; onPolicyChanged: () => void }) {
  const { t } = useI18n();
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [item, setItem] = useState({ code: '', name: '', unit: t('setup.defaultUnit') });
  const [wh, setWh] = useState({ branchId: me.branches[0]?.id ?? '', code: '', name: '' });
  const branchName = (id: string) => me.branches.find((b) => b.id === id)?.name ?? t('common.dash');

  const run = async (name: string, input: unknown, ok: string) => {
    try {
      await runCommand(me, name, input);
      setMessage({ kind: 'ok', text: ok });
      onChanged();
      return true;
    } catch (e) {
      setMessage({ kind: 'error', text: describeError(e) });
      if (e instanceof ApiError && e.code === 'policy_changed') onPolicyChanged();
      return false;
    }
  };

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    if (await run('inventory.item_create', item, t('setup.itemAdded', { code: item.code }))) setItem({ code: '', name: '', unit: item.unit });
  };
  const addWarehouse = async (e: FormEvent) => {
    e.preventDefault();
    if (await run('inventory.warehouse_create', wh, t('setup.warehouseAdded', { name: wh.name }))) setWh({ ...wh, code: '', name: '' });
  };

  return (
    <>
      {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
      <div className="split-even">
        <section className="card">
          <h2>{t('setup.items')}</h2>
          <form className="row" onSubmit={addItem}>
            <label>
              {t('setup.code')}
              <input dir="ltr" value={item.code} onChange={(e) => setItem({ ...item, code: e.target.value.replace(/\s/g, '') })} required maxLength={40} size={10} />
            </label>
            <label className="grow">
              {t('setup.name')}
              <input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} required maxLength={200} />
            </label>
            <label>
              {t('setup.unit')}
              <input value={item.unit} onChange={(e) => setItem({ ...item, unit: e.target.value })} required maxLength={20} size={6} />
            </label>
            <button className="primary">{t('setup.add')}</button>
          </form>
          <div className="scroll">
            <table>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className={i.active ? '' : 'inactive'}>
                    <td dir="ltr" className="mono">{i.code}</td>
                    <td>{i.name}</td>
                    <td className="muted">{i.unit}</td>
                    <td>
                      <button className="link" onClick={() => run('inventory.item_update', { itemId: i.id, expectedVersion: i.version, active: !i.active }, i.active ? t('setup.itemDeactivated', { name: i.name }) : t('setup.itemActivated', { name: i.name }))}>
                        {i.active ? t('setup.deactivate') : t('setup.activate')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h2>{t('setup.warehouses')}</h2>
          <form className="row" onSubmit={addWarehouse}>
            <label>
              {t('setup.branch')}
              <select value={wh.branchId} onChange={(e) => setWh({ ...wh, branchId: e.target.value })}>
                {me.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t('setup.code')}
              <input dir="ltr" value={wh.code} onChange={(e) => setWh({ ...wh, code: e.target.value.replace(/\s/g, '') })} required maxLength={20} size={8} />
            </label>
            <label className="grow">
              {t('setup.name')}
              <input value={wh.name} onChange={(e) => setWh({ ...wh, name: e.target.value })} required maxLength={200} />
            </label>
            <button className="primary">{t('setup.add')}</button>
          </form>
          <table>
            <tbody>
              {warehouses.map((w) => (
                <tr key={w.id} className={w.active ? '' : 'inactive'}>
                  <td dir="ltr" className="mono">{w.code}</td>
                  <td>{w.name}</td>
                  <td className="muted">{branchName(w.branchId)}</td>
                  <td>
                    <button className="link" onClick={() => run('inventory.warehouse_update', { warehouseId: w.id, expectedVersion: w.version, active: !w.active }, w.active ? t('setup.warehouseDeactivated', { name: w.name }) : t('setup.warehouseActivated', { name: w.name }))}>
                      {w.active ? t('setup.deactivate') : t('setup.activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
