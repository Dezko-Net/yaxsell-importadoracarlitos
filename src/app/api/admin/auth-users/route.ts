import { NextResponse } from 'next/server';
import { getAuth, listUsers } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/db-server';

export const dynamic = 'force-dynamic';

type AuthUser = {
  $id: string;
  email?: string;
  name?: string;
  $createdAt?: string;
};

/** Lista usuarios de Firebase Auth */
export async function GET() {
  try {
    const auth = getAuth(getAdminApp());
    const all: AuthUser[] = [];
    let pageToken: string | undefined;

    do {
      const result = await listUsers(auth, 1000, pageToken);
      for (const u of result.users) {
        all.push({
          $id: u.uid,
          email: u.email,
          name: u.displayName || undefined,
          $createdAt: u.metadata?.creationTime,
        });
      }
      pageToken = result.pageToken;
    } while (pageToken && all.length < 200);

    return NextResponse.json({ users: all });
  } catch (e) {
    return NextResponse.json(
      { users: [], error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
