/**
 * GET /api/admin/login-events — View login activity. Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;

  // Admin only
  if (result.user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  const events = await prisma.loginEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { displayName: true, role: true } } },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      username: e.username,
      displayName: e.user.displayName,
      role: e.user.role,
      action: e.action,
      ipAddress: e.ipAddress,
      timestamp: e.createdAt.toISOString(),
    })),
  });
}
