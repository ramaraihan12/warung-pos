'use client';

import { authClient } from '@/lib/auth-client';
import { clearCachedPages } from '@/lib/client/use-offline-shell';

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      className={className}
      onClick={async () => {
        // The cached POS page carries the cashier's name, so it goes with the session.
        clearCachedPages();
        await authClient.signOut();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page load on purpose
        window.location.href = '/login';
      }}
    >
      Keluar
    </button>
  );
}
