import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const tableName = searchParams.get("table");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (action) where.action = action;
  if (tableName) where.tableName = tableName;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { displayName: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({ entries, total, page, limit });
}
