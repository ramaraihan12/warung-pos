'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    if (error) {
      setError(
        error.status === 401 || error.status === 400
          ? 'Email atau kata sandi salah.'
          : 'Tidak bisa masuk. Cek koneksi.',
      );
      setBusy(false);
      return;
    }
    // A full page load, not a client transition, so the service worker sees the navigation to /pos.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page load on purpose
    window.location.href = '/';
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-base"
        />
      </label>
      <label className="block text-sm font-medium">
        Kata sandi
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-base"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full rounded-md bg-brand px-4 py-2.5 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? 'Masuk...' : 'Masuk'}
      </button>
    </form>
  );
}
