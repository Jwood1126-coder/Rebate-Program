import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";
import { RECORD_STATUSES } from "@/lib/constants/statuses";
import { deriveRecordStatus } from "@/lib/utils/dates";

/**
 * POST /api/records/:id/restore
 *
 * Restores a soft-deleted (cancelled) record by re-deriving its status
 * from its dates and supersession state.
 */
export async function POST(
  _request: NextRequest,
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
  if (isNaN(recordId)) {
    return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
  }

  const existing = await prisma.rebateRecord.findUnique({ where: { id: recordId } });
  if (!existing) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  if (existing.status !== RECORD_STATUSES.CANCELLED) {
    return NextResponse.json(
      { error: `Record is "${existing.status}", not cancelled. Only cancelled records can be restored.` },
      { status: 409 }
    );
  }

  // Re-derive the correct status from dates and supersession
  const newStatus = existing.supersededById
    ? RECORD_STATUSES.SUPERSEDED
    : deriveRecordStatus(
        existing.startDate,
        existing.endDate,
        existing.supersededById,
        RECORD_STATUSES.ACTIVE, // base status
        new Date()
      );

  const updated = await prisma.rebateRecord.update({
    where: { id: recordId },
    data: {
      status: newStatus,
      updatedById: user.id,
    },
  });

  await auditService.logUpdate(
    "rebate_records",
    recordId,
    { status: existing.status },
    { status: newStatus, action: "restore" },
    user.id
  );

  return NextResponse.json(updated);
}
