// POS staging service.
// Orchestrates: POS file upload → parse → store in staging tables.
// Mirrors the claim staging service pattern.

import { prisma } from '@/lib/db/client';
import { parsePosFile } from './pos-parsing.service';
import { getColumnMappingAsync } from './column-mappings.server';
import type { PosParseResult, StandardPosRow } from './types';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';

export interface StagePosFileInput {
  fileBuffer: Buffer;
  fileName: string;
  distributorId: number;
  distributorCode: string;
  periodStart: Date;
  periodEnd: Date;
  userId: number;
  reconciliationRunId: number;
}

export interface StagePosFileResult {
  success: boolean;
  batchId?: number;
  parseResult: PosParseResult;
  errors: string[];
}

/**
 * Stage a POS file: parse it and store rows in pos_rows.
 * Links the POS batch to an existing reconciliation run.
 */
export async function stagePosFile(input: StagePosFileInput): Promise<StagePosFileResult> {
  const {
    fileBuffer,
    fileName,
    distributorId,
    distributorCode,
    periodStart,
    periodEnd,
    userId,
    reconciliationRunId,
  } = input;

  // Get column mapping for POS file type
  const mapping = await getColumnMappingAsync(distributorCode, 'pos');
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
        errors: [`No POS column mapping configured for distributor "${distributorCode}". Configure it in Settings → Column Mappings.`],
      },
      errors: [`No POS column mapping configured for distributor "${distributorCode}".`],
    };
  }

  // Parse the file
  const parseResult = parsePosFile(fileBuffer, fileName, mapping, periodStart, periodEnd);

  // If no parseable rows at all, stop
  if (!parseResult.success && parseResult.rows.length === 0) {
    return {
      success: false,
      parseResult,
      errors: parseResult.errors,
    };
  }

  // Store in database
  const result = await prisma.$transaction(async (tx) => {
    // Create POS batch
    const batch = await tx.posBatch.create({
      data: {
        distributorId,
        periodStart,
        periodEnd,
        fileName,
        totalRows: parseResult.totalRows,
        validRows: parseResult.validRows,
        errorRows: parseResult.errorRows,
        status: 'parsed',
        columnMapping: distributorCode,
        uploadedById: userId,
      },
    });

    // Create POS rows
    if (parseResult.rows.length > 0) {
      await tx.posRow.createMany({
        data: parseResult.rows.map(row => toPosRowData(row, batch.id)),
      });
    }

    // Link to reconciliation run
    await tx.reconciliationRun.update({
      where: { id: reconciliationRunId },
      data: { posBatchId: batch.id },
    });

    return { batchId: batch.id };
  });

  return {
    success: true,
    batchId: result.batchId,
    parseResult,
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPosRowData(row: StandardPosRow, batchId: number) {
  return {
    batchId,
    rowNumber: row.rowNumber,
    itemNumber: row.itemNumber,
    distributorItemNumber: row.distributorItemNumber,
    transactionDate: row.transactionDate,
    quantity: row.quantity !== null ? new Decimal(row.quantity) : null,
    sellPrice: row.sellPrice !== null ? new Decimal(row.sellPrice) : null,
    extendedAmount: row.extendedAmount !== null ? new Decimal(row.extendedAmount) : null,
    endUserCode: row.endUserCode,
    endUserName: row.endUserName,
    orderNumber: row.orderNumber,
    shipToCity: row.shipToCity,
    shipToState: row.shipToState,
    rawData: row.rawData as Prisma.InputJsonValue,
    parseErrors: row.parseErrors.length > 0 ? (row.parseErrors as unknown as Prisma.InputJsonValue) : undefined,
    status: row.parseErrors.some(e => e.severity === 'error') ? 'error' : 'parsed',
  };
}
