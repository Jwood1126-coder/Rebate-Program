// Reconciliation staging service.
// Orchestrates: file upload → parse → store in staging tables.
// See docs/RECONCILIATION_DESIGN.md Section 4.2 Steps 1-2.

import { prisma } from '@/lib/db/client';
import { parseClaimFile } from './parsing.service';
import { getColumnMapping } from './column-mappings';
import type { ClaimParseResult, StandardClaimRow } from './types';
import { CLAIM_BATCH_STATUSES, RUN_STATUSES } from './types';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';

export interface StageClaimFileInput {
  fileBuffer: Buffer;
  fileName: string;
  distributorId: number;
  distributorCode: string;
  claimPeriodStart: Date;
  claimPeriodEnd: Date;
  userId: number;
}

export interface StageClaimFileResult {
  success: boolean;
  batchId?: number;
  runId?: number;
  parseResult: ClaimParseResult;
  errors: string[];
}

/**
 * Stage a distributor claim file: parse it, store rows in claim_rows,
 * create a claim_batch and reconciliation_run.
 */
export async function stageClaimFile(input: StageClaimFileInput): Promise<StageClaimFileResult> {
  const {
    fileBuffer,
    fileName,
    distributorId,
    distributorCode,
    claimPeriodStart,
    claimPeriodEnd,
    userId,
  } = input;

  // Get column mapping for this distributor
  const mapping = getColumnMapping(distributorCode);
  if (!mapping) {
    return {
      success: false,
      parseResult: {
        success: false,
        rows: [],
        totalRows: 0,
        validRows: 0,
        errorRows: 0,
        warnings: [],
        errors: [`No column mapping configured for distributor "${distributorCode}".`],
      },
      errors: [`No column mapping configured for distributor "${distributorCode}". Contact an administrator to set up the mapping.`],
    };
  }

  // Parse the file
  const parseResult = parseClaimFile(
    fileBuffer,
    fileName,
    mapping,
    claimPeriodStart,
    claimPeriodEnd
  );

  // If file-level parsing failed (no rows, wrong format, missing columns), stop
  if (!parseResult.success && parseResult.rows.length === 0) {
    return {
      success: false,
      parseResult,
      errors: parseResult.errors,
    };
  }

  // Store in database — batch, rows, and run in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create the claim batch
    const batch = await tx.claimBatch.create({
      data: {
        distributorId,
        claimPeriodStart,
        claimPeriodEnd,
        fileName,
        totalRows: parseResult.totalRows,
        validRows: parseResult.validRows,
        errorRows: parseResult.errorRows,
        status: CLAIM_BATCH_STATUSES.PARSED,
        columnMapping: distributorCode,
        uploadedById: userId,
      },
    });

    // Create claim rows
    if (parseResult.rows.length > 0) {
      await tx.claimRow.createMany({
        data: parseResult.rows.map(row => toClaimRowData(row, batch.id)),
      });
    }

    // Create the reconciliation run linked to this batch
    const run = await tx.reconciliationRun.create({
      data: {
        distributorId,
        claimPeriodStart,
        claimPeriodEnd,
        status: RUN_STATUSES.STAGED,
        claimBatchId: batch.id,
        totalClaimLines: parseResult.totalRows,
        runById: userId,
      },
    });

    return { batchId: batch.id, runId: run.id };
  });

  return {
    success: true,
    batchId: result.batchId,
    runId: result.runId,
    parseResult,
    errors: [],
  };
}

/**
 * Get a reconciliation run with its batch and summary data.
 */
export async function getReconciliationRun(runId: number) {
  return prisma.reconciliationRun.findUnique({
    where: { id: runId },
    include: {
      distributor: true,
      claimBatch: true,
      runBy: { select: { id: true, displayName: true } },
      _count: { select: { issues: true } },
    },
  });
}

/**
 * List reconciliation runs, optionally filtered.
 */
export async function listReconciliationRuns(filters?: {
  distributorId?: number;
  status?: string;
}) {
  return prisma.reconciliationRun.findMany({
    where: {
      ...(filters?.distributorId && { distributorId: filters.distributorId }),
      ...(filters?.status && { status: filters.status }),
    },
    include: {
      distributor: true,
      runBy: { select: { id: true, displayName: true } },
      _count: { select: { issues: true } },
    },
    orderBy: { startedAt: 'desc' },
  });
}

/**
 * Get claim rows for a batch, with pagination.
 */
export async function getClaimRows(batchId: number, options?: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 50;

  const [rows, total] = await Promise.all([
    prisma.claimRow.findMany({
      where: {
        batchId,
        ...(options?.status && { status: options.status }),
      },
      orderBy: { rowNumber: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.claimRow.count({
      where: {
        batchId,
        ...(options?.status && { status: options.status }),
      },
    }),
  ]);

  return { rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toClaimRowData(row: StandardClaimRow, batchId: number) {
  return {
    batchId,
    rowNumber: row.rowNumber,
    contractNumber: row.contractNumber,
    planCode: row.planCode,
    itemNumber: row.itemNumber,
    distributorItemNumber: row.distributorItemNumber,
    endUserCode: row.endUserCode,
    endUserName: row.endUserName,
    transactionDate: row.transactionDate,
    standardPrice: row.standardPrice !== null ? new Decimal(row.standardPrice) : null,
    deviatedPrice: row.deviatedPrice !== null ? new Decimal(row.deviatedPrice) : null,
    quantity: row.quantity !== null ? new Decimal(row.quantity) : null,
    claimedAmount: row.claimedAmount !== null ? new Decimal(row.claimedAmount) : null,
    distributorOrderNumber: row.distributorOrderNumber,
    rawData: row.rawData as Prisma.InputJsonValue,
    parseErrors: row.parseErrors.length > 0 ? (row.parseErrors as unknown as Prisma.InputJsonValue) : undefined,
    status: row.parseErrors.some(e => e.severity === 'error') ? 'error' : 'parsed',
  };
}
