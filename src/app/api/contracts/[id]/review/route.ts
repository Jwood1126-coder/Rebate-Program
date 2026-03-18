import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";

/**
 * POST /api/contracts/:id/review
 * Marks a contract as reviewed by setting lastReviewedAt to now.
 * This is a manual operational action — also auto-triggered on contract update commits (Phase B).
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
  const contractId = Number(id);

  const existing = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  const updated = await prisma.contract.update({
    where: { id: contractId },
    data: { lastReviewedAt: now },
    include: {
      distributor: { select: { code: true, name: true } },
      endUser: { select: { code: true, name: true } },
    },
  });

  await auditService.logUpdate("contracts", contractId,
    { lastReviewedAt: existing.lastReviewedAt?.toISOString() ?? null },
    { lastReviewedAt: now.toISOString() },
    user.id
  );

  return NextResponse.json(updated);
}
