import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canManageDistributors } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";

export async function GET() {
  const distributors = await prisma.distributor.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return NextResponse.json(distributors);
}

export async function POST(request: NextRequest) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canManageDistributors(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { code, name } = body;

  if (!code || !name) {
    return NextResponse.json({ error: "Code and name are required" }, { status: 400 });
  }

  const existing = await prisma.distributor.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: "Distributor code already exists" }, { status: 409 });
  }

  const distributor = await prisma.distributor.create({
    data: { code: code.toUpperCase(), name },
  });

  await auditService.logCreate("distributors", distributor.id, {
    code: distributor.code,
    name: distributor.name,
  }, user.id);

  return NextResponse.json(distributor, { status: 201 });
}
