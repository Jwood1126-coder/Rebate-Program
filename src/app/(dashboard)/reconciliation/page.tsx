// Reconciliation hub — upload claim files and view reconciliation runs.
// See docs/RECONCILIATION_DESIGN.md Section 8.1.

import { prisma } from "@/lib/db/client";
import ReconciliationPageClient from "@/components/reconciliation/reconciliation-page-client";

export const dynamic = "force-dynamic";

export default async function ReconciliationPage() {
  const [distributors, runs] = await Promise.all([
    prisma.distributor.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.reconciliationRun.findMany({
      include: {
        distributor: { select: { code: true, name: true } },
        runBy: { select: { displayName: true } },
        claimBatch: { select: { fileName: true, totalRows: true, validRows: true, errorRows: true } },
        _count: { select: { issues: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <ReconciliationPageClient
      distributors={distributors}
      initialRuns={JSON.parse(JSON.stringify(runs))}
    />
  );
}
