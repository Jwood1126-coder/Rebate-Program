import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { commitContractUpdate } from "@/lib/contracts/contract-update-resolution.service";

/**
 * POST /api/contracts/:id/update/:runId/commit
 * Commit a fully-resolved contract update run to master data.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canEdit(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id, runId } = await params;
  const contractId = Number(id);
  const updateRunId = Number(runId);

  // Enforce contract scoping: run must belong to this contract
  const run = await prisma.contractUpdateRun.findUnique({
    where: { id: updateRunId },
    select: { contractId: true },
  });
  if (!run || run.contractId !== contractId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const commitResult = await commitContractUpdate(updateRunId, user.id);

  if (!commitResult.success) {
    return NextResponse.json({ error: commitResult.error }, { status: 400 });
  }

  return NextResponse.json(commitResult);
}
