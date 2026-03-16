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
  const item = await prisma.item.findUnique({ where: { id: Number(id) } });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
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

  const existing = await prisma.item.findUnique({ where: { id: Number(id) } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.description !== undefined) data.description = body.description;
  if (body.productCode !== undefined) data.productCode = body.productCode;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const updated = await prisma.item.update({
    where: { id: Number(id) },
    data,
  });

  await auditService.logUpdate("items", updated.id,
    { description: existing.description, productCode: existing.productCode, isActive: existing.isActive },
    { description: updated.description, productCode: updated.productCode, isActive: updated.isActive },
    user.id
  );

  return NextResponse.json(updated);
}
