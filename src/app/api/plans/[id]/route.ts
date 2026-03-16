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
  const plan = await prisma.rebatePlan.findUnique({
    where: { id: Number(id) },
    include: {
      contract: {
        include: {
          distributor: { select: { code: true, name: true } },
          endUser: { select: { code: true, name: true } },
        },
      },
    },
  });

  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(plan);
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

  const existing = await prisma.rebatePlan.findUnique({ where: { id: Number(id) } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.planName !== undefined) data.planName = body.planName;
  if (body.discountType !== undefined) data.discountType = body.discountType;
  if (body.status !== undefined) data.status = body.status;

  const updated = await prisma.rebatePlan.update({
    where: { id: Number(id) },
    data,
    include: {
      contract: {
        include: {
          distributor: { select: { code: true, name: true } },
          endUser: { select: { code: true, name: true } },
        },
      },
    },
  });

  await auditService.logUpdate("rebate_plans", updated.id,
    { planName: existing.planName, discountType: existing.discountType, status: existing.status },
    { planName: updated.planName, discountType: updated.discountType, status: updated.status },
    user.id
  );

  return NextResponse.json(updated);
}
