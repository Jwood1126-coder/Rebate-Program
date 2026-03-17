import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => {
  const txMethods = {
    reconciliationIssue: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    reconciliationRun: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    mockPrisma: {
      reconciliationIssue: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      reconciliationRun: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: typeof txMethods) => Promise<unknown>) => {
        return fn(txMethods);
      }),
      _tx: txMethods,
    },
  };
});

vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

import { resolveIssue, bulkResolveIssues, reopenRun, getRunProgress } from '../resolution.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    reconciliationRunId: 10,
    code: 'CLM-001',
    severity: 'error',
    resolution: null,
    resolutionNote: null,
    resolvedById: null,
    resolvedAt: null,
    committedRecordId: null,
    masterRecordId: 50,
    reconciliationRun: { id: 10, status: 'review' },
    ...overrides,
  };
}

function resetMocks() {
  vi.clearAllMocks();
  // Default: inner lock check inside transaction sees a "review" run (not locked).
  // Tests that simulate a race override this per-test.
  mockPrisma._tx.reconciliationRun.findUnique.mockResolvedValue({ status: 'review' });
}

// ---------------------------------------------------------------------------
// resolveIssue
// ---------------------------------------------------------------------------

describe('resolveIssue', () => {
  beforeEach(resetMocks);

  it('resolves an issue and returns progress', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(makeIssue());
    // All mutations now happen inside transaction
    const tx = mockPrisma._tx;
    tx.reconciliationIssue.update.mockResolvedValue({
      id: 1,
      resolution: 'approved',
      resolvedAt: new Date(),
    });
    // getRunProgress reads inside tx
    tx.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'approved' },
    ]);
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(true);
    expect(result.issue?.resolution).toBe('approved');
    expect(result.runProgress?.allResolved).toBe(true);
    // All writes happen inside a transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('audits the resolution change inside transaction', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(makeIssue());
    const tx = mockPrisma._tx;
    tx.reconciliationIssue.update.mockResolvedValue({
      id: 1,
      resolution: 'rejected',
      resolvedAt: new Date(),
    });
    tx.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'rejected' },
    ]);
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    await resolveIssue(1, { resolution: 'rejected', resolvedById: 5 });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'reconciliation_issues',
        recordId: 1,
        action: 'UPDATE',
        userId: 5,
      }),
    });
  });

  it('rejects resolution on a committed run (no transaction entered)', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(
      makeIssue({ reconciliationRun: { id: 10, status: 'committed' } }),
    );

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/committed/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects resolution on a cancelled run (no transaction entered)', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(
      makeIssue({ reconciliationRun: { id: 10, status: 'cancelled' } }),
    );

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cancelled/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  // --- Run scoping ---

  it('rejects issue that does not belong to the expected run', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(
      makeIssue({ reconciliationRunId: 10 }),
    );

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    }, 99); // expectedRunId doesn't match

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not belong/i);
  });

  it('accepts issue that belongs to the expected run', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(makeIssue());
    const tx = mockPrisma._tx;
    tx.reconciliationIssue.update.mockResolvedValue({
      id: 1,
      resolution: 'approved',
      resolvedAt: new Date(),
    });
    tx.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'approved' },
    ]);
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    }, 10); // matches

    expect(result.success).toBe(true);
  });

  // --- Status transitions ---

  it('sets run to reviewed when last issue is resolved (inside tx)', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(makeIssue());
    const tx = mockPrisma._tx;
    tx.reconciliationIssue.update.mockResolvedValue({
      id: 1,
      resolution: 'dismissed',
      resolvedAt: new Date(),
    });
    // All resolved
    tx.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'dismissed' },
    ]);
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    await resolveIssue(1, { resolution: 'dismissed', resolvedById: 5 });

    expect(tx.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'reviewed' }),
      }),
    );
  });

  it('reverts run from reviewed to review when resolution is changed (inside tx)', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(
      makeIssue({
        resolution: 'approved',
        reconciliationRun: { id: 10, status: 'reviewed' },
      }),
    );
    const tx = mockPrisma._tx;
    tx.reconciliationIssue.update.mockResolvedValue({
      id: 1,
      resolution: 'rejected',
      resolvedAt: new Date(),
    });
    // Not all resolved — run was "reviewed" before
    tx.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'rejected' },
      { resolution: null }, // another pending issue
    ]);
    tx.auditLog.create.mockResolvedValue({});

    await resolveIssue(1, { resolution: 'rejected', resolvedById: 5 });

    // Run should revert to 'review' since not all resolved anymore
    expect(tx.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'review', completedAt: null }),
      }),
    );
  });

  // --- Preflight race guard ---

  it('rejects if run became committed between preflight and transaction', async () => {
    // Preflight sees review status
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(makeIssue());
    // But inside the transaction, the run is now committed (concurrent commit happened)
    mockPrisma._tx.reconciliationRun.findUnique.mockResolvedValue({ status: 'committed' });

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/committed/i);
    // Transaction was entered but rolled back
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // No issue update should have happened
    expect(mockPrisma._tx.reconciliationIssue.update).not.toHaveBeenCalled();
  });

  it('rejects if run became cancelled between preflight and transaction', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(makeIssue());
    mockPrisma._tx.reconciliationRun.findUnique.mockResolvedValue({ status: 'cancelled' });

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cancelled/i);
  });
});

// ---------------------------------------------------------------------------
// bulkResolveIssues
// ---------------------------------------------------------------------------

describe('bulkResolveIssues', () => {
  beforeEach(resetMocks);

  it('rejects issues from different runs', async () => {
    mockPrisma.reconciliationIssue.findMany.mockResolvedValueOnce([
      { id: 1, reconciliationRunId: 10, resolution: null },
      { id: 2, reconciliationRunId: 20, resolution: null },
    ]);

    const result = await bulkResolveIssues([1, 2], {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/different runs/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects if issues do not belong to expected run', async () => {
    mockPrisma.reconciliationIssue.findMany.mockResolvedValueOnce([
      { id: 1, reconciliationRunId: 10, resolution: null },
      { id: 2, reconciliationRunId: 10, resolution: null },
    ]);

    const result = await bulkResolveIssues([1, 2], {
      resolution: 'approved',
      resolvedById: 5,
    }, 99); // wrong run

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/do not belong/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects if run is committed (no transaction entered)', async () => {
    mockPrisma.reconciliationIssue.findMany.mockResolvedValueOnce([
      { id: 1, reconciliationRunId: 10, resolution: null },
    ]);
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue({ status: 'committed' });

    const result = await bulkResolveIssues([1], {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/committed/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('audits each resolution inside transaction', async () => {
    mockPrisma.reconciliationIssue.findMany.mockResolvedValueOnce([
      { id: 1, reconciliationRunId: 10, resolution: null },
      { id: 2, reconciliationRunId: 10, resolution: 'deferred' },
    ]);
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue({ status: 'review' });

    const tx = mockPrisma._tx;
    tx.reconciliationIssue.updateMany.mockResolvedValue({ count: 2 });
    tx.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'approved' },
      { resolution: 'approved' },
    ]);
    tx.reconciliationRun.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});

    await bulkResolveIssues([1, 2], {
      resolution: 'approved',
      resolvedById: 5,
    });

    // All writes happen in a single transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // One audit entry per issue, inside the transaction
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('rejects if run became committed between preflight and transaction (race guard)', async () => {
    mockPrisma.reconciliationIssue.findMany.mockResolvedValueOnce([
      { id: 1, reconciliationRunId: 10, resolution: null },
    ]);
    // Preflight sees review status
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue({ status: 'review' });
    // Inside tx, run is now committed
    mockPrisma._tx.reconciliationRun.findUnique.mockResolvedValue({ status: 'committed' });

    const result = await bulkResolveIssues([1], {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/committed/i);
    // Transaction was entered but rolled back — no issue updates
    expect(mockPrisma._tx.reconciliationIssue.updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// reopenRun
// ---------------------------------------------------------------------------

describe('reopenRun', () => {
  beforeEach(resetMocks);

  it('clears all resolutions and sets run back to review', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue({
      id: 10,
      status: 'reviewed',
    });

    const result = await reopenRun(10, 5);

    expect(result.success).toBe(true);

    // All writes happen inside the transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // Resolutions cleared (via tx)
    expect(mockPrisma._tx.reconciliationIssue.updateMany).toHaveBeenCalledWith({
      where: { reconciliationRunId: 10 },
      data: expect.objectContaining({
        resolution: null,
        resolutionNote: null,
        resolvedById: null,
        resolvedAt: null,
        committedRecordId: null,
      }),
    });

    // Run status reset (via tx)
    expect(mockPrisma._tx.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'review',
          completedAt: null,
          approvedCount: 0,
          rejectedCount: 0,
        }),
      }),
    );

    // Audit logged inside transaction (via tx.auditLog.create)
    expect(mockPrisma._tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'reconciliation_runs',
        recordId: 10,
        action: 'UPDATE',
        userId: 5,
      }),
    });
  });

  it('blocks reopen on committed runs', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue({
      id: 10,
      status: 'committed',
    });

    const result = await reopenRun(10, 5);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/committed/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks reopen on cancelled runs', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue({
      id: 10,
      status: 'cancelled',
    });

    const result = await reopenRun(10, 5);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cancelled/i);
  });

  it('allows reopen on runs in review status', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue({
      id: 10,
      status: 'review',
    });

    const result = await reopenRun(10, 5);
    expect(result.success).toBe(true);
  });

  it('blocks reopen on staged runs', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue({
      id: 10,
      status: 'staged',
    });

    const result = await reopenRun(10, 5);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/staged/i);
  });

  it('returns error if run not found', async () => {
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue(null);

    const result = await reopenRun(999, 5);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// getRunProgress
// ---------------------------------------------------------------------------

describe('getRunProgress', () => {
  beforeEach(resetMocks);

  it('computes correct breakdown', async () => {
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'approved' },
      { resolution: 'approved' },
      { resolution: 'rejected' },
      { resolution: null },
    ]);

    const progress = await getRunProgress(10);

    expect(progress.totalIssues).toBe(4);
    expect(progress.resolvedCount).toBe(3);
    expect(progress.pendingCount).toBe(1);
    expect(progress.allResolved).toBe(false);
    expect(progress.breakdown).toEqual({ approved: 2, rejected: 1 });
  });

  it('allResolved is true when all issues resolved', async () => {
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'dismissed' },
      { resolution: 'approved' },
    ]);

    const progress = await getRunProgress(10);
    expect(progress.allResolved).toBe(true);
  });

  it('allResolved is false for empty issue set', async () => {
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([]);

    const progress = await getRunProgress(10);
    expect(progress.allResolved).toBe(false);
    expect(progress.totalIssues).toBe(0);
  });
});
