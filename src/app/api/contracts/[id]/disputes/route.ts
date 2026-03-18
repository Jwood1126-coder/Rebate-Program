import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { getContractDisputes } from "@/lib/contracts/contract-activity.service";

/**
 * GET /api/contracts/:id/disputes
 *
 * Returns approximate contract-scoped dispute/error history across reconciliation runs.
 * Derived from reconciliation_issues where the claim references this contract.
 * Scoped by (contractNumber + distributorId) — the strongest reliable key available.
 * Limitation: contracts are unique by (distributorId, endUserId, contractNumber),
 * so the same distributor could have two contracts with the same number for
 * different end users. Claim rows do not reliably carry end-user identity,
 * so this panel cannot distinguish between them. This is an approximate scope.
 *
 * Grouped by run for trend visibility — sales wants to see whether
 * dispute counts are increasing or decreasing over time.
 *
 * Note: this is a contract-scoped panel, not a general cross-run history surface.
 * A broader reconciliation history/query tool may be added separately.
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

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { contractNumber: true, distributorId: true },
  });

  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  const disputes = await getContractDisputes(contract.contractNumber, contract.distributorId, limit);

  return NextResponse.json(disputes);
}
