import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EXCEPTION_CODES } from '../types';
import { Decimal } from '@prisma/client/runtime/library';

// ---------------------------------------------------------------------------
// Mock Prisma client
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => {
  const txMethods = {
    rebateRecord: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    reconciliationIssue: {
      update: vi.fn(),
    },
    reconciliationRun: {
      update: vi.fn(),
    },
    item: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    contract: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    mockPrisma: {
      reconciliationRun: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      reconciliationIssue: {
        findMany: vi.fn(),
      },
      // Post-commit contract review helpers
      claimBatch: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      claimRow: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      contract: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      // $transaction calls the callback with the tx client
      $transaction: vi.fn(async (fn: (tx: typeof txMethods) => Promise<unknown>) => {
        return fn(txMethods);
      }),
      // Expose tx methods for assertions
      _tx: txMethods,
    },
  };
});

vi.mock('@/lib/db/client', () => ({
  prisma: mockPrisma,
}));

// Mock audit helpers (they're imported by commit.service)
vi.mock('@/lib/audit/diff', () => ({
  computeInsertSnapshot: vi.fn((rec: Record<string, unknown>) => {
    const snap: Record<string, { old: null; new: unknown }> = {};
    for (const [k, v] of Object.entries(rec)) snap[k] = { old: null, new: v };
    return snap;
  }),
  computeFieldDiff: vi.fn((old: Record<string, unknown>, next: Record<string, unknown>) => {
    const diff: Record<string, { old: unknown; new: unknown }> = {};
    for (const k of Object.keys(next)) {
      if (old[k] !== next[k]) diff[k] = { old: old[k] ?? null, new: next[k] };
    }
    return diff;
  }),
}));

import { commitRun } from '../commit.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    distributorId: 10,
    status: 'reviewed',
    claimPeriodStart: new Date('2026-02-01'),
    claimPeriodEnd: new Date('2026-02-28'),
    distributor: { id: 10, code: 'MOTION' },
    ...overrides,
  };
}

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    reconciliationRunId: 1,
    code: EXCEPTION_CODES.CLM_001,
    severity: 'error',
    category: 'Price Mismatch',
    description: 'test',
    claimRowId: 100,
    masterRecordId: 50,
    suggestedAction: 'adjust',
    suggestedData: { oldPrice: 2.50, newPrice: 2.78, planId: 5, itemId: 20 },
    resolution: 'approved',
    resolutionNote: null,
    resolvedById: 1,
    resolvedAt: new Date(),
    committedRecordId: null,
    ...overrides,
  };
}

function makeOldRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 50,
    rebatePlanId: 5,
    itemId: 20,
    rebatePrice: new Decimal('2.50'),
    startDate: new Date('2026-01-01'),
    endDate: null,
    status: 'active',
    supersededById: null,
    createdById: 1,
    updatedById: 1,
    ...overrides,
  };
}

function resetMocks() {
  vi.clearAllMocks();
  // Default: $transaction passes through to callback
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma._tx) => Promise<unknown>) => fn(mockPrisma._tx),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commitRun', () => {
  beforeEach(resetMocks);

  // --- Pre-flight checks ---

  it('returns error if run not found', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(null);
    const result = await commitRun(999, 1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('returns error if run is not in reviewed/completed status', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun({ status: 'review' }));
    const result = await commitRun(1, 1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/must be fully reviewed/i);
  });

  it('returns error if unresolved issues exist', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      makeIssue({ resolution: null }),
    ]);
    const result = await commitRun(1, 1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unresolved/i);
  });

  // --- Fast path: no approved issues ---

  it('marks run committed when no approved issues exist', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      makeIssue({ resolution: 'rejected' }),
      makeIssue({ id: 2, resolution: 'dismissed' }),
    ]);

    const result = await commitRun(1, 1);
    expect(result.success).toBe(true);
    expect(result.summary.totalApproved).toBe(0);
    expect(result.summary.rejected).toBe(1);
    expect(result.summary.dismissed).toBe(1);
    expect(mockPrisma.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'committed' }) }),
    );
  });

  it('persists commitSummary on the run (fast path)', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      makeIssue({ resolution: 'rejected' }),
      makeIssue({ id: 2, resolution: 'dismissed' }),
      makeIssue({ id: 3, resolution: 'deferred' }),
    ]);

    await commitRun(1, 1);
    const updateCall = mockPrisma.reconciliationRun.update.mock.calls[0][0];
    expect(updateCall.data.commitSummary).toEqual(expect.objectContaining({
      totalApproved: 0,
      rejected: 1,
      dismissed: 1,
      deferred: 1,
      recordsCreated: 0,
      recordsSuperseded: 0,
      recordsUpdated: 0,
      itemsCreated: 0,
    }));
  });

  // --- CLM-001: Price mismatch (standard supersession) ---

  it('CLM-001: supersedes old record and creates new record at claimed price', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([makeIssue()]);

    const tx = mockPrisma._tx;
    tx.rebateRecord.findUnique.mockResolvedValue(makeOldRecord());
    tx.rebateRecord.create.mockResolvedValue({
      id: 99,
      rebatePlanId: 5,
      itemId: 20,
      rebatePrice: new Decimal('2.78'),
      startDate: new Date('2026-02-01'),
      endDate: null,
      status: 'active',
    });
    tx.rebateRecord.update.mockResolvedValue({});
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await commitRun(1, 1);

    expect(result.success).toBe(true);
    expect(result.summary.recordsCreated).toBe(1);
    expect(result.summary.recordsSuperseded).toBe(1);

    // Verify new record created with claim period start
    expect(tx.rebateRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rebatePlanId: 5,
        itemId: 20,
        rebatePrice: 2.78,
        startDate: new Date('2026-02-01'),
        status: 'active',
      }),
    });

    // Verify old record superseded with end date = day before claim period
    expect(tx.rebateRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: expect.objectContaining({
          status: 'superseded',
          endDate: new Date('2026-01-31'),
          supersededById: 99,
        }),
      }),
    );

    // Verify committedRecordId stamped on issue
    expect(tx.reconciliationIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { committedRecordId: 99 },
      }),
    );

    // Verify run status updated to committed inside transaction
    expect(tx.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'committed' }),
      }),
    );

    // Audit entries: insert for new record + update for old record + update for run
    expect(tx.auditLog.create).toHaveBeenCalledTimes(3);

    // Verify commitSummary persisted on the run inside the transaction
    expect(tx.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          commitSummary: expect.objectContaining({
            totalApproved: 1,
            recordsCreated: 1,
            recordsSuperseded: 1,
            recordsUpdated: 0,
          }),
        }),
      }),
    );
  });

  // --- CLM-001: Same start date → in-place update ---

  it('CLM-001: updates price in place when old record starts on claim period start', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([makeIssue()]);

    const tx = mockPrisma._tx;
    // Old record starts on same day as claim period
    tx.rebateRecord.findUnique.mockResolvedValue(
      makeOldRecord({ startDate: new Date('2026-02-01') }),
    );
    tx.rebateRecord.update.mockResolvedValue({});
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await commitRun(1, 1);

    expect(result.success).toBe(true);
    // In-place update: counts as recordsUpdated, NOT recordsSuperseded
    expect(result.summary.recordsUpdated).toBe(1);
    expect(result.summary.recordsSuperseded).toBe(0);
    expect(result.summary.recordsCreated).toBe(0);

    // Should NOT create a new record (in-place update)
    expect(tx.rebateRecord.create).not.toHaveBeenCalled();

    // Should update the existing record's price
    expect(tx.rebateRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: expect.objectContaining({ rebatePrice: 2.78 }),
      }),
    );
  });

  // --- CLM-001: missing metadata → error ---

  it('CLM-001: fails if masterRecordId is missing', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      makeIssue({ masterRecordId: null }),
    ]);

    const result = await commitRun(1, 1);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/missing masterRecordId/);
    expect(result.failedIssueId).toBe(1);
  });

  it('CLM-001: fails cleanly when the validated record was superseded by a later contract update', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([makeIssue()]);

    const tx = mockPrisma._tx;
    tx.rebateRecord.findUnique.mockResolvedValueOnce(
      makeOldRecord({ supersededById: 99, status: 'superseded' }),
    );

    const result = await commitRun(1, 1);

    expect(result.success).toBe(false);
    expect(result.failedIssueId).toBe(1);
    expect(result.error).toMatch(/already superseded/i);
    expect(result.error).toMatch(/re-validate/i);
    expect(tx.rebateRecord.create).not.toHaveBeenCalled();
    expect(tx.rebateRecord.update).not.toHaveBeenCalled();
  });

  // --- CLM-003: Item not in contract ---

  it('CLM-003: creates new record using explicit planId from suggestedData', async () => {
    const issue = makeIssue({
      code: EXCEPTION_CODES.CLM_003,
      masterRecordId: null,
      suggestedData: { planId: 7, itemId: 20, claimedPrice: 3.50, candidatePlanIds: [7] },
    });

    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([issue]);

    const tx = mockPrisma._tx;
    tx.rebateRecord.findFirst.mockResolvedValue(null); // no existing
    tx.rebateRecord.create.mockResolvedValue({
      id: 101,
      rebatePlanId: 7,
      itemId: 20,
      rebatePrice: new Decimal('3.50'),
      startDate: new Date('2026-02-01'),
      endDate: null,
      status: 'active',
    });
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await commitRun(1, 1);

    expect(result.success).toBe(true);
    expect(result.summary.recordsCreated).toBe(1);
    expect(tx.rebateRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rebatePlanId: 7,
        itemId: 20,
        rebatePrice: 3.50,
        startDate: new Date('2026-02-01'),
      }),
    });
  });

  it('CLM-003: fails when planId is null (ambiguous)', async () => {
    const issue = makeIssue({
      code: EXCEPTION_CODES.CLM_003,
      masterRecordId: null,
      suggestedData: { planId: null, itemId: 20, claimedPrice: 3.50, candidatePlanIds: [7, 8] },
    });

    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([issue]);

    const result = await commitRun(1, 1);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no target plan/i);
    expect(result.failedIssueId).toBe(1);
  });

  it('CLM-003: treats existing record as confirmation (no duplicate)', async () => {
    const issue = makeIssue({
      code: EXCEPTION_CODES.CLM_003,
      masterRecordId: null,
      suggestedData: { planId: 7, itemId: 20, claimedPrice: 3.50, candidatePlanIds: [7] },
    });

    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([issue]);

    const tx = mockPrisma._tx;
    tx.rebateRecord.findFirst.mockResolvedValue({ id: 80, status: 'active' }); // already exists
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await commitRun(1, 1);

    expect(result.success).toBe(true);
    expect(result.summary.recordsCreated).toBe(0);
    expect(result.summary.confirmed).toBe(1);
    expect(tx.rebateRecord.create).not.toHaveBeenCalled();
  });

  // --- CLM-006: Unknown item ---

  it('CLM-006: creates item and record', async () => {
    const issue = makeIssue({
      code: EXCEPTION_CODES.CLM_006,
      masterRecordId: null,
      suggestedData: { itemNumber: 'NEW-PART-999', claimedPrice: 5.25, contractNumber: '100884' },
    });

    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([issue]);

    const tx = mockPrisma._tx;
    tx.item.findUnique.mockResolvedValue(null); // item doesn't exist
    tx.item.create.mockResolvedValue({ id: 30, itemNumber: 'NEW-PART-999', isActive: true });
    tx.contract.findFirst.mockResolvedValue({
      id: 1,
      contractNumber: '100884',
      rebatePlans: [{ id: 5 }],
    });
    tx.rebateRecord.create.mockResolvedValue({
      id: 102,
      rebatePlanId: 5,
      itemId: 30,
      rebatePrice: new Decimal('5.25'),
      startDate: new Date('2026-02-01'),
      endDate: null,
      status: 'active',
    });
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await commitRun(1, 1);

    expect(result.success).toBe(true);
    expect(result.summary.itemsCreated).toBe(1);
    expect(result.summary.recordsCreated).toBe(1);

    expect(tx.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemNumber: 'NEW-PART-999' }),
    });
    expect(tx.rebateRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rebatePlanId: 5,
        itemId: 30,
        rebatePrice: 5.25,
      }),
    });
  });

  it('CLM-006: reuses existing item if already created', async () => {
    const issue = makeIssue({
      code: EXCEPTION_CODES.CLM_006,
      masterRecordId: null,
      suggestedData: { itemNumber: 'EXISTING-PART', claimedPrice: 1.00, contractNumber: '100884' },
    });

    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([issue]);

    const tx = mockPrisma._tx;
    tx.item.findUnique.mockResolvedValue({ id: 15, itemNumber: 'EXISTING-PART', isActive: true });
    tx.contract.findFirst.mockResolvedValue({
      id: 1,
      contractNumber: '100884',
      rebatePlans: [{ id: 5 }],
    });
    tx.rebateRecord.create.mockResolvedValue({
      id: 103,
      rebatePlanId: 5,
      itemId: 15,
      rebatePrice: new Decimal('1.00'),
      startDate: new Date('2026-02-01'),
      endDate: null,
      status: 'active',
    });
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await commitRun(1, 1);

    expect(result.success).toBe(true);
    expect(result.summary.itemsCreated).toBe(0);
    expect(result.summary.recordsCreated).toBe(1);
    expect(tx.item.create).not.toHaveBeenCalled();
  });

  it('CLM-006: fails when contract has multiple plans', async () => {
    const issue = makeIssue({
      code: EXCEPTION_CODES.CLM_006,
      masterRecordId: null,
      suggestedData: { itemNumber: 'NEW-PART', claimedPrice: 1.00, contractNumber: '100884' },
    });

    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([issue]);

    const tx = mockPrisma._tx;
    tx.item.findUnique.mockResolvedValue(null);
    tx.item.create.mockResolvedValue({ id: 30, itemNumber: 'NEW-PART', isActive: true });
    tx.contract.findFirst.mockResolvedValue({
      id: 1,
      contractNumber: '100884',
      rebatePlans: [{ id: 5 }, { id: 6 }], // multiple plans
    });
    tx.auditLog.create.mockResolvedValue({});

    const result = await commitRun(1, 1);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot auto-assign/i);
    expect(result.failedIssueId).toBe(1);
  });

  // --- Informational approvals ---

  it('informational approval stamps committedRecordId but does not write master data', async () => {
    const issue = makeIssue({
      code: EXCEPTION_CODES.CLM_002, // Date out of range — informational
      severity: 'warning',
      masterRecordId: 50,
      suggestedData: null,
    });

    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([issue]);

    const tx = mockPrisma._tx;
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await commitRun(1, 1);

    expect(result.success).toBe(true);
    expect(result.summary.confirmed).toBe(1);
    expect(result.summary.recordsCreated).toBe(0);
    expect(result.summary.recordsSuperseded).toBe(0);

    // Should stamp committedRecordId
    expect(tx.reconciliationIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { committedRecordId: 50 },
      }),
    );

    // Should NOT create or supersede any records
    expect(tx.rebateRecord.create).not.toHaveBeenCalled();
    expect(tx.rebateRecord.update).not.toHaveBeenCalled();
  });

  // --- Transaction rollback ---

  it('rolls back all writes when one approved issue fails mid-transaction', async () => {
    // Two approved issues: first succeeds, second fails
    const issue1 = makeIssue({ id: 1, masterRecordId: 50 });
    const issue2 = makeIssue({
      id: 2,
      code: EXCEPTION_CODES.CLM_003,
      masterRecordId: null,
      suggestedData: { planId: null, itemId: 20, claimedPrice: 3.00, candidatePlanIds: [7, 8] },
    });

    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([issue1, issue2]);

    const tx = mockPrisma._tx;
    // First issue would succeed normally
    tx.rebateRecord.findUnique.mockResolvedValue(makeOldRecord());
    tx.rebateRecord.create.mockResolvedValue({
      id: 99, rebatePlanId: 5, itemId: 20,
      rebatePrice: new Decimal('2.78'), startDate: new Date('2026-02-01'),
      endDate: null, status: 'active',
    });
    tx.rebateRecord.update.mockResolvedValue({});
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    // But $transaction should propagate the error and roll back
    // The CommitError from issue2 (null planId) will cause the tx to fail
    const result = await commitRun(1, 1);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no target plan/i);
    expect(result.failedIssueId).toBe(2);

    // Run status should NOT have been updated outside the transaction
    // (the fast-path update is only for zero-approved; inside-tx update rolled back)
    expect(mockPrisma.reconciliationRun.update).not.toHaveBeenCalled();
  });

  // --- Run status ---

  it('only transitions to committed on success (inside transaction)', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([makeIssue()]);

    const tx = mockPrisma._tx;
    tx.rebateRecord.findUnique.mockResolvedValue(makeOldRecord());
    tx.rebateRecord.create.mockResolvedValue({
      id: 99, rebatePlanId: 5, itemId: 20,
      rebatePrice: new Decimal('2.78'), startDate: new Date('2026-02-01'),
      endDate: null, status: 'active',
    });
    tx.rebateRecord.update.mockResolvedValue({});
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await commitRun(1, 1);

    expect(result.success).toBe(true);

    // Run status set inside transaction
    expect(tx.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'committed' }),
      }),
    );
  });

  // --- Result shape ---

  it('returns complete summary with all resolution categories', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      makeIssue({ id: 1, resolution: 'approved', code: EXCEPTION_CODES.CLM_002, masterRecordId: 50, suggestedData: null }),
      makeIssue({ id: 2, resolution: 'rejected' }),
      makeIssue({ id: 3, resolution: 'dismissed' }),
      makeIssue({ id: 4, resolution: 'deferred' }),
      makeIssue({ id: 5, resolution: 'deferred' }),
    ]);

    const tx = mockPrisma._tx;
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await commitRun(1, 1);

    expect(result.success).toBe(true);
    expect(result.summary).toEqual({
      totalApproved: 1,
      recordsCreated: 0,
      recordsSuperseded: 0,
      recordsUpdated: 0,
      itemsCreated: 0,
      confirmed: 1,
      rejected: 1,
      dismissed: 1,
      deferred: 2,
    });
  });

  // --- Legacy status support ---

  it('accepts runs in legacy "completed" status', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun({ status: 'completed' }));
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      makeIssue({ resolution: 'rejected' }),
    ]);

    const result = await commitRun(1, 1);
    expect(result.success).toBe(true);
  });

  // --- Audit logging ---

  it('writes audit log entries inside the transaction', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([makeIssue()]);

    const tx = mockPrisma._tx;
    tx.rebateRecord.findUnique.mockResolvedValue(makeOldRecord());
    tx.rebateRecord.create.mockResolvedValue({
      id: 99, rebatePlanId: 5, itemId: 20,
      rebatePrice: new Decimal('2.78'), startDate: new Date('2026-02-01'),
      endDate: null, status: 'active',
    });
    tx.rebateRecord.update.mockResolvedValue({});
    tx.reconciliationIssue.update.mockResolvedValue({});
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    await commitRun(1, 1);

    // All audit writes go through tx.auditLog.create, not the global prisma
    const auditCalls = tx.auditLog.create.mock.calls;
    expect(auditCalls.length).toBeGreaterThanOrEqual(2);

    // First audit: INSERT for new record
    expect(auditCalls[0][0].data.action).toBe('INSERT');
    expect(auditCalls[0][0].data.tableName).toBe('rebate_records');

    // Second audit: UPDATE for superseded old record
    expect(auditCalls[1][0].data.action).toBe('UPDATE');
    expect(auditCalls[1][0].data.tableName).toBe('rebate_records');
  });

  // --- Supersession guard ---

  it('rejects CLM-001 commit if target record was already superseded', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(makeRun());
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([makeIssue()]);

    const tx = mockPrisma._tx;
    // Record was superseded by a contract update between validation and commit
    tx.rebateRecord.findUnique.mockResolvedValue(makeOldRecord({
      supersededById: 999,
      status: 'superseded',
    }));

    const result = await commitRun(1, 1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already superseded/);
  });
});
