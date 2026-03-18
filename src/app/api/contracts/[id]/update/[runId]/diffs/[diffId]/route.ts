import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { resolveDiff } from "@/lib/contracts/contract-update-resolution.service";

/**
 * PATCH /api/contracts/:id/update/:runId/diffs/:diffId
 * Resolve a single contract update diff.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string; diffId: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canEdit(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id, runId, diffId } = await params;
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

  const validResolutions = ["apply", "skip", "modify"];
  if (!body.resolution || !validResolutions.includes(body.resolution)) {
    return NextResponse.json(
      { error: `resolution is required. Must be one of: ${validResolutions.join(", ")}` },
      { status: 400 }
    );
  }

  const resolveResult = await resolveDiff(
    Number(diffId),
    {
      resolution: body.resolution,
      resolutionData: body.resolutionData,
      resolvedById: user.id,
    },
    Number(runId),
  );

  if (!resolveResult.success) {
    return NextResponse.json({ error: resolveResult.error }, { status: 400 });
  }

  return NextResponse.json(resolveResult);
}
