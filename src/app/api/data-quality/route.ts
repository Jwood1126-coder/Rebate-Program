import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/data-quality
 *
 * Scans existing data for quality issues:
 * - Duplicate records (same plan+item+startDate)
 * - Overlapping date ranges (same plan+item, different dates that overlap)
 * - Price anomalies (same item with wildly different prices across contracts)
 * - Open-ended records (no end date)
 * - Stale records (expired but not superseded — may need cleanup)
 * - Orphaned items (items with zero active records)
 * - Duplicate contracts (same distributor+endUser with overlapping dates)
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Run all queries in parallel
  const [
    allRecords,
    openEndedRecords,
    expiredNotSuperseded,
    orphanedItems,
    contracts,
    totalRecords,
    totalContracts,
    totalItems,
  ] = await Promise.all([
    // All non-cancelled records for overlap/duplicate/price analysis
    prisma.rebateRecord.findMany({
      where: { status: { notIn: ["cancelled", "superseded"] } },
      select: {
        id: true,
        rebatePlanId: true,
        itemId: true,
        rebatePrice: true,
        startDate: true,
        endDate: true,
        status: true,
        rebatePlan: {
          select: {
            planCode: true,
            contract: {
              select: {
                contractNumber: true,
                distributor: { select: { code: true } },
                endUser: { select: { name: true } },
              },
            },
          },
        },
        item: { select: { itemNumber: true } },
      },
      orderBy: [{ rebatePlanId: "asc" }, { itemId: "asc" }, { startDate: "asc" }],
    }),

    // Open-ended records
    prisma.rebateRecord.count({
      where: {
        endDate: null,
        status: { notIn: ["cancelled", "superseded"] },
      },
    }),

    // Expired but not superseded (potential cleanup candidates)
    prisma.rebateRecord.count({
      where: {
        endDate: { lt: now },
        supersededById: null,
        status: { notIn: ["cancelled", "superseded"] },
      },
    }),

    // Items with zero non-cancelled records
    prisma.item.findMany({
      where: {
        rebateRecords: { none: { status: { notIn: ["cancelled", "superseded"] } } },
      },
      select: { id: true, itemNumber: true },
    }),

    // All contracts for overlap detection
    prisma.contract.findMany({
      where: { status: { not: "cancelled" } },
      select: {
        id: true,
        distributorId: true,
        endUserId: true,
        contractNumber: true,
        startDate: true,
        endDate: true,
        status: true,
        distributor: { select: { code: true } },
        endUser: { select: { name: true } },
        _count: { select: { rebatePlans: true } },
      },
      orderBy: [{ distributorId: "asc" }, { endUserId: "asc" }, { startDate: "asc" }],
    }),

    prisma.rebateRecord.count({ where: { status: { notIn: ["cancelled"] } } }),
    prisma.contract.count({ where: { status: { not: "cancelled" } } }),
    prisma.item.count(),
  ]);

  // --- Duplicate detection: same plan+item+startDate ---
  const duplicates: DuplicateGroup[] = [];
  const seen = new Map<string, typeof allRecords>();
  for (const r of allRecords) {
    const key = `${r.rebatePlanId}|${r.itemId}|${r.startDate.toISOString()}`;
    const group = seen.get(key);
    if (group) {
      group.push(r);
    } else {
      seen.set(key, [r]);
    }
  }
  for (const [, group] of seen) {
    if (group.length > 1) {
      duplicates.push({
        planCode: group[0].rebatePlan.planCode,
        distributor: group[0].rebatePlan.contract.distributor.code,
        contractNumber: group[0].rebatePlan.contract.contractNumber,
        itemNumber: group[0].item.itemNumber,
        startDate: group[0].startDate.toISOString(),
        count: group.length,
        recordIds: group.map((r) => r.id),
      });
    }
  }

  // --- Overlap detection: same plan+item, overlapping date ranges ---
  const overlaps: OverlapGroup[] = [];
  const byPlanItem = new Map<string, typeof allRecords>();
  for (const r of allRecords) {
    const key = `${r.rebatePlanId}|${r.itemId}`;
    const list = byPlanItem.get(key);
    if (list) list.push(r);
    else byPlanItem.set(key, [r]);
  }
  for (const [, group] of byPlanItem) {
    if (group.length < 2) continue;
    // Check each pair for overlap
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        // Skip if same start date (already caught as duplicate)
        if (a.startDate.getTime() === b.startDate.getTime()) continue;
        if (datesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
          overlaps.push({
            planCode: a.rebatePlan.planCode,
            distributor: a.rebatePlan.contract.distributor.code,
            contractNumber: a.rebatePlan.contract.contractNumber,
            itemNumber: a.item.itemNumber,
            recordA: { id: a.id, start: a.startDate.toISOString(), end: a.endDate?.toISOString() ?? null, price: Number(a.rebatePrice) },
            recordB: { id: b.id, start: b.startDate.toISOString(), end: b.endDate?.toISOString() ?? null, price: Number(b.rebatePrice) },
          });
        }
      }
    }
  }

  // --- Price anomalies: same item with >50% price variance across plans ---
  const priceByItem = new Map<number, { prices: number[]; records: typeof allRecords }>();
  for (const r of allRecords) {
    const existing = priceByItem.get(r.itemId);
    if (existing) {
      existing.prices.push(Number(r.rebatePrice));
      existing.records.push(r);
    } else {
      priceByItem.set(r.itemId, { prices: [Number(r.rebatePrice)], records: [r] });
    }
  }
  const priceAnomalies: PriceAnomaly[] = [];
  for (const [, data] of priceByItem) {
    if (data.prices.length < 2) continue;
    const min = Math.min(...data.prices);
    const max = Math.max(...data.prices);
    if (min === 0) continue; // Skip zero-price records
    const variance = (max - min) / min;
    if (variance > 0.5) {
      // Find the records with min and max prices
      const minRecord = data.records.find((r) => Number(r.rebatePrice) === min)!;
      const maxRecord = data.records.find((r) => Number(r.rebatePrice) === max)!;
      priceAnomalies.push({
        itemNumber: minRecord.item.itemNumber,
        minPrice: min,
        maxPrice: max,
        variancePct: Math.round(variance * 100),
        minContext: `${minRecord.rebatePlan.contract.distributor.code} / ${minRecord.rebatePlan.contract.contractNumber}`,
        maxContext: `${maxRecord.rebatePlan.contract.distributor.code} / ${maxRecord.rebatePlan.contract.contractNumber}`,
        recordCount: data.records.length,
      });
    }
  }
  priceAnomalies.sort((a, b) => b.variancePct - a.variancePct);

  // --- Contract overlap: same distributor+endUser with overlapping dates ---
  const contractOverlaps: ContractOverlap[] = [];
  const byDistEndUser = new Map<string, typeof contracts>();
  for (const c of contracts) {
    const key = `${c.distributorId}|${c.endUserId}`;
    const list = byDistEndUser.get(key);
    if (list) list.push(c);
    else byDistEndUser.set(key, [c]);
  }
  for (const [, group] of byDistEndUser) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.startDate && b.startDate && datesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
          contractOverlaps.push({
            distributor: a.distributor.code,
            endUser: a.endUser.name,
            contractA: { id: a.id, number: a.contractNumber, start: a.startDate.toISOString(), end: a.endDate?.toISOString() ?? null },
            contractB: { id: b.id, number: b.contractNumber, start: b.startDate.toISOString(), end: b.endDate?.toISOString() ?? null },
          });
        }
      }
    }
  }

  // Build summary
  const issueCount = duplicates.length + overlaps.length + priceAnomalies.length + contractOverlaps.length;

  return NextResponse.json({
    summary: {
      totalRecords,
      totalContracts,
      totalItems,
      openEndedRecords,
      expiredNotSuperseded,
      orphanedItems: orphanedItems.length,
      issueCount,
      scanTimestamp: now.toISOString(),
    },
    duplicates,
    overlaps,
    priceAnomalies: priceAnomalies.slice(0, 50), // Cap at 50
    contractOverlaps,
    orphanedItems: orphanedItems.slice(0, 50),
  });
}

// Inclusive overlap check: does [aStart, aEnd] overlap with [bStart, bEnd]?
function datesOverlap(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null): boolean {
  const aEndMs = aEnd ? aEnd.getTime() : Infinity;
  const bEndMs = bEnd ? bEnd.getTime() : Infinity;
  return aStart.getTime() <= bEndMs && bStart.getTime() <= aEndMs;
}

// Types for the response
interface DuplicateGroup {
  planCode: string;
  distributor: string;
  contractNumber: string;
  itemNumber: string;
  startDate: string;
  count: number;
  recordIds: number[];
}

interface OverlapGroup {
  planCode: string;
  distributor: string;
  contractNumber: string;
  itemNumber: string;
  recordA: { id: number; start: string; end: string | null; price: number };
  recordB: { id: number; start: string; end: string | null; price: number };
}

interface PriceAnomaly {
  itemNumber: string;
  minPrice: number;
  maxPrice: number;
  variancePct: number;
  minContext: string;
  maxContext: string;
  recordCount: number;
}

interface ContractOverlap {
  distributor: string;
  endUser: string;
  contractA: { id: number; number: string; start: string; end: string | null };
  contractB: { id: number; number: string; start: string; end: string | null };
}
