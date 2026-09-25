import { useState, type FormEvent } from 'react';
import { describeError, post } from '../api';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/api/auth/sign-in/email', { email, password });
      onSignedIn();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="center">
      <form className="card narrow" onSubmit={submit}>
        <h1>تسجيل الدخول</h1>
        <label>
          البريد الإلكتروني
          <input type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          كلمة المرور
          <input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
      </form>
    </main>
  );
}
