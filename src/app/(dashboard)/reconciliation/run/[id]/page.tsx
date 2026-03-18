// Dedicated reconciliation run workflow page.
// Loads a single run and renders a stepper-based workflow shell.
// Steps: Upload → Validate → Review → Commit

import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import RunWorkflowClient from "@/components/reconciliation/run-workflow-client";

export const dynamic = "force-dynamic";

export default async function ReconciliationRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const runId = Number(id);
  if (isNaN(runId)) notFound();

  const run = await prisma.reconciliationRun.findUnique({
    where: { id: runId },
    include: {
      distributor: { select: { id: true, code: true, name: true } },
      runBy: { select: { displayName: true } },
      claimBatch: {
        select: {
          id: true,
          fileName: true,
          totalRows: true,
          validRows: true,
          errorRows: true,
        },
      },
      posBatch: {
        select: {
          id: true,
          fileName: true,
          totalRows: true,
          validRows: true,
          errorRows: true,
        },
      },
      _count: { select: { issues: true } },
    },
  });

  if (!run) notFound();

  // Determine current workflow step from run status
  function deriveStep(status: string): "upload" | "validate" | "review" | "commit" | "done" {
    switch (status) {
      case "draft":
      case "staged":
        return run!.validatedCount > 0 ? "review" : "validate";
      case "running":
        return "validate";
      case "review":
        return "review";
      case "reviewed":
      case "completed":
        return "commit";
      case "committed":
        return "done";
      default:
        return "upload";
    }
  }

  const currentStep = deriveStep(run.status);

  // Serialize for client
  const serializedRun = JSON.parse(JSON.stringify(run));

  return (
    <RunWorkflowClient
      run={serializedRun}
      currentStep={currentStep}
    />
  );
}
