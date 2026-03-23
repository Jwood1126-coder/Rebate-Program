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

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Auto-generate code from name if not provided
  const finalCode = code
    ? code.toUpperCase()
    : name.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 20);

  const existing = await prisma.endUser.findUnique({ where: { code: finalCode } });
  if (existing) {
    // If auto-generated code conflicts, append a numeric suffix
    if (!code) {
      let suffix = 2;
      let candidate = `${finalCode.substring(0, 18)}${suffix}`;
      while (await prisma.endUser.findUnique({ where: { code: candidate } })) {
        suffix++;
        candidate = `${finalCode.substring(0, 18)}${suffix}`;
      }
      const endUser = await prisma.endUser.create({
        data: { code: candidate, name },
      });

      await auditService.logCreate("end_users", endUser.id, {
        code: endUser.code,
        name: endUser.name,
      }, user.id);

      return NextResponse.json(endUser, { status: 201 });
    }
    return NextResponse.json({ error: "End user code already exists" }, { status: 409 });
  }

  const endUser = await prisma.endUser.create({
    data: { code: finalCode, name },
  });

  await auditService.logCreate("end_users", endUser.id, {
    code: endUser.code,
    name: endUser.name,
  }, user.id);

  return NextResponse.json(endUser, { status: 201 });
}
