import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma + Audit
// ---------------------------------------------------------------------------
const { mockPrisma, mockAudit } = vi.hoisted(() => {
  const txMethods = {
    reconciliationIssue: {
      updateMany: vi.fn(),
    },
    reconciliationRun: {
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
    mockAudit: {
      logUpdate: vi.fn(),
      logCreate: vi.fn(),
    },
  };
});

vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/audit/audit.service', () => ({ auditService: mockAudit }));

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
}

// ---------------------------------------------------------------------------
// resolveIssue
// ---------------------------------------------------------------------------

describe('resolveIssue', () => {
  beforeEach(resetMocks);

  it('resolves an issue and returns progress', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(makeIssue());
    mockPrisma.reconciliationIssue.update.mockResolvedValue({
      id: 1,
      resolution: 'approved',
      resolvedAt: new Date(),
    });
    // getRunProgress needs findMany
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'approved' },
    ]);
    mockPrisma.reconciliationRun.update.mockResolvedValue({});

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(true);
    expect(result.issue?.resolution).toBe('approved');
    expect(result.runProgress?.allResolved).toBe(true);
  });

  it('audits the resolution change', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(makeIssue());
    mockPrisma.reconciliationIssue.update.mockResolvedValue({
      id: 1,
      resolution: 'rejected',
      resolvedAt: new Date(),
    });
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'rejected' },
    ]);
    mockPrisma.reconciliationRun.update.mockResolvedValue({});

    await resolveIssue(1, { resolution: 'rejected', resolvedById: 5 });

    expect(mockAudit.logUpdate).toHaveBeenCalledWith(
      'reconciliation_issues',
      1,
      expect.objectContaining({ resolution: null }),
      expect.objectContaining({ resolution: 'rejected' }),
      5,
    );
  });

  it('rejects resolution on a committed run', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(
      makeIssue({ reconciliationRun: { id: 10, status: 'committed' } }),
    );

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/committed/i);
  });

  it('rejects resolution on a cancelled run', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(
      makeIssue({ reconciliationRun: { id: 10, status: 'cancelled' } }),
    );

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cancelled/i);
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
    mockPrisma.reconciliationIssue.update.mockResolvedValue({
      id: 1,
      resolution: 'approved',
      resolvedAt: new Date(),
    });
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'approved' },
    ]);
    mockPrisma.reconciliationRun.update.mockResolvedValue({});

    const result = await resolveIssue(1, {
      resolution: 'approved',
      resolvedById: 5,
    }, 10); // matches

    expect(result.success).toBe(true);
  });

  // --- Status transitions ---

  it('sets run to reviewed when last issue is resolved', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(makeIssue());
    mockPrisma.reconciliationIssue.update.mockResolvedValue({
      id: 1,
      resolution: 'dismissed',
      resolvedAt: new Date(),
    });
    // All resolved
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'dismissed' },
    ]);
    mockPrisma.reconciliationRun.update.mockResolvedValue({});

    await resolveIssue(1, { resolution: 'dismissed', resolvedById: 5 });

    expect(mockPrisma.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'reviewed' }),
      }),
    );
  });

  it('reverts run from reviewed to review when resolution is changed', async () => {
    mockPrisma.reconciliationIssue.findUnique.mockResolvedValue(
      makeIssue({
        resolution: 'approved',
        reconciliationRun: { id: 10, status: 'reviewed' },
      }),
    );
    mockPrisma.reconciliationIssue.update.mockResolvedValue({
      id: 1,
      resolution: 'rejected',
      resolvedAt: new Date(),
    });
    // Still all resolved, but run was "reviewed" before
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      { resolution: 'rejected' },
      { resolution: null }, // another pending issue
    ]);

    await resolveIssue(1, { resolution: 'rejected', resolvedById: 5 });

    // Run should revert to 'review' since not all resolved anymore
    expect(mockPrisma.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'review', completedAt: null }),
      }),
    );
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
  });

  it('rejects if run is committed', async () => {
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
  });

  it('audits each resolution individually', async () => {
    mockPrisma.reconciliationIssue.findMany
      .mockResolvedValueOnce([
        { id: 1, reconciliationRunId: 10, resolution: null },
        { id: 2, reconciliationRunId: 10, resolution: 'deferred' },
      ])
      .mockResolvedValueOnce([
        { resolution: 'approved' },
        { resolution: 'approved' },
      ]);
    mockPrisma.reconciliationRun.findUnique.mockResolvedValue({ status: 'review' });
    mockPrisma.reconciliationIssue.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.reconciliationRun.update.mockResolvedValue({});

    await bulkResolveIssues([1, 2], {
      resolution: 'approved',
      resolvedById: 5,
    });

    expect(mockAudit.logUpdate).toHaveBeenCalledTimes(2);
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
