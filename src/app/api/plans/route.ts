import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";

export async function GET() {
  const plans = await prisma.rebatePlan.findMany({
    where: { status: "active" },
    include: {
      contract: {
        include: {
          distributor: { select: { code: true, name: true } },
          endUser: { select: { name: true } },
        },
      },
    },
    orderBy: [
      { contract: { distributor: { code: "asc" } } },
      { planCode: "asc" },
    ],
  });

  return NextResponse.json(plans);
}

export async function POST(request: NextRequest) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canEdit(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { contractId, planCode, planName, discountType } = body;

  if (!contractId || !planCode || !discountType) {
    return NextResponse.json(
      { error: "Contract, plan code, and discount type are required" },
      { status: 400 }
    );
  }

  const existing = await prisma.rebatePlan.findFirst({
    where: { contractId, planCode },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Plan code already exists for this contract" },
      { status: 409 }
    );
  }

  const plan = await prisma.rebatePlan.create({
    data: {
      contractId,
      planCode,
      planName: planName || null,
      discountType,
    },
    include: {
      contract: {
        include: {
          distributor: { select: { code: true, name: true } },
          endUser: { select: { name: true } },
        },
      },
    },
  });

  await auditService.logCreate("rebate_plans", plan.id, {
    contractId,
    planCode,
    planName,
    discountType,
  }, user.id);

  return NextResponse.json(plan, { status: 201 });
}
