import { redirect } from 'next/navigation';
import { getUser } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getUser();
  if (!user) redirect('/login');
  redirect(user.role === 'owner' ? '/owner' : '/pos');
}
