import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { RECORD_STATUSES, MANUAL_STATUSES } from "@/lib/constants/statuses";
import { validateRecord } from "@/lib/validation/validation.service";
import { auditService } from "@/lib/audit/audit.service";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { deriveRecordStatus } from "@/lib/utils/dates";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const recordId = Number(id);
  if (isNaN(recordId)) return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });

  const record = await prisma.rebateRecord.findUnique({
    where: { id: recordId },
    include: {
      rebatePlan: {
        include: {
          contract: {
            include: { distributor: true, endUser: true },
          },
        },
      },
      item: true,
      createdBy: { select: { displayName: true } },
      updatedBy: { select: { displayName: true } },
    },
  });

  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  return NextResponse.json(record);
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
  const recordId = Number(id);
  if (isNaN(recordId)) return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
  const body = await request.json();

  const existing = await prisma.rebateRecord.findUnique({ where: { id: recordId } });
  if (!existing) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  // Merge existing values with incoming changes for validation
  const mergedInput = {
    rebatePlanId: body.rebatePlanId ?? existing.rebatePlanId,
    itemId: body.itemId ?? existing.itemId,
    rebatePrice: body.rebatePrice !== undefined
      ? parseFloat(body.rebatePrice)
      : Number(existing.rebatePrice),
    startDate: body.startDate ?? existing.startDate.toISOString().split("T")[0],
    endDate: body.endDate !== undefined
      ? (body.endDate || null)
      : (existing.endDate?.toISOString().split("T")[0] ?? null),
  };

  // Run through the same validation as create
  const validationResult = await validateRecord(mergedInput, {
    mode: "update",
    existingRecordId: recordId,
    userId: user.id,
  });

  if (!validationResult.valid) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: validationResult.errors,
        warnings: validationResult.warnings,
      },
      { status: 422 }
    );
  }

  // If there are warnings and the client hasn't acknowledged them, return warnings for confirmation
  if (validationResult.warnings.length > 0 && !body.confirmWarnings) {
    return NextResponse.json({
      needsConfirmation: true,
      warnings: validationResult.warnings,
    });
  }

  // Build update payload from only the fields that were sent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};

  if (body.rebatePrice !== undefined) {
    updateData.rebatePrice = parseFloat(body.rebatePrice);
  }
  if (body.startDate !== undefined) {
    updateData.startDate = new Date(body.startDate);
  }
  if (body.endDate !== undefined) {
    updateData.endDate = body.endDate ? new Date(body.endDate) : null;
  }
  // Only accept manual statuses (draft, cancelled) from the client.
  // Derivable statuses (active, expired, future, superseded) are computed from dates.
  if (body.status !== undefined && MANUAL_STATUSES.has(body.status)) {
    updateData.status = body.status;
  } else if (body.status !== undefined && !MANUAL_STATUSES.has(body.status)) {
    // Client sent a derivable status — ignore it and re-derive from dates
  }

  // Re-derive status from dates if no manual status was set
  if (!updateData.status) {
    const effectiveStart = updateData.startDate ?? existing.startDate;
    const effectiveEnd = updateData.endDate !== undefined ? updateData.endDate : existing.endDate;
    updateData.status = deriveRecordStatus(
      effectiveStart,
      effectiveEnd,
      existing.supersededById,
      existing.status,
      new Date()
    );
  }

  updateData.updatedById = user.id;

  // Snapshot old record for audit diff
  const oldRecord: Record<string, unknown> = {
    rebatePrice: existing.rebatePrice.toString(),
    startDate: existing.startDate.toISOString(),
    endDate: existing.endDate?.toISOString() ?? null,
    status: existing.status,
  };

  const updated = await prisma.rebateRecord.update({
    where: { id: recordId },
    data: updateData,
  });

  const newRecord: Record<string, unknown> = {
    rebatePrice: updated.rebatePrice.toString(),
    startDate: updated.startDate.toISOString(),
    endDate: updated.endDate?.toISOString() ?? null,
    status: updated.status,
  };

  await auditService.logUpdate(
    "rebate_records",
    recordId,
    oldRecord,
    newRecord,
    user.id
  );

  return NextResponse.json(updated);
}

export async function DELETE(
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
  const recordId = Number(id);
  if (isNaN(recordId)) return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });

  const existing = await prisma.rebateRecord.findUnique({ where: { id: recordId } });
  if (!existing) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  // Soft delete — set status to cancelled, preserving history per P3
  const updated = await prisma.rebateRecord.update({
    where: { id: recordId },
    data: {
      status: RECORD_STATUSES.CANCELLED,
      updatedById: user.id,
    },
  });

  await auditService.logDelete(
    "rebate_records",
    recordId,
    { status: existing.status },
    { status: updated.status },
    user.id
  );

  return NextResponse.json(updated);
}
