import { redirect } from 'next/navigation';
import { getUser } from '@/server/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getUser()) redirect('/');
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Warung Bu Sri</h1>
      <p className="mt-1 text-sm text-muted">Masuk untuk membuka kasir atau laporan.</p>
      <LoginForm />
      <p className="mt-6 text-xs text-muted">
        Data contoh. Akun demo: kasir1@warungbusri.test atau owner@warungbusri.test, kata sandi warung123.
      </p>
    </main>
  );
}
