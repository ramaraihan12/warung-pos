'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { clearCachedPages } from '@/lib/client/use-offline-shell';

export function SignOutButton({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      className={className}
      title={failed ? 'Tidak bisa keluar saat offline. Coba lagi setelah tersambung.' : undefined}
      onClick={async () => {
        setFailed(false);
        try {
          const result = await authClient.signOut();
          if (result?.error) throw new Error('sign out failed');
        } catch {
          // Offline or server down: stay signed in and keep the cached till so a reload still works.
          setFailed(true);
          return;
        }
        // The cached POS page carries the cashier's name, so it goes with the session.
        clearCachedPages();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page load on purpose
        window.location.href = '/login';
      }}
    >
      {failed ? 'Gagal keluar' : 'Keluar'}
    </button>
  );
}
