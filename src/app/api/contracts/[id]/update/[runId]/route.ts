import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getContractUpdateRun } from "@/lib/contracts/contract-update.service";

/**
 * GET /api/contracts/:id/update/:runId
 *
 * Retrieve a contract update run with all its diffs for the review UI.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;

  const { id, runId } = await params;
  const contractId = Number(id);
  const updateRunId = Number(runId);

  if (isNaN(contractId) || isNaN(updateRunId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const run = await getContractUpdateRun(updateRunId);

  if (!run || run.contractId !== contractId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(run);
}
