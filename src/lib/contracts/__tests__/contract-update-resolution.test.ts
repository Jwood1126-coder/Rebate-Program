import { describe, it, expect, vi, beforeEach } from "vitest";
import { CONTRACT_UPDATE_STATUSES, DIFF_TYPES } from "@/lib/constants/statuses";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => {
  const txMethods = {
    contractUpdateRun: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    contractUpdateDiff: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    rebateRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    item: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    contract: {
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    mockPrisma: {
      contractUpdateDiff: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      contractUpdateRun: {
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

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/audit/diff", () => ({
  computeInsertSnapshot: vi.fn((rec: Record<string, unknown>) => {
    const snap: Record<string, { old: null; new: unknown }> = {};
    for (const [k, v] of Object.entries(rec)) snap[k] = { old: null, new: v };
    return snap;
  }),
}));

vi.mock("@/lib/utils/dates", () => ({
  deriveRecordStatus: vi.fn(() => "active"),
}));

import { resolveDiff, bulkResolveDiffs, commitContractUpdate } from "../contract-update-resolution.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetAll() {
  vi.clearAllMocks();

  // Default: diff belongs to a staged run
  mockPrisma.contractUpdateDiff.findUnique.mockResolvedValue({
    id: 1,
    runId: 10,
    matchStatus: "auto",
    run: { id: 10, status: "staged" },
  });

  // Tx: run is staged
  mockPrisma._tx.contractUpdateRun.findUnique.mockResolvedValue({
    id: 10,
    status: "staged",
  });
  mockPrisma._tx.contractUpdateDiff.update.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({
      id: where.id ?? 1,
      runId: 10,
      resolution: data.resolution ?? null,
      resolvedAt: data.resolvedAt || new Date(),
      ...data,
    })
  );
  mockPrisma._tx.contractUpdateDiff.findMany.mockResolvedValue([
    { resolution: "apply" },
  ]);
  mockPrisma._tx.contractUpdateRun.update.mockResolvedValue({});
  mockPrisma._tx.auditLog.create.mockResolvedValue({});
  mockPrisma._tx.rebateRecord.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: 200, ...data })
  );
  mockPrisma._tx.rebateRecord.findUnique.mockResolvedValue({
    id: 100,
    rebatePlanId: 10,
    itemId: 1,
    rebatePrice: { toString: () => "5.0000" },
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-12-31"),
    status: "active",
  });
  mockPrisma._tx.rebateRecord.update.mockResolvedValue({});
  // Note: _tx.contractUpdateDiff.update is set as mockImplementation above
  // (returns resolution/resolvedAt from data). Do NOT override with mockResolvedValue here.
  mockPrisma._tx.item.findFirst.mockResolvedValue(null);
  mockPrisma._tx.item.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: 50, ...data })
  );
  mockPrisma._tx.contract.update.mockResolvedValue({});
}

beforeEach(resetAll);

// ===========================================================================
// 1. Single diff resolution
// ===========================================================================

describe("resolveDiff", () => {
  it("resolves a diff with apply", async () => {
    const result = await resolveDiff(1, {
      resolution: "apply",
      resolvedById: 1,
    }, 10);

    expect(result.success).toBe(true);
    expect(result.diff?.resolution).toBe("apply");
  });

  it("rejects resolution on committed run", async () => {
    mockPrisma.contractUpdateDiff.findUnique.mockResolvedValue({
      id: 1,
      runId: 10,
      run: { id: 10, status: "committed" },
    });

    const result = await resolveDiff(1, {
      resolution: "apply",
      resolvedById: 1,
    }, 10);

    expect(result.success).toBe(false);
    expect(result.error).toContain("committed");
  });

  it("rejects when diff does not belong to expected run", async () => {
    const result = await resolveDiff(1, {
      resolution: "apply",
      resolvedById: 1,
    }, 999);

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not belong");
  });

  it("transitions run to review when all diffs resolved", async () => {
    // All diffs resolved
    mockPrisma._tx.contractUpdateDiff.findMany.mockResolvedValue([
      { resolution: "apply" },
    ]);

    await resolveDiff(1, { resolution: "apply", resolvedById: 1 }, 10);

    // Run status should be updated to review
    expect(mockPrisma._tx.contractUpdateRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "review" }),
      })
    );
  });

  it("rejects plain apply on ambiguous diff without targetPlanId", async () => {
    mockPrisma.contractUpdateDiff.findUnique.mockResolvedValue({
      id: 1,
      runId: 10,
      matchStatus: "ambiguous",
      run: { id: 10, status: "staged" },
    });

    const result = await resolveDiff(1, {
      resolution: "apply",
      resolvedById: 1,
    }, 10);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Ambiguous");
    expect(result.error).toContain("targetPlanId");
  });

  it("allows apply on ambiguous diff when resolutionData has targetPlanId", async () => {
    mockPrisma.contractUpdateDiff.findUnique.mockResolvedValue({
      id: 1,
      runId: 10,
      matchStatus: "ambiguous",
      run: { id: 10, status: "staged" },
    });

    const result = await resolveDiff(1, {
      resolution: "apply",
      resolutionData: { targetPlanId: 20 },
      resolvedById: 1,
    }, 10);

    expect(result.success).toBe(true);
  });

  it("allows skip on ambiguous diff without targetPlanId", async () => {
    mockPrisma.contractUpdateDiff.findUnique.mockResolvedValue({
      id: 1,
      runId: 10,
      matchStatus: "ambiguous",
      run: { id: 10, status: "staged" },
    });

    const result = await resolveDiff(1, {
      resolution: "skip",
      resolvedById: 1,
    }, 10);

    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// 2. Bulk resolve constraints
// ===========================================================================

describe("bulkResolveDiffs constraints", () => {
  it("rejects bulk apply when batch includes ambiguous diffs", async () => {
    mockPrisma.contractUpdateDiff.findMany.mockResolvedValue([
      { id: 1, runId: 10, matchStatus: "auto", run: { id: 10, status: "staged" } },
      { id: 2, runId: 10, matchStatus: "ambiguous", run: { id: 10, status: "staged" } },
    ]);

    const result = await bulkResolveDiffs(
      [1, 2],
      { resolution: "apply", resolvedById: 1 },
      10,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("ambiguous");
  });

  it("allows bulk apply when no diffs are ambiguous", async () => {
    mockPrisma.contractUpdateDiff.findMany.mockResolvedValue([
      { id: 1, runId: 10, matchStatus: "auto", run: { id: 10, status: "staged" } },
      { id: 2, runId: 10, matchStatus: "auto", run: { id: 10, status: "staged" } },
    ]);

    mockPrisma._tx.contractUpdateRun.findUnique.mockResolvedValue({ id: 10, status: "staged" });
    mockPrisma._tx.contractUpdateDiff.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma._tx.contractUpdateDiff.findMany.mockResolvedValue([
      { resolution: "apply" },
      { resolution: "apply" },
    ]);

    const result = await bulkResolveDiffs(
      [1, 2],
      { resolution: "apply", resolvedById: 1 },
      10,
    );

    expect(result.success).toBe(true);
    expect(result.resolvedCount).toBe(2);
  });

  it("allows bulk skip even when batch includes ambiguous diffs", async () => {
    mockPrisma.contractUpdateDiff.findMany.mockResolvedValue([
      { id: 1, runId: 10, matchStatus: "ambiguous", run: { id: 10, status: "staged" } },
    ]);

    mockPrisma._tx.contractUpdateRun.findUnique.mockResolvedValue({ id: 10, status: "staged" });
    mockPrisma._tx.contractUpdateDiff.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma._tx.contractUpdateDiff.findMany.mockResolvedValue([
      { resolution: "skip" },
    ]);

    const result = await bulkResolveDiffs(
      [1],
      { resolution: "skip", resolvedById: 1 },
      10,
    );

    expect(result.success).toBe(true);
  });

  it("rejects bulk modify resolution", async () => {
    const result = await bulkResolveDiffs(
      [1, 2],
      { resolution: "modify", resolvedById: 1 },
      10,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("modify");
  });
});

// ===========================================================================
// 3. Commit
// ===========================================================================

describe("commitContractUpdate", () => {
  it("rejects commit on staged run (not all resolved)", async () => {
    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "staged",
      contractId: 1,
      diffs: [{ id: 1, resolution: null }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    const result = await commitContractUpdate(10, 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("staged");
  });

  it("commits a run with one applied changed diff (supersession)", async () => {
    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "review",
      contractId: 1,
      effectiveDate: new Date("2026-03-15"),
      diffs: [{
        id: 1,
        diffType: DIFF_TYPES.CHANGED,
        resolution: "apply",
        resolutionData: null,
        matchedRecordId: 100,
        rebatePlanId: 10,
        itemId: 1,
        itemNumber: "PART-1",
        newPrice: { toString: () => "7.5000" },
        oldPrice: { toString: () => "5.0000" },
      }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    const result = await commitContractUpdate(10, 1);

    expect(result.success).toBe(true);
    expect(result.summary!.recordsCreated).toBe(1);
    expect(result.summary!.recordsSuperseded).toBe(1);
    // Old record superseded
    expect(mockPrisma._tx.rebateRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({ status: "superseded" }),
      })
    );
    // New record created
    expect(mockPrisma._tx.rebateRecord.create).toHaveBeenCalledTimes(1);
    // Run marked committed
    expect(mockPrisma._tx.contractUpdateRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "committed" }),
      })
    );
  });

  it("commits a run with one applied added diff (new record + item)", async () => {
    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "review",
      contractId: 1,
      effectiveDate: new Date("2026-03-15"),
      diffs: [{
        id: 2,
        diffType: DIFF_TYPES.ADDED,
        resolution: "apply",
        resolutionData: null,
        matchedRecordId: null,
        rebatePlanId: 10,
        itemId: null,
        itemNumber: "NEW-PART",
        newPrice: { toString: () => "12.0000" },
        oldPrice: null,
      }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    const result = await commitContractUpdate(10, 1);

    expect(result.success).toBe(true);
    expect(result.summary!.recordsCreated).toBe(1);
    expect(result.summary!.itemsCreated).toBe(1);
    expect(mockPrisma._tx.item.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.rebateRecord.create).toHaveBeenCalledTimes(1);
  });

  it("skips diffs resolved as skip", async () => {
    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "review",
      contractId: 1,
      effectiveDate: null,
      diffs: [{
        id: 1,
        diffType: DIFF_TYPES.CHANGED,
        resolution: "skip",
        resolutionData: null,
        matchedRecordId: 100,
        rebatePlanId: 10,
        itemId: 1,
        itemNumber: "PART-1",
        newPrice: { toString: () => "7.5000" },
        oldPrice: { toString: () => "5.0000" },
      }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    const result = await commitContractUpdate(10, 1);

    expect(result.success).toBe(true);
    expect(result.summary!.skipped).toBe(1);
    expect(result.summary!.totalApplied).toBe(0);
    // No record writes
    expect(mockPrisma._tx.rebateRecord.create).not.toHaveBeenCalled();
    expect(mockPrisma._tx.rebateRecord.update).not.toHaveBeenCalled();
  });

  it("stamps committedById on the run at commit time", async () => {
    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "review",
      contractId: 1,
      effectiveDate: new Date("2026-03-15"),
      diffs: [{
        id: 1,
        diffType: DIFF_TYPES.CHANGED,
        resolution: "apply",
        resolutionData: null,
        matchedRecordId: 100,
        rebatePlanId: 10,
        itemId: 1,
        itemNumber: "PART-1",
        newPrice: { toString: () => "7.5000" },
        oldPrice: { toString: () => "5.0000" },
      }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    // Commit as user 42 (different from run creator)
    await commitContractUpdate(10, 42);

    // The run update should include committedById = 42
    const runUpdate = mockPrisma._tx.contractUpdateRun.update.mock.calls[0][0];
    expect(runUpdate.data.committedById).toBe(42);
  });

  it("auto-updates lastReviewedAt on contract after commit", async () => {
    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "review",
      contractId: 1,
      effectiveDate: new Date("2026-03-15"),
      diffs: [{
        id: 1,
        diffType: DIFF_TYPES.CHANGED,
        resolution: "apply",
        resolutionData: null,
        matchedRecordId: 100,
        rebatePlanId: 10,
        itemId: 1,
        itemNumber: "PART-1",
        newPrice: { toString: () => "7.5000" },
        oldPrice: { toString: () => "5.0000" },
      }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    await commitContractUpdate(10, 1);

    expect(mockPrisma._tx.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ lastReviewedAt: expect.any(Date) }),
      })
    );
  });

  it("rejects commit with future effective date", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "review",
      contractId: 1,
      effectiveDate: futureDate,
      diffs: [{
        id: 1,
        diffType: DIFF_TYPES.CHANGED,
        resolution: "apply",
        resolutionData: null,
        matchedRecordId: 100,
        rebatePlanId: 10,
        itemId: 1,
        itemNumber: "PART-1",
        newPrice: { toString: () => "7.5000" },
        oldPrice: { toString: () => "5.0000" },
      }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    const result = await commitContractUpdate(10, 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Future effective dates");
  });

  it("changed diff uses targetPlanId from resolutionData", async () => {
    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "review",
      contractId: 1,
      effectiveDate: new Date("2026-03-15"),
      diffs: [{
        id: 1,
        diffType: DIFF_TYPES.CHANGED,
        resolution: "apply",
        resolutionData: { targetPlanId: 20 },
        matchedRecordId: 100,
        rebatePlanId: 10,
        itemId: 1,
        itemNumber: "PART-1",
        newPrice: { toString: () => "7.5000" },
        oldPrice: { toString: () => "5.0000" },
      }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    const result = await commitContractUpdate(10, 1);
    expect(result.success).toBe(true);

    // New record should be created under plan 20, not the old record's plan 10
    const createCall = mockPrisma._tx.rebateRecord.create.mock.calls[0][0];
    expect(createCall.data.rebatePlanId).toBe(20);
  });

  it("changed diff without targetPlanId keeps old record plan", async () => {
    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "review",
      contractId: 1,
      effectiveDate: new Date("2026-03-15"),
      diffs: [{
        id: 1,
        diffType: DIFF_TYPES.CHANGED,
        resolution: "apply",
        resolutionData: null,
        matchedRecordId: 100,
        rebatePlanId: 10,
        itemId: 1,
        itemNumber: "PART-1",
        newPrice: { toString: () => "7.5000" },
        oldPrice: { toString: () => "5.0000" },
      }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    const result = await commitContractUpdate(10, 1);
    expect(result.success).toBe(true);

    // Should keep old record's plan (10)
    const createCall = mockPrisma._tx.rebateRecord.create.mock.calls[0][0];
    expect(createCall.data.rebatePlanId).toBe(10);
  });

  it("skip-only commit writes audit event", async () => {
    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "review",
      contractId: 1,
      effectiveDate: null,
      diffs: [{
        id: 1,
        diffType: DIFF_TYPES.CHANGED,
        resolution: "skip",
        resolutionData: null,
        matchedRecordId: 100,
        rebatePlanId: 10,
        itemId: 1,
        itemNumber: "PART-1",
        newPrice: { toString: () => "7.5000" },
        oldPrice: { toString: () => "5.0000" },
      }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma._tx) => Promise<unknown>) => {
      return fn(mockPrisma._tx);
    });

    const result = await commitContractUpdate(10, 1);
    expect(result.success).toBe(true);

    // Audit event must be written even for skip-only runs
    const auditCalls = mockPrisma._tx.auditLog.create.mock.calls;
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
    const commitAudit = auditCalls.find(
      (c: Array<{ data: { tableName: string } }>) => c[0].data.tableName === "contract_update_runs"
    );
    expect(commitAudit).toBeDefined();
  });

  it("skip-only commit updates lastReviewedAt on contract", async () => {
    mockPrisma.contractUpdateRun.findUnique.mockResolvedValue({
      id: 10,
      status: "review",
      contractId: 1,
      effectiveDate: null,
      diffs: [{
        id: 1,
        diffType: DIFF_TYPES.CHANGED,
        resolution: "skip",
        resolutionData: null,
        matchedRecordId: 100,
        rebatePlanId: 10,
        itemId: 1,
        itemNumber: "PART-1",
        newPrice: { toString: () => "7.5000" },
        oldPrice: { toString: () => "5.0000" },
      }],
      contract: { id: 1, contractType: "fixed_term" },
    });

    // Mock the skip-only transaction path
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma._tx) => Promise<unknown>) => {
      return fn(mockPrisma._tx);
    });

    const result = await commitContractUpdate(10, 1);

    expect(result.success).toBe(true);
    expect(result.summary!.skipped).toBe(1);
    expect(result.summary!.totalApplied).toBe(0);

    // lastReviewedAt must be updated even for skip-only runs
    expect(mockPrisma._tx.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ lastReviewedAt: expect.any(Date) }),
      })
    );
  });
});

