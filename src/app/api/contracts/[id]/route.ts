import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";
import { CONTRACT_TYPES } from "@/lib/constants/statuses";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id: Number(id) },
    include: {
      distributor: { select: { id: true, code: true, name: true } },
      endUser: { select: { id: true, code: true, name: true } },
      rebatePlans: { select: { id: true, planCode: true, planName: true, status: true } },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(contract);
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

  const existing = await prisma.contract.findUnique({ where: { id: Number(id) } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.contractNumber !== undefined) data.contractNumber = body.contractNumber;
  if (body.customerNumber !== undefined) data.customerNumber = body.customerNumber || null;
  if (body.description !== undefined) data.description = body.description;
  if (body.status !== undefined) data.status = body.status;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.contractType !== undefined) {
    const validTypes = Object.values(CONTRACT_TYPES);
    if (!validTypes.includes(body.contractType)) {
      return NextResponse.json(
        { error: `Invalid contract type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }
    data.contractType = body.contractType;
  }
  if (body.noticePeriodDays !== undefined) {
    data.noticePeriodDays = body.noticePeriodDays ? Number(body.noticePeriodDays) : null;
  }

  // Determine effective contract type (from update or existing)
  const effectiveType = (data.contractType as string) ?? existing.contractType;
  const effectiveEndDate = data.endDate !== undefined ? data.endDate : existing.endDate;

  // Fixed-term contracts require an end date
  if (effectiveType === CONTRACT_TYPES.FIXED_TERM && !effectiveEndDate) {
    return NextResponse.json(
      { error: "Fixed-term contracts require an end date." },
      { status: 400 }
    );
  }

  // Normalize: fixed-term contracts never carry noticePeriodDays.
  // This handles both evergreen→fixed_term conversion AND stale/malicious
  // client sending noticePeriodDays to an already-fixed-term contract.
  if (effectiveType === CONTRACT_TYPES.FIXED_TERM) {
    data.noticePeriodDays = null;
  }

  const updated = await prisma.contract.update({
    where: { id: Number(id) },
    data,
    include: {
      distributor: { select: { code: true, name: true } },
      endUser: { select: { code: true, name: true } },
    },
  });

  await auditService.logUpdate("contracts", updated.id,
    {
      contractNumber: existing.contractNumber,
      customerNumber: existing.customerNumber,
      description: existing.description,
      contractType: existing.contractType,
      status: existing.status,
      startDate: existing.startDate?.toISOString() ?? null,
      endDate: existing.endDate?.toISOString() ?? null,
      noticePeriodDays: existing.noticePeriodDays,
      lastReviewedAt: existing.lastReviewedAt?.toISOString() ?? null,
    },
    {
      contractNumber: updated.contractNumber,
      customerNumber: updated.customerNumber,
      description: updated.description,
      contractType: updated.contractType,
      status: updated.status,
      startDate: updated.startDate?.toISOString() ?? null,
      endDate: updated.endDate?.toISOString() ?? null,
      noticePeriodDays: updated.noticePeriodDays,
      lastReviewedAt: updated.lastReviewedAt?.toISOString() ?? null,
    },
    user.id
  );

  return NextResponse.json(updated);
}
