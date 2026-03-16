import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";

export async function GET() {
  const endUsers = await prisma.endUser.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(endUsers);
}

export async function POST(request: NextRequest) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canEdit(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { code, name } = body;

  if (!code || !name) {
    return NextResponse.json({ error: "Code and name are required" }, { status: 400 });
  }

  const existing = await prisma.endUser.findUnique({ where: { code: code.toUpperCase() } });
  if (existing) {
    return NextResponse.json({ error: "End user code already exists" }, { status: 409 });
  }

  const endUser = await prisma.endUser.create({
    data: { code: code.toUpperCase(), name },
  });

  await auditService.logCreate("end_users", endUser.id, {
    code: endUser.code,
    name: endUser.name,
  }, user.id);

  return NextResponse.json(endUser, { status: 201 });
}
