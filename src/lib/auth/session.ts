import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/constants/statuses";

export interface SessionUser {
  id: number;
  name: string;
  role: UserRole;
}

/**
 * Get the authenticated user from the session, or return a 401 response.
 * Use in API route handlers that require authentication.
 */
export async function getSessionUser(): Promise<
  { user: SessionUser } | { error: NextResponse }
> {
  const session = await auth();

  if (!session?.user) {
    return {
      error: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  const user = session.user as unknown as { id: number; name: string; role: UserRole };

  if (!user.id || !user.role) {
    return {
      error: NextResponse.json(
        { error: "Invalid session" },
        { status: 401 }
      ),
    };
  }

  return { user: { id: user.id, name: user.name, role: user.role } };
}
