import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";
import { hash } from "bcryptjs";
import { USER_ROLES } from "@/lib/constants/statuses";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canManageUsers(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const targetUser = await prisma.user.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(targetUser);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canManageUsers(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.user.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.role) {
    const validRoles = Object.values(USER_ROLES);
    if (!validRoles.includes(body.role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {};
  if (body.displayName !== undefined) data.displayName = body.displayName;
  if (body.email !== undefined) data.email = body.email;
  if (body.role !== undefined) data.role = body.role;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.password) data.passwordHash = await hash(body.password, 12);

  const updated = await prisma.user.update({
    where: { id: Number(id) },
    data,
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  });

  await auditService.logUpdate("users", updated.id,
    { displayName: existing.displayName, email: existing.email, role: existing.role, isActive: existing.isActive },
    { displayName: updated.displayName, email: updated.email, role: updated.role, isActive: updated.isActive },
    user.id
  );

  return NextResponse.json(updated);
}
