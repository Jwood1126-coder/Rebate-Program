import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { getContractActivity } from "@/lib/contracts/contract-activity.service";

/**
 * GET /api/contracts/:id/activity
 *
 * Returns a unified activity timeline for a contract, derived from four sources:
 * 1. Audit log entries for the contract itself
 * 2. Contract update runs (staged, committed, cancelled)
 * 3. Audit log entries for rebate records under this contract's plans
 * 4. Reconciliation runs that touched records under this contract
 *    (via masterRecordId or committedRecordId)
 *
 * No new tables — purely query-derived. See contract-activity.service.ts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;

  const { id } = await params;
  const contractId = Number(id);
  if (isNaN(contractId)) {
    return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      distributorId: true,
      rebatePlans: { select: { id: true } },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const planIds = contract.rebatePlans.map((p) => p.id);
  const events = await getContractActivity(contractId, contract.distributorId, planIds, limit);

  return NextResponse.json({ events, total: events.length });
}
