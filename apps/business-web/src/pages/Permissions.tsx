import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, can, describeError, get, post, runCommand, type Branch, type Label, type Me } from '../api';

interface Member {
  id: string;
  displayName: string;
  status: 'active' | 'suspended';
}
interface Role {
  id: string;
  name: string;
  description: string;
  permissions: { resource: string; action: string }[];
}
interface Explanation {
  allow: boolean;
  reasonCode: string;
  source: { kind: 'role'; roleName: string } | { kind: 'exception'; grantId: string } | null;
}
interface Access {
  member: Member & { policyVersion: string };
  branches: Branch[];
  roleAssignments: { id: string; roleName: string; scope: 'tenant' | 'branches'; branchIds: string[]; reason: string }[];
  exceptions: { id: string; resource: string; action: string; effect: 'allow' | 'deny'; scope: { kind: 'tenant' } | { kind: 'branches'; branchIds: string[] } }[];
  matrix: {
    resource: string;
    label: Label;
    scope: 'branch' | 'tenant';
    actions: { action: string; label: Label; sensitive: boolean; company: Explanation; branches: Record<string, Explanation> }[];
  }[];
}

function why(e: Explanation): string {
  if (e.allow) return e.source?.kind === 'role' ? `مسموح بدور «${e.source.roleName}»` : 'مسموح باستثناء شخصي';
  if (e.reasonCode === 'explicit_deny') return 'ممنوع باستثناء شخصي صريح';
  if (e.reasonCode === 'membership_inactive') return 'المستخدم موقوف';
  return 'لا توجد صلاحية';
}

export function Permissions({ me, onPolicyChanged }: { me: Me; onPolicyChanged: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const canManage = can(me, 'permissions', 'manage');
  const canManageUsers = can(me, 'memberships', 'manage');
  const branchName = (id: string) => me.branches.find((b) => b.id === id)?.name ?? id;

  const loadMembers = useCallback(async () => {
    const [m, r] = await Promise.all([get<{ members: Member[] }>('/permissions/members'), get<{ roles: Role[] }>('/permissions/roles')]);
    setMembers(m.members);
    setRoles(r.roles);
  }, []);
  const loadAccess = useCallback(async (id: string) => setAccess(await get<Access>(`/permissions/members/${id}`)), []);

  useEffect(() => {
    loadMembers().catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, [loadMembers]);
  useEffect(() => {
    if (selected) loadAccess(selected).catch((e) => setMessage({ kind: 'error', text: describeError(e) }));
  }, [selected, loadAccess]);

  async function act(name: string, input: unknown, ok: string) {
    try {
      await runCommand(me, name, input);
      setMessage({ kind: 'ok', text: ok });
      await Promise.all([loadMembers(), selected ? loadAccess(selected) : null]);
    } catch (err) {
      setMessage({ kind: 'error', text: describeError(err) });
      if (err instanceof ApiError && err.code === 'policy_changed') onPolicyChanged();
    }
  }

  return (
    <section className="split">
      <aside className="card list">
        <h2>المستخدمون</h2>
        <ul>
          {members.map((m) => (
            <li key={m.id}>
              <button className={selected === m.id ? 'item active' : 'item'} onClick={() => setSelected(m.id)}>
                <span>{m.displayName}</span>
                {m.status === 'suspended' && <span className="badge cancelled">موقوف</span>}
                {m.id === me.membership.id && <span className="badge">أنت</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="detail">
        {message && <p className={message.kind === 'error' ? 'error' : 'ok'} role="status">{message.text}</p>}
        {!access ? (
          <div className="card muted">اختر مستخدمًا لعرض صلاحياته.</div>
        ) : (
          <>
            <div className="card">
              <div className="row spread">
                <h2>{access.member.displayName}</h2>
                {canManageUsers && access.member.id !== me.membership.id && (
                  access.member.status === 'active' ? (
                    <button className="danger" onClick={() => act('memberships.suspend', { membershipId: access.member.id, reason: 'إيقاف من شاشة الصلاحيات' }, 'تم إيقاف المستخدم')}>
                      إيقاف المستخدم
                    </button>
                  ) : (
                    <button onClick={() => act('memberships.reactivate', { membershipId: access.member.id, reason: 'تفعيل من شاشة الصلاحيات' }, 'تم تفعيل المستخدم')}>
                      تفعيل المستخدم
                    </button>
                  )
                )}
              </div>
              <h3>الأدوار</h3>
              {access.roleAssignments.length === 0 && <p className="muted">لا توجد أدوار.</p>}
              <ul className="chips">
                {access.roleAssignments.map((a) => (
                  <li key={a.id} className="chip">
                    <strong>{a.roleName}</strong>
                    <span>{a.scope === 'tenant' ? 'كل الفروع الحالية والمستقبلية' : a.branchIds.map(branchName).join('، ')}</span>
                    {canManage && access.member.id !== me.membership.id && (
                      <button className="link" aria-label="إزالة الدور" onClick={() => act('roles.unassign', { assignmentId: a.id, reason: 'إزالة من شاشة الصلاحيات' }, 'تمت إزالة الدور')}>
                        إزالة
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {access.exceptions.length > 0 && (
                <>
                  <h3>استثناءات شخصية</h3>
                  <ul className="chips">
                    {access.exceptions.map((x) => (
                      <li key={x.id} className={`chip ${x.effect}`}>
                        <strong>{x.effect === 'deny' ? 'منع' : 'سماح'}</strong>
                        <span>{x.resource}.{x.action}</span>
                        <span>{x.scope.kind === 'tenant' ? 'كل الشركة' : x.scope.branchIds.map(branchName).join('، ')}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {canManage && access.member.id !== me.membership.id && (
                <AssignRole roles={roles} branches={me.branches} onAssign={(roleId, scope) =>
                  act('roles.assign', { membershipId: access.member.id, roleId, scope, reason: 'تعيين من شاشة الصلاحيات' }, 'تم تعيين الدور')} />
              )}
            </div>

            <div className="card">
              <h3>النتيجة الفعلية</h3>
              <p className="muted small">كل خانة محسوبة بنفس القاعدة التي تطبقها الخوادم. مرّر المؤشر لمعرفة السبب.</p>
              <div className="scroll">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th>المورد</th>
                      <th>العملية</th>
                      {access.branches.map((b) => <th key={b.id}>{b.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {access.matrix.flatMap((r) =>
                      r.actions.map((a, i) => (
                        <tr key={`${r.resource}.${a.action}`}>
                          {i === 0 && <th rowSpan={r.actions.length}>{r.label.ar}</th>}
                          <td>{a.label.ar}{a.sensitive && <span className="badge warn" title="عملية حساسة">حساسة</span>}</td>
                          {r.scope === 'tenant' ? (
                            <td colSpan={access.branches.length} className={a.company.allow ? 'yes' : 'no'} title={why(a.company)}>
                              {a.company.allow ? '✓ كل الشركة' : '—'}
                            </td>
                          ) : (
                            access.branches.map((b) => {
                              const e = a.branches[b.id]!;
                              return (
                                <td key={b.id} className={e.allow ? 'yes' : e.reasonCode === 'explicit_deny' ? 'deny' : 'no'} title={why(e)}>
                                  {e.allow ? '✓' : e.reasonCode === 'explicit_deny' ? '⛔' : '—'}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <Simulator access={access} />
          </>
        )}
      </div>
    </section>
  );
}

function AssignRole({ roles, branches, onAssign }: { roles: Role[]; branches: Branch[]; onAssign: (roleId: string, scope: unknown) => void }) {
  const [roleId, setRoleId] = useState('');
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onAssign(roleId, all ? { kind: 'tenant' } : { kind: 'branches', branchIds: picked });
  };
  return (
    <form className="assign" onSubmit={submit}>
      <h3>إضافة دور</h3>
      <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
        <option value="">اختر دورًا…</option>
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.description}</option>)}
      </select>
      <fieldset>
        <legend>النطاق</legend>
        {branches.map((b) => (
          <label key={b.id} className="check">
            <input type="checkbox" disabled={all} checked={picked.includes(b.id)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, b.id] : picked.filter((x) => x !== b.id))} />
            {b.name}
          </label>
        ))}
        {/* Company-wide is a separate, explicit choice: it also covers branches opened later. */}
        <label className="check strong">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          كل الفروع (تشمل الفروع المستقبلية)
        </label>
      </fieldset>
      <button className="primary" disabled={!roleId || (!all && picked.length === 0)}>تعيين</button>
    </form>
  );
}

function Simulator({ access }: { access: Access }) {
  const options = access.matrix.flatMap((r) => r.actions.map((a) => ({ key: `${r.resource}.${a.action}`, scope: r.scope, label: `${r.label.ar} — ${a.label.ar}` })));
  const [capability, setCapability] = useState(options[0]?.key ?? '');
  const [branchId, setBranchId] = useState(access.branches[0]?.id ?? '');
  const [result, setResult] = useState<string | null>(null);
  const scope = options.find((o) => o.key === capability)?.scope;

  const run = async (e: FormEvent) => {
    e.preventDefault();
    const [resource, action] = capability.split('.');
    try {
      const r = await post<Explanation>('/permissions/simulate', {
        membershipId: access.member.id,
        resource,
        action,
        branchId: scope === 'branch' ? branchId : null,
      });
      setResult(`${r.allow ? '✓ نعم' : '✗ لا'} — ${why(r)}`);
    } catch (err) {
      setResult(describeError(err));
    }
  };

  return (
    <form className="card row" onSubmit={run}>
      <h3 className="grow-none">جرّب الصلاحيات</h3>
      <label>
        هل يستطيع
        <select value={capability} onChange={(e) => setCapability(e.target.value)}>
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
      {scope === 'branch' && (
        <label>
          في
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {access.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      )}
      <button>تحقق</button>
      {result && <output className="grow">{result}</output>}
    </form>
  );
}
