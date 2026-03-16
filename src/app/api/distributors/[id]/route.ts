import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const distributor = await prisma.distributor.findUnique({
    where: { id: Number(id) },
    include: {
      contracts: {
        include: { endUser: true, rebatePlans: true },
        orderBy: { contractNumber: "asc" },
      },
    },
  });

  if (!distributor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(distributor);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canEdit(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, isActive } = body;

  const existing = await prisma.distributor.findUnique({ where: { id: Number(id) } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (isActive !== undefined) data.isActive = isActive;

  const updated = await prisma.distributor.update({
    where: { id: Number(id) },
    data,
  });

  await auditService.logUpdate("distributors", updated.id,
    { name: existing.name, isActive: existing.isActive },
    { name: updated.name, isActive: updated.isActive },
    user.id
  );

  return NextResponse.json(updated);
}
