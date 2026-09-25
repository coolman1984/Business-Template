import { describe, expect, it } from 'vitest';
import { authorize, effectiveBranchScope, type AuthorizationSubject, type Grant } from '../src/authorization.js';

const branches = (...ids: string[]) => ({ kind: 'branches' as const, branchIds: ids });
const subject = (grants: Grant[], status: 'active' | 'suspended' = 'active'): AuthorizationSubject => ({
  membershipId: 'm1',
  status,
  policyVersion: '1',
  grants,
});
const g = (id: string, resource: string, action: string, effect: 'allow' | 'deny', scope: Grant['scope']): Grant => ({
  id,
  resource,
  action,
  effect,
  scope,
});

describe('authorize', () => {
  it('denies by default', () => {
    expect(authorize(subject([]), { resource: 'orders', action: 'view', branchId: 'A' })).toMatchObject({
      allow: false,
      reasonCode: 'no_matching_grant',
    });
  });

  it('never combines an action from one grant with the scope of another', () => {
    const s = subject([g('1', 'orders', 'export', 'allow', branches('A')), g('2', 'orders', 'view', 'allow', branches('B'))]);
    expect(authorize(s, { resource: 'orders', action: 'export', branchId: 'A' }).allow).toBe(true);
    expect(authorize(s, { resource: 'orders', action: 'view', branchId: 'B' }).allow).toBe(true);
    expect(authorize(s, { resource: 'orders', action: 'export', branchId: 'B' }).allow).toBe(false);
  });

  it('lets an explicit deny win over any allow in its scope', () => {
    const s = subject([g('1', 'orders', 'create', 'allow', { kind: 'tenant' }), g('2', 'orders', 'create', 'deny', branches('B'))]);
    expect(authorize(s, { resource: 'orders', action: 'create', branchId: 'A' }).allow).toBe(true);
    expect(authorize(s, { resource: 'orders', action: 'create', branchId: 'B' })).toMatchObject({
      allow: false,
      reasonCode: 'explicit_deny',
      matchedGrantId: '2',
    });
  });

  it('does not let a branch-scoped grant cover tenant-level records', () => {
    const s = subject([g('1', 'permissions', 'manage', 'allow', branches('A'))]);
    expect(authorize(s, { resource: 'permissions', action: 'manage', branchId: null }).allow).toBe(false);
  });

  it('denies everything for a suspended membership', () => {
    const s = subject([g('1', 'orders', 'view', 'allow', { kind: 'tenant' })], 'suspended');
    expect(authorize(s, { resource: 'orders', action: 'view', branchId: 'A' }).reasonCode).toBe('membership_inactive');
  });
});

describe('effectiveBranchScope', () => {
  it('lists exactly the allowed branches minus denied ones', () => {
    const s = subject([
      g('1', 'orders', 'view', 'allow', branches('A', 'B')),
      g('2', 'orders', 'view', 'deny', branches('B')),
      g('3', 'orders', 'create', 'allow', branches('C')),
    ]);
    expect(effectiveBranchScope(s, 'orders', 'view')).toEqual({ all: false, branchIds: ['A'] });
  });

  it('keeps tenant scope open-ended but honours branch denies', () => {
    const s = subject([g('1', 'orders', 'view', 'allow', { kind: 'tenant' }), g('2', 'orders', 'view', 'deny', branches('B'))]);
    expect(effectiveBranchScope(s, 'orders', 'view')).toEqual({ all: true, exceptBranchIds: ['B'] });
  });

  it('returns nothing when a tenant-wide deny exists', () => {
    const s = subject([g('1', 'orders', 'view', 'allow', { kind: 'tenant' }), g('2', 'orders', 'view', 'deny', { kind: 'tenant' })]);
    expect(effectiveBranchScope(s, 'orders', 'view')).toEqual({ all: false, branchIds: [] });
  });
});
