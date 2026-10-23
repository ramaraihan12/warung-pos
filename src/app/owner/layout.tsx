import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out';
import { requirePageUser } from '@/server/session';

export const dynamic = 'force-dynamic';

const links = [
  { href: '/owner', label: 'Ringkasan' },
  { href: '/owner/products', label: 'Produk' },
  { href: '/owner/stock', label: 'Stok' },
  { href: '/owner/reports', label: 'Laporan' },
  { href: '/owner/devices', label: 'Perangkat' },
];

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser('owner');
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <strong className="text-lg">Warung Bu Sri</strong>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Menu pemilik">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-brand-dark underline-offset-4 hover:underline">
                {l.label}
              </Link>
            ))}
            {/* A plain link on purpose: the till page should load as a full navigation. */}
            <a href="/pos" className="text-brand-dark underline-offset-4 hover:underline">
              Kasir
            </a>
          </nav>
          <span className="ml-auto text-sm text-muted">{user.name}</span>
          <SignOutButton className="text-sm text-muted underline" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
