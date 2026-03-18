import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { bulkResolveDiffs } from "@/lib/contracts/contract-update-resolution.service";

/**
 * POST /api/contracts/:id/update/:runId/diffs/bulk-resolve
 * Bulk resolve contract update diffs.
 */
export async function POST(
  request: NextRequest,
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

  // Enforce contract scoping: run must belong to this contract
  const run = await prisma.contractUpdateRun.findUnique({
    where: { id: Number(runId) },
    select: { contractId: true },
  });
  if (!run || run.contractId !== contractId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  // Bulk resolve only supports apply/skip — modify requires per-diff
  // resolutionData which updateMany cannot handle per-row.
  const validBulkResolutions = ["apply", "skip"];
  if (!body.resolution || !validBulkResolutions.includes(body.resolution)) {
    return NextResponse.json(
      { error: `Bulk resolution must be one of: ${validBulkResolutions.join(", ")}. Use individual resolution for modify.` },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.diffIds) || body.diffIds.length === 0) {
    return NextResponse.json({ error: "diffIds array is required" }, { status: 400 });
  }

  const bulkResult = await bulkResolveDiffs(
    body.diffIds,
    {
      resolution: body.resolution,
      resolutionData: body.resolutionData,
      resolvedById: user.id,
    },
    Number(runId),
  );

  if (!bulkResult.success) {
    return NextResponse.json({ error: bulkResult.error }, { status: 400 });
  }

  return NextResponse.json(bulkResult);
}
