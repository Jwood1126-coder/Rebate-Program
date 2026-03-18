import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";
import { CONTRACT_STATUSES } from "@/lib/constants/statuses";

/**
 * POST /api/contracts/:id/approve
 *
 * Transitions contract approval status:
 *   pending_review → active  (approve)
 *   pending_review → cancelled (reject)
 *   active → pending_review  (revert — undo approval)
 *   cancelled → pending_review (revert — undo rejection)
 *
 * Body: { action: "approve" | "reject" | "revert", note?: string }
 *
 * Approval is auditable. This endpoint is the natural future insertion
 * point for catalog validation (e.g., Catsy/PIMS verification) before
 * allowing approval to proceed.
 */
export async function POST(
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
  const contractId = Number(id);
  if (isNaN(contractId)) {
    return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
  }

  const body = await request.json();
  const action = body.action as string;

  if (!action || !["approve", "reject", "revert"].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid action. Must be "approve", "reject", or "revert".' },
      { status: 400 }
    );
  }

  const existing = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Determine valid transitions
  let newStatus: string;
  if (action === "revert") {
    // Revert: active or cancelled → pending_review
    if (existing.status !== CONTRACT_STATUSES.ACTIVE && existing.status !== CONTRACT_STATUSES.CANCELLED) {
      return NextResponse.json(
        { error: `Cannot revert — contract is "${existing.status}". Only active or cancelled contracts can be reverted to pending review.` },
        { status: 409 }
      );
    }
    newStatus = CONTRACT_STATUSES.PENDING_REVIEW;
  } else {
    // Approve/reject: pending_review → active or cancelled
    if (existing.status !== CONTRACT_STATUSES.PENDING_REVIEW) {
      return NextResponse.json(
        { error: `Contract is "${existing.status}", not pending review. Only pending_review contracts can be approved or rejected.` },
        { status: 409 }
      );
    }
    newStatus = action === "approve"
      ? CONTRACT_STATUSES.ACTIVE
      : CONTRACT_STATUSES.CANCELLED;
  }

  const now = new Date();
  const updated = await prisma.contract.update({
    where: { id: contractId },
    data: {
      status: newStatus,
      // Approval counts as a review
      ...(action === "approve" ? { lastReviewedAt: now } : {}),
    },
    include: {
      distributor: { select: { code: true, name: true } },
      endUser: { select: { code: true, name: true } },
    },
  });

  await auditService.logUpdate(
    "contracts",
    contractId,
    { status: existing.status },
    {
      status: newStatus,
      approvalAction: action,
      ...(body.note ? { approvalNote: body.note } : {}),
    },
    user.id
  );

  return NextResponse.json(updated);
}
