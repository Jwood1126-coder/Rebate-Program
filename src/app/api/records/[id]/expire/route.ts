// Expire a record: set endDate to today (or a specified date), audit the change.

import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";

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
  const body = await request.json().catch(() => ({}));

  const existing = await prisma.rebateRecord.findUnique({
    where: { id: recordId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  if (existing.supersededById !== null) {
    return NextResponse.json(
      { error: "Record is already superseded" },
      { status: 409 },
    );
  }

  if (existing.status === "cancelled") {
    return NextResponse.json(
      { error: "Cannot expire a cancelled record" },
      { status: 409 },
    );
  }

  // If the record already has a past endDate, it's already expired
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (existing.endDate && existing.endDate < today) {
    return NextResponse.json(
      { error: "Record is already expired" },
      { status: 409 },
    );
  }

  // Use provided expireDate or default to today
  const expireDate = body.expireDate ? new Date(body.expireDate) : today;

  const updated = await prisma.rebateRecord.update({
    where: { id: recordId },
    data: {
      endDate: expireDate,
      updatedById: user.id,
    },
  });

  await auditService.logUpdate(
    "rebate_records",
    recordId,
    {
      endDate: existing.endDate?.toISOString() ?? null,
    },
    {
      endDate: updated.endDate?.toISOString() ?? null,
    },
    user.id,
  );

  return NextResponse.json({ success: true, record: updated });
}
