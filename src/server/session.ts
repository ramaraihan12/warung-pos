import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth, type Role } from './auth';

export type AppUser = { id: string; name: string; email: string; role: Role };

export async function getUser(h?: Headers): Promise<AppUser | null> {
  const session = await getAuth().api.getSession({ headers: h ?? (await headers()) });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string };
  return { id: u.id, name: u.name, email: u.email, role: u.role === 'owner' ? 'owner' : 'cashier' };
}

/** For pages: send visitors to the login screen, and cashiers away from owner pages. */
export async function requirePageUser(role?: Role): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect('/login');
  if (role && user.role !== role) redirect(user.role === 'owner' ? '/owner' : '/pos');
  return user;
}

/** For route handlers: returns null instead of redirecting. */
export async function getApiUser(request: Request, role?: Role): Promise<AppUser | null> {
  const user = await getUser(request.headers);
  if (!user) return null;
  if (role && user.role !== role) return null;
  return user;
}
