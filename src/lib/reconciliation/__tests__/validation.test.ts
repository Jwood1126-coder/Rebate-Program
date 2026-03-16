import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EXCEPTION_CODES } from '../types';
import { Decimal } from '@prisma/client/runtime/library';

// ---------------------------------------------------------------------------
// Mock Prisma client — vi.mock is hoisted, so use vi.hoisted for the mock object
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      reconciliationRun: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      claimRow: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      reconciliationIssue: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      contract: {
        findMany: vi.fn(),
      },
      item: {
        findMany: vi.fn(),
      },
      rebateRecord: {
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/db/client', () => ({
  prisma: mockPrisma,
}));

import { validateRun } from '../validation.service';

// ---------------------------------------------------------------------------
// Helpers to build test data
// ---------------------------------------------------------------------------

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    distributorId: 10,
    claimPeriodStart: new Date('2026-02-01T00:00:00Z'),
    claimPeriodEnd: new Date('2026-02-28T23:59:59Z'),
    distributor: { id: 10, code: 'MOTION', name: 'Motion Industries' },
    claimBatch: { id: 100 },
    status: 'staged',
    ...overrides,
  };
}

function makeClaimRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    batchId: 100,
    rowNumber: 2,
    contractNumber: '100884',
    itemNumber: '6801-12-12-NWO-FG',
    transactionDate: new Date('2026-02-15T00:00:00Z'),
    deviatedPrice: new Decimal('2.78'),
    quantity: new Decimal('150'),
    status: 'parsed',
    distributorOrderNumber: 'MO-12345',
    ...overrides,
  };
}

function makeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    contractNumber: '100884',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2027-12-31'),
    status: 'active',
    ...overrides,
  };
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    itemNumber: '6801-12-12-NWO-FG',
    ...overrides,
  };
}

function makeRebateRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    itemId: 1,
    rebatePrice: new Decimal('2.78'),
    rebatePlanId: 50,
    startDate: new Date('2025-01-01'),
    endDate: null,
    status: 'active',
    rebatePlan: { contractId: 1 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup: configure default happy-path mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Default: run exists with a batch
  mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
  mockPrisma.reconciliationRun.update.mockResolvedValue({});

  // Default: one valid claim row
  mockPrisma.claimRow.findMany.mockResolvedValue([makeClaimRow()]);
  mockPrisma.claimRow.update.mockResolvedValue({});

  // Default: contract exists
  mockPrisma.contract.findMany.mockResolvedValue([makeContract()]);

  // Default: item exists
  mockPrisma.item.findMany.mockResolvedValue([makeItem()]);

  // Default: rebate record exists with matching price
  mockPrisma.rebateRecord.findMany.mockResolvedValue([makeRebateRecord()]);

  // Default: issue ops
  mockPrisma.reconciliationIssue.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.reconciliationIssue.createMany.mockResolvedValue({ count: 0 });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('validateRun', () => {
  it('returns success=false when run does not exist', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(null);

    const result = await validateRun(999);

    expect(result.success).toBe(false);
    expect(result.runId).toBe(999);
  });

  it('returns success=false when run has no claim batch', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(
      makeRun({ claimBatch: null })
    );

    const result = await validateRun(1);

    expect(result.success).toBe(false);
  });

  it('validates a clean row with no exceptions', async () => {
    const result = await validateRun(1);

    expect(result.success).toBe(true);
    expect(result.totalRows).toBe(1);
    expect(result.matchedCount).toBe(1);
    expect(result.exceptionCount).toBe(0);
    expect(result.issues).toHaveLength(0);

    // Run status should be set to completed (no exceptions)
    expect(mockPrisma.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed' }),
      })
    );
  });

  it('detects CLM-004: Contract Not Found', async () => {
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({ contractNumber: '999999' }),
    ]);

    const result = await validateRun(1);

    expect(result.exceptionCount).toBeGreaterThanOrEqual(1);
    const issue = result.issues.find(i => i.code === EXCEPTION_CODES.CLM_004);
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('error');
    expect(issue!.description).toContain('999999');
  });

  it('detects CLM-007: Contract Expired', async () => {
    // Contract expired in 2025, transaction in Feb 2026
    mockPrisma.contract.findMany.mockResolvedValue([
      makeContract({ endDate: new Date('2025-12-31') }),
    ]);

    const result = await validateRun(1);

    const issue = result.issues.find(i => i.code === EXCEPTION_CODES.CLM_007);
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('error');
    expect(issue!.suggestedAction).toBe('reject');
  });

  it('does not flag CLM-007 when contract end date is after transaction date', async () => {
    // Contract valid through 2027
    mockPrisma.contract.findMany.mockResolvedValue([
      makeContract({ endDate: new Date('2027-12-31') }),
    ]);

    const result = await validateRun(1);

    const issue = result.issues.find(i => i.code === EXCEPTION_CODES.CLM_007);
    expect(issue).toBeUndefined();
  });

  it('detects CLM-006: Unknown Item', async () => {
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({ itemNumber: '9999-FAKE-ITEM' }),
    ]);

    const result = await validateRun(1);

    const issue = result.issues.find(i => i.code === EXCEPTION_CODES.CLM_006);
    expect(issue).toBeDefined();
    expect(issue!.description).toContain('9999-FAKE-ITEM');
    expect(issue!.suggestedAction).toBe('create_item');
  });

  it('detects CLM-003: Item Not in Contract', async () => {
    // Item exists but no rebate record links it to this contract
    mockPrisma.rebateRecord.findMany.mockResolvedValue([]);

    const result = await validateRun(1);

    const issue = result.issues.find(i => i.code === EXCEPTION_CODES.CLM_003);
    expect(issue).toBeDefined();
    expect(issue!.description).toContain('not on any plan');
  });

  it('detects CLM-001: Price Mismatch beyond tolerance', async () => {
    // Contract price is $2.78, claim price is $6.00 — big mismatch
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({ deviatedPrice: new Decimal('6.00') }),
    ]);

    const result = await validateRun(1);

    const issue = result.issues.find(i => i.code === EXCEPTION_CODES.CLM_001);
    expect(issue).toBeDefined();
    expect(issue!.description).toContain('$6.00');
    expect(issue!.description).toContain('$2.78');
    expect(issue!.suggestedAction).toBe('adjust');
  });

  it('does not flag CLM-001 when price is within $0.01 tolerance', async () => {
    // Contract price $2.78, claimed $2.785 (within tolerance)
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({ deviatedPrice: new Decimal('2.785') }),
    ]);

    const result = await validateRun(1);

    const issue = result.issues.find(i => i.code === EXCEPTION_CODES.CLM_001);
    expect(issue).toBeUndefined();
  });

  it('detects CLM-002: Date Out of Range', async () => {
    // Transaction in January, claim period is February
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({ transactionDate: new Date('2026-01-15T00:00:00Z') }),
    ]);

    const result = await validateRun(1);

    const issue = result.issues.find(i => i.code === EXCEPTION_CODES.CLM_002);
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
    expect(issue!.suggestedAction).toBe('flag_review');
  });

  it('does not flag CLM-002 when date is within claim period', async () => {
    const result = await validateRun(1);

    const issue = result.issues.find(i => i.code === EXCEPTION_CODES.CLM_002);
    expect(issue).toBeUndefined();
  });

  it('detects CLM-009: Duplicate Claim Line', async () => {
    const row1 = makeClaimRow({ id: 1, rowNumber: 2 });
    const row2 = makeClaimRow({ id: 2, rowNumber: 3 });
    mockPrisma.claimRow.findMany.mockResolvedValue([row1, row2]);

    const result = await validateRun(1);

    const dupeIssue = result.issues.find(i => i.code === EXCEPTION_CODES.CLM_009);
    expect(dupeIssue).toBeDefined();
    expect(dupeIssue!.severity).toBe('warning');
    expect(dupeIssue!.description).toContain('duplicate');
  });

  it('skips rows with status "error"', async () => {
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({ status: 'error', contractNumber: '999999' }),
    ]);

    const result = await validateRun(1);

    // Should not produce any issues since the row was skipped
    expect(result.issues).toHaveLength(0);
    expect(result.matchedCount).toBe(0);
  });

  it('sets run status to "review" when there are exceptions', async () => {
    // Unknown item triggers an exception
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({ itemNumber: 'UNKNOWN-ITEM' }),
    ]);

    await validateRun(1);

    // Final update should set status to 'review'
    const updateCalls = mockPrisma.reconciliationRun.update.mock.calls;
    const finalUpdate = updateCalls[updateCalls.length - 1];
    expect(finalUpdate[0].data.status).toBe('review');
  });

  it('sets matched row status to "validated" when clean', async () => {
    await validateRun(1);

    // Claim row should be updated to 'validated'
    expect(mockPrisma.claimRow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'validated' }),
      })
    );
  });

  it('sets row status to "unmatched" when there are error-severity issues', async () => {
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({ itemNumber: 'UNKNOWN-ITEM' }),
    ]);

    await validateRun(1);

    expect(mockPrisma.claimRow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'unmatched' }),
      })
    );
  });

  it('updates matchedRecordId on claim row when record is found', async () => {
    await validateRun(1);

    expect(mockPrisma.claimRow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchedRecordId: 1 }),
      })
    );
  });

  it('bulk inserts all issues into reconciliationIssue table', async () => {
    // Two rows: one with unknown item, one clean
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({ id: 1, rowNumber: 2, itemNumber: 'UNKNOWN' }),
      makeClaimRow({ id: 2, rowNumber: 3 }),
    ]);

    await validateRun(1);

    expect(mockPrisma.reconciliationIssue.createMany).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.reconciliationIssue.createMany.mock.calls[0][0];
    expect(createCall.data.length).toBeGreaterThanOrEqual(1);
    expect(createCall.data.some((d: { code: string }) => d.code === EXCEPTION_CODES.CLM_006)).toBe(true);
  });

  it('deletes existing issues before re-validating', async () => {
    await validateRun(1);

    expect(mockPrisma.reconciliationIssue.deleteMany).toHaveBeenCalledWith({
      where: { reconciliationRunId: 1 },
    });
  });

  it('handles multiple exception types on a single row', async () => {
    // Row with unknown contract AND unknown item — two different errors
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({
        contractNumber: '999999',
        itemNumber: 'UNKNOWN-ITEM',
        transactionDate: new Date('2026-01-01T00:00:00Z'), // also out of range
      }),
    ]);

    const result = await validateRun(1);

    const codes = result.issues.map(i => i.code);
    expect(codes).toContain(EXCEPTION_CODES.CLM_004); // contract not found
    expect(codes).toContain(EXCEPTION_CODES.CLM_006); // unknown item
    expect(codes).toContain(EXCEPTION_CODES.CLM_002); // date out of range
  });

  it('counts validated rows correctly (excludes error-status rows)', async () => {
    mockPrisma.claimRow.findMany.mockResolvedValue([
      makeClaimRow({ id: 1, rowNumber: 2, status: 'parsed' }),
      makeClaimRow({ id: 2, rowNumber: 3, status: 'error' }),
      makeClaimRow({ id: 3, rowNumber: 4, status: 'parsed' }),
    ]);

    const result = await validateRun(1);

    expect(result.totalRows).toBe(3);
    expect(result.validatedCount).toBe(2); // only non-error rows
  });
});
