import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";
import { hash } from "bcryptjs";
import { USER_ROLES } from "@/lib/constants/statuses";

export async function GET() {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canManageUsers(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
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
    orderBy: { username: "asc" },
  });

  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canManageUsers(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { username, displayName, email, password, role } = body;

  if (!username || !displayName || !email || !password || !role) {
    return NextResponse.json(
      { error: "Username, display name, email, password, and role are required" },
      { status: 400 }
    );
  }

  const validRoles = Object.values(USER_ROLES);
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  const passwordHash = await hash(password, 12);

  const newUser = await prisma.user.create({
    data: { username, displayName, email, passwordHash, role },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  await auditService.logCreate("users", newUser.id, {
    username: newUser.username,
    displayName: newUser.displayName,
    email: newUser.email,
    role: newUser.role,
  }, user.id);

  return NextResponse.json(newUser, { status: 201 });
}
