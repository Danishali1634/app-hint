/**
 * @file Route #/login — a simple login form: username + password.
 *
 * FOR NOW this page has NO real login: there is no server yet. Pressing
 * "Log in" only checks that both fields are filled in, then opens the app.
 * Put the real login (e.g. Supabase) inside handleSubmit later.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const INPUT_CLASS =
  'w-full px-4 py-3 rounded-xl bg-paper-2 dark:bg-paper-2-dark border border-line dark:border-line-dark text-sm text-ink dark:text-ink-soft-dark outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition-all';
const LABEL_CLASS = 'block text-sm font-semibold text-ink dark:text-ink-soft-dark mb-1.5';

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault(); // don't reload the page

    if (!username.trim() || !password) {
      setError('Please enter your username and password');
      return;
    }

    // TODO: real login goes here (check the username and password on a server).
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-paper dark:bg-paper-dark">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-sm p-8 space-y-5"
      >
        <h1 className="text-2xl font-bold text-ink dark:text-ink-soft-dark">Log in</h1>

        <div>
          <label htmlFor="username" className={LABEL_CLASS}>
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="password" className={LABEL_CLASS}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={INPUT_CLASS}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          className="w-full h-12 rounded-xl bg-accent text-white font-semibold hover:bg-accent-dark transition-colors"
        >
          Log in
        </button>
      </form>
    </div>
  );
}
