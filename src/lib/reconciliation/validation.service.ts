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
import { EXCEPTION_CODES, RUN_STATUSES } from './types';
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
}

// Price tolerance: $0.01 — differences within this are not flagged
const PRICE_TOLERANCE = 0.01;

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
      });
    } else {
      // --- CLM-007: Contract Expired ---
      if (contract.endDate && transactionDate) {
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
      });
    }

    // --- CLM-003: Item Not in Contract + CLM-001: Price Mismatch ---
    if (contract && item) {
      const record = refData.recordLookup.get(`${contract.id}|${item.id}`);
      if (!record) {
        rowIssues.push({
          code: EXCEPTION_CODES.CLM_003,
          severity: 'error',
          category: 'Item Not in Contract',
          description: `Item "${itemNumber}" is not on any plan under contract "${contractNumber}".`,
          rowNumber: row.rowNumber,
          suggestedAction: 'flag_review',
        });
      } else {
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
      })),
    });
  }

  // Update run with final counts
  const validatedCount = claimRows.filter(r => r.status !== 'error').length;
  await prisma.reconciliationRun.update({
    where: { id: runId },
    data: {
      status: allIssues.length > 0 ? RUN_STATUSES.REVIEW : RUN_STATUSES.COMPLETED,
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

interface ReferenceData {
  contractsByNumber: Map<string, {
    id: number;
    contractNumber: string;
    startDate: Date | null;
    endDate: Date | null;
    status: string;
  }>;
  itemsByNumber: Map<string, {
    id: number;
    itemNumber: string;
  }>;
  // Key: "contractId|itemId" -> rebate record
  recordLookup: Map<string, {
    id: number;
    rebatePrice: Prisma.Decimal;
    rebatePlanId: number;
    startDate: Date;
    endDate: Date | null;
  }>;
}

async function loadReferenceData(distributorId: number): Promise<ReferenceData> {
  // Load all contracts for this distributor
  const contracts = await prisma.contract.findMany({
    where: { distributorId },
    select: { id: true, contractNumber: true, startDate: true, endDate: true, status: true },
  });

  const contractsByNumber = new Map(
    contracts.map(c => [c.contractNumber, c])
  );

  // Load all items
  const items = await prisma.item.findMany({
    select: { id: true, itemNumber: true },
  });
  const itemsByNumber = new Map(
    items.map(i => [i.itemNumber, i])
  );

  // Load all active rebate records for this distributor's contracts
  const contractIds = contracts.map(c => c.id);
  const records = await prisma.rebateRecord.findMany({
    where: {
      rebatePlan: { contractId: { in: contractIds } },
      status: 'active',
    },
    include: {
      rebatePlan: { select: { contractId: true } },
    },
  });

  // Build lookup: contractId|itemId -> record (use latest by start date if multiple)
  const recordLookup = new Map<string, typeof records[0]>();
  for (const rec of records) {
    const key = `${rec.rebatePlan.contractId}|${rec.itemId}`;
    const existing = recordLookup.get(key);
    if (!existing || rec.startDate > existing.startDate) {
      recordLookup.set(key, rec);
    }
  }

  return { contractsByNumber, itemsByNumber, recordLookup };
}
