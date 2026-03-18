// Claim validation engine (Phase R2).
// Compares staged claim rows against stored contract terms.
// See docs/RECONCILIATION_DESIGN.md Section 6 for exception categories.
//
// For each claim row, the engine checks:
//   1. Does the contract exist for this distributor?
//   2. Is the contract still active (not expired)?
//   3. Does the item exist in the system?
//   4. Is the item on the contract (via a rebate plan)?
//   5. Does the claimed price match the contract price?
//   6. Is the transaction date within the claim period?
//   7. Is this a duplicate claim line?

import { prisma } from '@/lib/db/client';
import { EXCEPTION_CODES, RUN_STATUSES, PRICE_MATCH_TOLERANCE } from './types';
import type { Prisma } from '@prisma/client';

export interface ValidationResult {
  success: boolean;
  runId: number;
  totalRows: number;
  validatedCount: number;
  exceptionCount: number;
  matchedCount: number;
  issues: IssueSummary[];
}

interface IssueSummary {
  code: string;
  severity: string;
  category: string;
  description: string;
  rowNumber: number;
  suggestedAction: string;
  masterRecordId?: number | null;
  suggestedData?: Record<string, unknown> | null;
}

// Re-exported from types.ts — see PRICE_MATCH_TOLERANCE / ARITHMETIC_TOLERANCE
const PRICE_TOLERANCE = PRICE_MATCH_TOLERANCE;

/**
 * Validate all staged claim rows for a reconciliation run.
 * Compares each row against contracts, items, and rebate records in the database.
 */
export async function validateRun(runId: number): Promise<ValidationResult> {
  // Load the run with its batch
  const run = await prisma.reconciliationRun.findUnique({
    where: { id: runId },
    include: {
      distributor: true,
      claimBatch: true,
    },
  });

  if (!run) {
    return { success: false, runId, totalRows: 0, validatedCount: 0, exceptionCount: 0, matchedCount: 0, issues: [] };
  }

  if (!run.claimBatch) {
    return { success: false, runId, totalRows: 0, validatedCount: 0, exceptionCount: 0, matchedCount: 0, issues: [] };
  }

  // Update run status to running
  await prisma.reconciliationRun.update({
    where: { id: runId },
    data: { status: RUN_STATUSES.RUNNING },
  });

  // Load all claim rows for this batch
  const claimRows = await prisma.claimRow.findMany({
    where: { batchId: run.claimBatch.id },
    orderBy: { rowNumber: 'asc' },
  });

  // Pre-fetch reference data for this distributor to avoid N+1 queries
  const refData = await loadReferenceData(run.distributorId);

  const allIssues: IssueSummary[] = [];
  let matchedCount = 0;

  // Delete any existing issues from a previous validation of this run
  await prisma.reconciliationIssue.deleteMany({
    where: { reconciliationRunId: runId },
  });

  // Track seen rows for duplicate detection
  const seenKeys = new Map<string, number>(); // key -> first rowNumber

  for (const row of claimRows) {
    const rowIssues: IssueSummary[] = [];
    let matched = false;

    // Skip rows that had parse errors
    if (row.status === 'error') continue;

    const contractNumber = row.contractNumber?.trim() || '';
    const itemNumber = row.itemNumber?.trim() || '';
    const deviatedPrice = row.deviatedPrice ? Number(row.deviatedPrice) : null;
    const transactionDate = row.transactionDate;

    // --- CLM-009: Duplicate claim line ---
    const dupeKey = `${contractNumber}|${itemNumber}|${row.distributorOrderNumber || ''}|${row.transactionDate?.toISOString() || ''}`;
    const existingRow = seenKeys.get(dupeKey);
    if (existingRow !== undefined) {
      rowIssues.push({
        code: EXCEPTION_CODES.CLM_009,
        severity: 'warning',
        category: 'Duplicate Claim Line',
        description: `Row ${row.rowNumber} appears to be a duplicate of row ${existingRow} (same contract, item, order, date).`,
        rowNumber: row.rowNumber,
        suggestedAction: 'flag_review',
      });
    } else {
      seenKeys.set(dupeKey, row.rowNumber);
    }

    // --- CLM-004: Contract Not Found ---
    const contract = refData.contractsByNumber.get(contractNumber);
    if (!contract) {
      rowIssues.push({
        code: EXCEPTION_CODES.CLM_004,
        severity: 'error',
        category: 'Contract Not Found',
        description: `Contract "${contractNumber}" not found for distributor ${run.distributor.code}.`,
        rowNumber: row.rowNumber,
        suggestedAction: 'flag_review',
        suggestedData: {
          contractNumber,
        },
      });
    } else {
      // --- CLM-007: Contract Expired / Not Yet Effective ---
      if (transactionDate) {
        if (contract.endDate) {
          const contractEnd = new Date(contract.endDate);
          if (transactionDate > contractEnd) {
            rowIssues.push({
              code: EXCEPTION_CODES.CLM_007,
              severity: 'error',
              category: 'Contract Expired',
              description: `Contract "${contractNumber}" expired ${contractEnd.toISOString().split('T')[0]}. Transaction date: ${transactionDate.toISOString().split('T')[0]}.`,
              rowNumber: row.rowNumber,
              suggestedAction: 'reject',
            });
          }
        }
        if (contract.startDate) {
          const contractStart = new Date(contract.startDate);
          if (transactionDate < contractStart) {
            rowIssues.push({
              code: EXCEPTION_CODES.CLM_007,
              severity: 'error',
              category: 'Contract Not Yet Effective',
              description: `Contract "${contractNumber}" starts ${contractStart.toISOString().split('T')[0]}. Transaction date: ${transactionDate.toISOString().split('T')[0]}.`,
              rowNumber: row.rowNumber,
              suggestedAction: 'reject',
            });
          }
        }
      }
    }

    // --- CLM-006: Unknown Item ---
    const item = refData.itemsByNumber.get(itemNumber);
    if (!item) {
      rowIssues.push({
        code: EXCEPTION_CODES.CLM_006,
        severity: 'error',
        category: 'Unknown Item',
        description: `Item "${itemNumber}" not found in the system.`,
        rowNumber: row.rowNumber,
        suggestedAction: 'create_item',
        masterRecordId: null,
        suggestedData: {
          itemNumber,
          claimedPrice: deviatedPrice,
          contractNumber,
          contractId: contract?.id ?? null,
        },
      });
    }

    // --- CLM-003 / CLM-005 / CLM-001: Record matching with effective dates ---
    if (contract && item) {
      const candidates = refData.recordsByContractItem.get(`${contract.id}|${item.id}`) || [];
      const planCode = row.planCode?.trim() || null;
      const matchResult = findEffectiveDateMatch(candidates, transactionDate, planCode);

      if (matchResult.type === 'no_match') {
        const desc = matchResult.hasRecordsOutsideDateRange
          ? `Item "${itemNumber}" exists under contract "${contractNumber}" but no record covers transaction date ${transactionDate?.toISOString().split('T')[0] || 'N/A'}.`
          : `Item "${itemNumber}" is not on any plan under contract "${contractNumber}".`;

        // Determine suggested plan for CLM-003
        let suggestedPlanId: number | null = null;
        const candidatePlanIds = [...new Set(candidates.map(r => r.rebatePlanId))];
        if (candidatePlanIds.length === 0 && contract.planIds.length === 1) {
          suggestedPlanId = contract.planIds[0];
        } else if (candidatePlanIds.length === 1) {
          suggestedPlanId = candidatePlanIds[0];
        }

        rowIssues.push({
          code: EXCEPTION_CODES.CLM_003,
          severity: 'error',
          category: 'Item Not in Contract',
          description: desc,
          rowNumber: row.rowNumber,
          suggestedAction: 'flag_review',
          masterRecordId: null,
          suggestedData: {
            planId: suggestedPlanId,
            candidatePlanIds: contract.planIds,
            itemId: item.id,
            claimedPrice: deviatedPrice,
            contractId: contract.id,
          },
        });
      } else if (matchResult.type === 'ambiguous') {
        // CLM-005: Multiple records match — ambiguous plan
        const ambigDesc = matchResult.candidates
          .map(r => `plan ${r.planCode} @ $${Number(r.rebatePrice).toFixed(2)}`)
          .join(', ');
        rowIssues.push({
          code: EXCEPTION_CODES.CLM_005,
          severity: 'warning',
          category: 'Ambiguous Plan Match',
          description: `Item "${itemNumber}" under contract "${contractNumber}" matches multiple records: ${ambigDesc}. Review required.`,
          rowNumber: row.rowNumber,
          suggestedAction: 'flag_review',
          masterRecordId: null,
          suggestedData: {
            candidateRecordIds: matchResult.candidates.map(r => r.id),
            candidatePlanIds: [...new Set(matchResult.candidates.map(r => r.rebatePlanId))],
            contractId: contract.id,
          },
        });
        // Still treat as matched for row status — user must resolve ambiguity
        matched = true;

        // Use first candidate for matchedRecordId (best available)
        await prisma.claimRow.update({
          where: { id: row.id },
          data: { matchedRecordId: matchResult.candidates[0].id },
        });
      } else {
        // Unique match found
        const record = matchResult.record;
        matched = true;

        // CLM-001: Price Mismatch
        if (deviatedPrice !== null) {
          const contractPrice = Number(record.rebatePrice);
          const priceDiff = Math.abs(deviatedPrice - contractPrice);
          if (priceDiff > PRICE_TOLERANCE) {
            rowIssues.push({
              code: EXCEPTION_CODES.CLM_001,
              severity: 'error',
              category: 'Price Mismatch',
              description: `Claimed price $${deviatedPrice.toFixed(2)} differs from contract price $${contractPrice.toFixed(2)} for item "${itemNumber}" (diff: $${priceDiff.toFixed(2)}).`,
              rowNumber: row.rowNumber,
              suggestedAction: 'adjust',
              masterRecordId: record.id,
              suggestedData: {
                oldPrice: contractPrice,
                newPrice: deviatedPrice,
                planId: record.rebatePlanId,
                itemId: item.id,
                contractId: contract.id,
              },
            });
          }
        }

        // Update claim row with matched record ID
        await prisma.claimRow.update({
          where: { id: row.id },
          data: { matchedRecordId: record.id },
        });
      }
    }

    // --- CLM-002: Date Out of Range (transaction date outside claim period) ---
    if (transactionDate) {
      const periodStart = run.claimPeriodStart;
      const periodEnd = run.claimPeriodEnd;
      if (transactionDate < periodStart || transactionDate > periodEnd) {
        rowIssues.push({
          code: EXCEPTION_CODES.CLM_002,
          severity: 'warning',
          category: 'Date Out of Range',
          description: `Transaction date ${transactionDate.toISOString().split('T')[0]} is outside claim period ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}.`,
          rowNumber: row.rowNumber,
          suggestedAction: 'flag_review',
        });
      }
    }

    // Update claim row status
    const newStatus = rowIssues.some(i => i.severity === 'error')
      ? 'unmatched'
      : matched
        ? 'validated'
        : 'parsed';

    await prisma.claimRow.update({
      where: { id: row.id },
      data: { status: newStatus },
    });

    if (matched) matchedCount++;
    allIssues.push(...rowIssues);
  }

  // --- POS Cross-Reference (CLM-010, CLM-011, CLM-012) ---
  // Only runs if a POS batch is attached to this run.
  // POS is supplementary — all POS issues are warnings, not errors.
  if (run.posBatchId) {
    const posIssues = await crossReferencePosData(run.posBatchId, claimRows, run);
    allIssues.push(...posIssues);
  }

  // Bulk insert all issues
  if (allIssues.length > 0) {
    await prisma.reconciliationIssue.createMany({
      data: allIssues.map(issue => ({
        reconciliationRunId: runId,
        code: issue.code,
        severity: issue.severity,
        category: issue.category,
        description: issue.description,
        claimRowId: claimRows.find(r => r.rowNumber === issue.rowNumber)?.id ?? null,
        suggestedAction: issue.suggestedAction,
        masterRecordId: issue.masterRecordId ?? null,
        suggestedData: issue.suggestedData ? (issue.suggestedData as Prisma.InputJsonValue) : undefined,
      })),
    });
  }

  // Update run with final counts
  const validatedCount = claimRows.filter(r => r.status !== 'error').length;
  await prisma.reconciliationRun.update({
    where: { id: runId },
    data: {
      status: allIssues.length > 0 ? RUN_STATUSES.REVIEW : RUN_STATUSES.REVIEWED,
      validatedCount,
      exceptionCount: allIssues.length,
      approvedCount: matchedCount,
    },
  });

  return {
    success: true,
    runId,
    totalRows: claimRows.length,
    validatedCount,
    exceptionCount: allIssues.length,
    matchedCount,
    issues: allIssues,
  };
}

// ---------------------------------------------------------------------------
// Reference data loader
// ---------------------------------------------------------------------------

interface ReferenceContract {
  id: number;
  contractNumber: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  planIds: number[];           // all plan IDs under this contract
  planCodes: Map<number, string>; // planId -> planCode
}

interface ReferenceRecord {
  id: number;
  rebatePrice: Prisma.Decimal;
  rebatePlanId: number;
  planCode: string;
  startDate: Date;
  endDate: Date | null;
}

interface ReferenceData {
  contractsByNumber: Map<string, ReferenceContract>;
  itemsByNumber: Map<string, {
    id: number;
    itemNumber: string;
  }>;
  // Key: "contractId|itemId" -> array of all non-superseded/non-cancelled records
  recordsByContractItem: Map<string, ReferenceRecord[]>;
}

// ---------------------------------------------------------------------------
// Effective-date matching
// ---------------------------------------------------------------------------

interface MatchResult {
  type: 'match';
  record: ReferenceRecord;
}

interface AmbiguousResult {
  type: 'ambiguous';
  candidates: ReferenceRecord[];
}

interface NoMatchResult {
  type: 'no_match';
  /** True when records exist for this contract+item but none cover the date */
  hasRecordsOutsideDateRange: boolean;
}

type EffectiveDateMatchResult = MatchResult | AmbiguousResult | NoMatchResult;

/**
 * Find the rebate record effective for a given transaction date.
 * Filters by date range, then optionally narrows by plan code.
 */
export function findEffectiveDateMatch(
  candidates: ReferenceRecord[],
  transactionDate: Date | null,
  planCode: string | null,
): EffectiveDateMatchResult {
  if (candidates.length === 0) {
    return { type: 'no_match', hasRecordsOutsideDateRange: false };
  }

  // If no transaction date, we can't do date filtering — use all candidates
  let dateFiltered: ReferenceRecord[];
  if (transactionDate) {
    dateFiltered = candidates.filter(rec => {
      const afterStart = transactionDate >= rec.startDate;
      const beforeEnd = rec.endDate === null || transactionDate <= rec.endDate;
      return afterStart && beforeEnd;
    });
  } else {
    dateFiltered = candidates;
  }

  if (dateFiltered.length === 0) {
    return { type: 'no_match', hasRecordsOutsideDateRange: true };
  }

  // If claim provides a plan code, narrow further
  let planFiltered = dateFiltered;
  if (planCode && planCode.trim() !== '') {
    const byPlan = dateFiltered.filter(
      rec => rec.planCode.toUpperCase() === planCode.trim().toUpperCase()
    );
    // Only narrow if the plan code actually matched something;
    // otherwise fall through with all date-matched records and let
    // the caller raise CLM-005 if needed.
    if (byPlan.length > 0) {
      planFiltered = byPlan;
    }
  }

  if (planFiltered.length === 1) {
    return { type: 'match', record: planFiltered[0] };
  }

  // Multiple records — check if they all agree on price (same plan+price = effective duplicate, pick first)
  const uniquePrices = new Set(planFiltered.map(r => Number(r.rebatePrice)));
  const uniquePlans = new Set(planFiltered.map(r => r.rebatePlanId));
  if (uniquePrices.size === 1 && uniquePlans.size === 1) {
    // Same plan, same price — effectively the same; pick the one with latest startDate
    const sorted = [...planFiltered].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    return { type: 'match', record: sorted[0] };
  }

  return { type: 'ambiguous', candidates: planFiltered };
}

// ---------------------------------------------------------------------------
// POS Cross-Reference
// ---------------------------------------------------------------------------
// Compares claim lines against POS data. All POS issues are informational
// warnings — POS data comes from the distributor and doesn't prove anything.

async function crossReferencePosData(
  posBatchId: number,
  claimRows: { id: number; rowNumber: number; itemNumber: string | null; quantity: unknown; deviatedPrice: unknown; status: string }[],
  run: { claimPeriodStart: Date; claimPeriodEnd: Date; distributor: { code: string } }
): Promise<IssueSummary[]> {
  const posRows = await prisma.posRow.findMany({
    where: { batchId: posBatchId, status: { not: 'error' } },
  });

  if (posRows.length === 0) return [];

  const issues: IssueSummary[] = [];

  // Build POS lookup by item number (aggregate quantities across rows)
  const posByItem = new Map<string, { totalQty: number; avgPrice: number; rowCount: number }>();
  for (const pos of posRows) {
    if (!pos.itemNumber) continue;
    const key = pos.itemNumber.trim().toUpperCase();
    const existing = posByItem.get(key) || { totalQty: 0, avgPrice: 0, rowCount: 0 };
    const qty = pos.quantity ? Number(pos.quantity) : 0;
    const price = pos.sellPrice ? Number(pos.sellPrice) : 0;
    existing.totalQty += qty;
    // Running average
    existing.avgPrice = (existing.avgPrice * existing.rowCount + price) / (existing.rowCount + 1);
    existing.rowCount++;
    posByItem.set(key, existing);
  }

  // Check each claim row against POS
  for (const claim of claimRows) {
    if (claim.status === 'error' || !claim.itemNumber) continue;

    const itemKey = claim.itemNumber.trim().toUpperCase();
    const posData = posByItem.get(itemKey);

    if (!posData) {
      // CLM-010: No matching POS transaction
      issues.push({
        code: EXCEPTION_CODES.CLM_010,
        severity: 'warning',
        category: 'No POS Match',
        description: `Claim row ${claim.rowNumber}: item "${claim.itemNumber}" has no matching POS transaction in the ${run.distributor.code} POS report.`,
        rowNumber: claim.rowNumber,
        suggestedAction: 'flag_review',
      });
      continue;
    }

    // CLM-011: Quantity mismatch
    const claimQty = claim.quantity ? Number(claim.quantity) : 0;
    if (claimQty > 0 && posData.totalQty > 0) {
      // Compare at item level — POS total qty vs claim qty for this item
      // Only flag if claim qty significantly exceeds POS qty (>10% more)
      if (claimQty > posData.totalQty * 1.1) {
        issues.push({
          code: EXCEPTION_CODES.CLM_011,
          severity: 'warning',
          category: 'POS Quantity Mismatch',
          description: `Claim row ${claim.rowNumber}: claimed ${claimQty} units of "${claim.itemNumber}", but POS report shows ${posData.totalQty} total units sold.`,
          rowNumber: claim.rowNumber,
          suggestedAction: 'flag_review',
        });
      }
    }

    // CLM-012: Price mismatch vs POS sell price
    const claimPrice = claim.deviatedPrice ? Number(claim.deviatedPrice) : null;
    if (claimPrice !== null && posData.avgPrice > 0) {
      const priceDiff = Math.abs(claimPrice - posData.avgPrice);
      if (priceDiff > PRICE_TOLERANCE) {
        issues.push({
          code: EXCEPTION_CODES.CLM_012,
          severity: 'warning',
          category: 'POS Price Mismatch',
          description: `Claim row ${claim.rowNumber}: claimed price $${claimPrice.toFixed(2)} for "${claim.itemNumber}", but POS avg sell price is $${posData.avgPrice.toFixed(2)} (diff: $${priceDiff.toFixed(2)}).`,
          rowNumber: claim.rowNumber,
          suggestedAction: 'flag_review',
        });
      }
    }
  }

  return issues;
}

async function loadReferenceData(distributorId: number): Promise<ReferenceData> {
  // Load all contracts for this distributor, including their plans
  const contracts = await prisma.contract.findMany({
    where: { distributorId },
    select: {
      id: true,
      contractNumber: true,
      startDate: true,
      endDate: true,
      status: true,
      rebatePlans: { select: { id: true, planCode: true } },
    },
  });

  const contractsByNumber = new Map<string, ReferenceContract>();
  for (const c of contracts) {
    const planCodes = new Map<number, string>();
    for (const p of c.rebatePlans) {
      planCodes.set(p.id, p.planCode);
    }
    contractsByNumber.set(c.contractNumber, {
      id: c.id,
      contractNumber: c.contractNumber,
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
      planIds: c.rebatePlans.map(p => p.id),
      planCodes,
    });
  }

  // Load all items
  const items = await prisma.item.findMany({
    select: { id: true, itemNumber: true },
  });
  const itemsByNumber = new Map(
    items.map(i => [i.itemNumber, i])
  );

  // Load all non-superseded, non-cancelled rebate records for this distributor's contracts
  const contractIds = contracts.map(c => c.id);
  const records = await prisma.rebateRecord.findMany({
    where: {
      rebatePlan: { contractId: { in: contractIds } },
      status: { notIn: ['cancelled', 'superseded'] },
    },
    include: {
      rebatePlan: { select: { contractId: true, planCode: true } },
    },
  });

  // Build lookup: contractId|itemId -> array of records
  const recordsByContractItem = new Map<string, ReferenceRecord[]>();
  for (const rec of records) {
    const key = `${rec.rebatePlan.contractId}|${rec.itemId}`;
    const refRec: ReferenceRecord = {
      id: rec.id,
      rebatePrice: rec.rebatePrice,
      rebatePlanId: rec.rebatePlanId,
      planCode: rec.rebatePlan.planCode,
      startDate: rec.startDate,
      endDate: rec.endDate,
    };
    const existing = recordsByContractItem.get(key);
    if (existing) {
      existing.push(refRec);
    } else {
      recordsByContractItem.set(key, [refRec]);
    }
  }

  return { contractsByNumber, itemsByNumber, recordsByContractItem };
}
