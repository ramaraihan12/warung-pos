import { requirePageUser } from '@/server/session';
import { Pos } from './pos';

export const dynamic = 'force-dynamic';

export default async function PosPage() {
  // Owners may use the till too. Anyone else is sent to the login screen.
  const user = await requirePageUser();
  return <Pos user={{ id: user.id, name: user.name, role: user.role }} />;
}
