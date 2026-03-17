import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { deriveRecordStatus } from "@/lib/utils/dates";
import { auditService } from "@/lib/audit/audit.service";
import { RecordDetailClient } from "@/components/records/record-detail-client";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Walks the supersession chain in one direction, collecting linked records.
 * Limits to `maxDepth` to avoid runaway queries on pathological data.
 */
async function walkChain(
  startId: number | null,
  direction: "predecessors" | "successors",
  maxDepth = 10
): Promise<ChainRecord[]> {
  const results: ChainRecord[] = [];
  let currentId = startId;
  let depth = 0;

  while (currentId !== null && depth < maxDepth) {
    const rec = await prisma.rebateRecord.findUnique({
      where: { id: currentId },
      include: {
        item: { select: { itemNumber: true } },
      },
    });
    if (!rec) break;

    const status = deriveRecordStatus(rec.startDate, rec.endDate, rec.supersededById, rec.status);

    results.push({
      id: rec.id,
      rebatePrice: rec.rebatePrice.toString(),
      startDate: formatDate(rec.startDate),
      endDate: rec.endDate ? formatDate(rec.endDate) : null,
      status,
      itemNumber: rec.item.itemNumber,
    });

    // Walk: predecessors go via `supersedes` (the record this one replaced),
    // successors go via `supersededBy` (the record that replaced this one).
    if (direction === "predecessors") {
      // Find the record that this record superseded
      const predecessor = await prisma.rebateRecord.findUnique({
        where: { supersededById: currentId },
        select: { id: true },
      });
      currentId = predecessor?.id ?? null;
    } else {
      // supersededById points to the record that superseded this one
      currentId = rec.supersededById;
    }
    depth++;
  }

  return results;
}

interface ChainRecord {
  id: number;
  rebatePrice: string;
  startDate: string;
  endDate: string | null;
  status: string;
  itemNumber: string;
}

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recordId = parseInt(id);
  if (isNaN(recordId)) notFound();

  // Fetch the record with full context
  const record = await prisma.rebateRecord.findUnique({
    where: { id: recordId },
    include: {
      rebatePlan: {
        include: {
          contract: {
            include: {
              distributor: { select: { id: true, code: true, name: true } },
              endUser: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
      item: { select: { id: true, itemNumber: true, description: true } },
      createdBy: { select: { displayName: true, username: true } },
      updatedBy: { select: { displayName: true, username: true } },
    },
  });

  if (!record) notFound();

  const status = deriveRecordStatus(
    record.startDate,
    record.endDate,
    record.supersededById,
    record.status
  );

  // Fetch supersession chain, notes, and audit history in parallel
  const [predecessors, successors, notes, auditEntries] = await Promise.all([
    // Walk backwards: find the record that this one superseded
    (async () => {
      const pred = await prisma.rebateRecord.findUnique({
        where: { supersededById: recordId },
        select: { id: true },
      });
      return walkChain(pred?.id ?? null, "predecessors");
    })(),
    // Walk forwards: follow supersededById chain
    walkChain(record.supersededById, "successors"),
    // Notes
    prisma.recordNote.findMany({
      where: { rebateRecordId: recordId },
      include: {
        createdBy: { select: { displayName: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Audit history
    auditService.getHistoryForRecord("rebate_records", recordId),
  ]);

  const contract = record.rebatePlan.contract;
  const plan = record.rebatePlan;

  const recordData = {
    id: record.id,
    rebatePrice: record.rebatePrice.toString(),
    startDate: formatDate(record.startDate),
    endDate: record.endDate ? formatDate(record.endDate) : null,
    rawStartDate: record.startDate.toISOString().split("T")[0],
    rawEndDate: record.endDate ? record.endDate.toISOString().split("T")[0] : null,
    status,
    item: {
      id: record.item.id,
      itemNumber: record.item.itemNumber,
      description: record.item.description,
    },
    plan: {
      id: plan.id,
      planCode: plan.planCode,
      planName: plan.planName,
      discountType: plan.discountType,
    },
    contract: {
      id: contract.id,
      contractNumber: contract.contractNumber,
    },
    distributor: {
      id: contract.distributor.id,
      code: contract.distributor.code,
      name: contract.distributor.name,
    },
    endUser: {
      id: contract.endUser.id,
      code: contract.endUser.code,
      name: contract.endUser.name,
    },
    createdBy: record.createdBy.displayName,
    updatedBy: record.updatedBy.displayName,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };

  const notesData = notes.map((n) => ({
    id: n.id,
    noteText: n.noteText,
    noteType: n.noteType,
    createdBy: n.createdBy.displayName,
    createdAt: n.createdAt.toISOString(),
  }));

  const auditData = auditEntries.map((e) => ({
    id: Number(e.id),
    action: e.action,
    changedFields: e.changedFields as Record<string, { old: unknown; new: unknown }> | null,
    user: e.user?.displayName ?? "System",
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <RecordDetailClient
      record={recordData}
      predecessors={predecessors}
      successors={successors}
      notes={notesData}
      auditEntries={auditData}
    />
  );
}
