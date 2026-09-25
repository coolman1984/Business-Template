import { useEffect, useState } from 'react';
import { describeError, get, post } from '../api';

interface Choice {
  membershipId: string;
  tenantName: string;
  displayName: string;
}

export function ChooseCompany({ onChosen, onSignOut }: { onChosen: () => void; onSignOut: () => void }) {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<{ memberships: Choice[] }>('/session/memberships')
      .then(async ({ memberships }) => {
        // One company only: nothing to choose.
        if (memberships.length === 1) {
          await post('/session/membership', { membershipId: memberships[0]!.membershipId });
          onChosen();
        } else setChoices(memberships);
      })
      .catch((err) => setError(describeError(err)));
  }, [onChosen]);

  const choose = async (membershipId: string) => {
    try {
      await post('/session/membership', { membershipId });
      onChosen();
    } catch (err) {
      setError(describeError(err));
    }
  };

  return (
    <main className="center">
      <div className="card narrow">
        <h1>اختر الشركة</h1>
        {error && <p className="error" role="alert">{error}</p>}
        {choices?.length === 0 && <p className="muted">لا توجد شركة نشطة مرتبطة بحسابك.</p>}
        <ul className="choices">
          {choices?.map((c) => (
            <li key={c.membershipId}>
              <button onClick={() => choose(c.membershipId)}>
                <strong>{c.tenantName}</strong>
                <span className="muted">{c.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="link" onClick={onSignOut}>خروج</button>
      </div>
    </main>
  );
}
