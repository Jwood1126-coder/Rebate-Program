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

/**
 * DELETE /api/contracts/:id — Delete a contract and all child data.
 * Cascades through plans, records, update runs, diffs, and audit entries.
 * This is a hard delete for testing/cleanup. In production, prefer cancellation.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionResult = await getSessionUser();
  if ("error" in sessionResult) return sessionResult.error;
  if (!canEdit(sessionResult.user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const contractId = Number(id);
  if (isNaN(contractId)) {
    return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, contractNumber: true },
  });
  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cascade delete inside a transaction
  await prisma.$transaction(async (tx) => {
    // Get plan IDs and record IDs for this contract
    const plans = await tx.rebatePlan.findMany({
      where: { contractId },
      select: { id: true },
    });
    const planIds = plans.map((p) => p.id);

    const records = await tx.rebateRecord.findMany({
      where: { rebatePlanId: { in: planIds } },
      select: { id: true },
    });
    const recordIds = records.map((r) => r.id);

    // Delete contract update diffs and runs
    const updateRuns = await tx.contractUpdateRun.findMany({
      where: { contractId },
      select: { id: true },
    });
    const updateRunIds = updateRuns.map((r) => r.id);
    if (updateRunIds.length > 0) {
      await tx.contractUpdateDiff.deleteMany({ where: { runId: { in: updateRunIds } } });
      await tx.contractUpdateRun.deleteMany({ where: { contractId } });
    }

    // Delete record notes
    if (recordIds.length > 0) {
      await tx.recordNote.deleteMany({ where: { rebateRecordId: { in: recordIds } } });
    }

    // Clear supersession references before deleting records
    if (recordIds.length > 0) {
      await tx.rebateRecord.updateMany({
        where: { supersededById: { in: recordIds } },
        data: { supersededById: null },
      });
    }

    // Delete records, then plans
    if (planIds.length > 0) {
      await tx.rebateRecord.deleteMany({ where: { rebatePlanId: { in: planIds } } });
      await tx.rebatePlan.deleteMany({ where: { contractId } });
    }

    // Delete audit entries referencing this contract
    await tx.auditLog.deleteMany({ where: { tableName: "contracts", recordId: contractId } });
    if (recordIds.length > 0) {
      await tx.auditLog.deleteMany({ where: { tableName: "rebate_records", recordId: { in: recordIds } } });
    }

    // Delete the contract itself
    await tx.contract.delete({ where: { id: contractId } });
  });

  return NextResponse.json({ success: true, contractNumber: contract.contractNumber });
}
