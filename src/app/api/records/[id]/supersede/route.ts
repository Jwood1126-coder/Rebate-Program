// Guided supersede: end-date old record, create replacement, link via supersededById.
// All writes are atomic — if anything fails, nothing changes.

import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { validateRecord } from "@/lib/validation/validation.service";
import { AUDIT_ACTIONS } from "@/lib/constants/statuses";
import { computeInsertSnapshot, computeFieldDiff } from "@/lib/audit/diff";
import type { Prisma } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  // Load the record being superseded
  const existing = await prisma.rebateRecord.findUnique({
    where: { id: recordId },
    include: { rebatePlan: true, item: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  // Cannot supersede a record that is already superseded or cancelled
  if (existing.supersededById !== null) {
    return NextResponse.json(
      { error: "Record is already superseded" },
      { status: 409 },
    );
  }
  if (existing.status === "cancelled") {
    return NextResponse.json(
      { error: "Cannot supersede a cancelled record" },
      { status: 409 },
    );
  }

  // New record fields — pre-filled from old record, overridden by body
  const newPrice = body.rebatePrice !== undefined
    ? parseFloat(body.rebatePrice)
    : Number(existing.rebatePrice);
  const newStartDate = body.startDate || new Date().toISOString().split("T")[0];
  const newEndDate = body.endDate !== undefined ? (body.endDate || null) : null;

  // Validate the new record
  const validationInput = {
    rebatePlanId: existing.rebatePlanId,
    itemId: existing.itemId,
    rebatePrice: newPrice,
    startDate: newStartDate,
    endDate: newEndDate,
  };

  const validationResult = await validateRecord(validationInput, {
    mode: "create",
    userId: user.id,
    // The old record will be superseded, so exclude it from overlap checks
    supersedesRecordId: recordId,
  });

  if (!validationResult.valid) {
    return NextResponse.json(
      { error: "Validation failed", issues: validationResult.errors, warnings: validationResult.warnings },
      { status: 422 },
    );
  }

  if (validationResult.warnings.length > 0 && !body.confirmWarnings) {
    return NextResponse.json({
      needsConfirmation: true,
      warnings: validationResult.warnings,
    });
  }

  // End-date for the old record: day before the new record starts
  const newStart = new Date(newStartDate);
  const dayBefore = new Date(newStart);
  dayBefore.setDate(dayBefore.getDate() - 1);

  // Atomic: create new record + end-date old + link + audit
  const txResult = await prisma.$transaction(async (tx) => {
    // Create the replacement record
    const newRecord = await tx.rebateRecord.create({
      data: {
        rebatePlanId: existing.rebatePlanId,
        itemId: existing.itemId,
        rebatePrice: newPrice,
        startDate: newStart,
        endDate: newEndDate ? new Date(newEndDate) : null,
        status: "active",
        createdById: user.id,
        updatedById: user.id,
      },
    });

    // End-date and link the old record
    await tx.rebateRecord.update({
      where: { id: recordId },
      data: {
        endDate: dayBefore,
        status: "superseded",
        supersededById: newRecord.id,
        updatedById: user.id,
      },
    });

    // Audit: new record created
    await tx.auditLog.create({
      data: {
        tableName: "rebate_records",
        recordId: newRecord.id,
        action: AUDIT_ACTIONS.INSERT,
        changedFields: computeInsertSnapshot({
          rebatePlanId: newRecord.rebatePlanId,
          itemId: newRecord.itemId,
          rebatePrice: Number(newRecord.rebatePrice),
          startDate: newRecord.startDate.toISOString(),
          endDate: newRecord.endDate?.toISOString() ?? null,
          status: "active",
          supersedes: recordId,
        }) as unknown as Prisma.InputJsonValue,
        userId: user.id,
      },
    });

    // Audit: old record superseded
    await tx.auditLog.create({
      data: {
        tableName: "rebate_records",
        recordId,
        action: AUDIT_ACTIONS.UPDATE,
        changedFields: computeFieldDiff(
          {
            endDate: existing.endDate?.toISOString() ?? null,
            status: existing.status,
            supersededById: null,
          },
          {
            endDate: dayBefore.toISOString(),
            status: "superseded",
            supersededById: newRecord.id,
          },
        ) as unknown as Prisma.InputJsonValue,
        userId: user.id,
      },
    });

    return newRecord;
  });

  return NextResponse.json({
    success: true,
    newRecord: txResult,
    supersededRecordId: recordId,
  });
}
