import { describe, it, expect, vi, beforeEach } from "vitest";
import { DIFF_TYPES, MATCH_STATUSES } from "@/lib/constants/statuses";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => {
  const txMethods = {
    contractUpdateRun: {
      create: vi.fn(),
    },
    contractUpdateDiff: {
      createMany: vi.fn(),
    },
  };

  return {
    mockPrisma: {
      contract: {
        findUnique: vi.fn(),
      },
      rebateRecord: {
        findMany: vi.fn(),
      },
      item: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: typeof txMethods) => Promise<unknown>) => {
        return fn(txMethods);
      }),
      _tx: txMethods,
    },
  };
});

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

// Mock xlsx
vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: { sheet_to_json: vi.fn() },
}));

import { stageContractUpdate, type ContractUpdateInput } from "../contract-update.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockContract(plans: { id: number; planCode: string }[]) {
  mockPrisma.contract.findUnique.mockResolvedValue({
    id: 1,
    contractNumber: "100001",
    rebatePlans: plans,
  });
}

function mockExistingRecords(
  records: {
    id: number;
    rebatePlanId: number;
    itemId: number;
    itemNumber: string;
    rebatePrice: number;
    planCode: string;
    status?: string;
    supersededById?: number | null;
  }[]
) {
  mockPrisma.rebateRecord.findMany.mockResolvedValue(
    records.map((r) => ({
      id: r.id,
      rebatePlanId: r.rebatePlanId,
      itemId: r.itemId,
      rebatePrice: { toNumber: () => r.rebatePrice, toString: () => String(r.rebatePrice) },
      status: r.status || "active",
      supersededById: r.supersededById ?? null,
      item: { itemNumber: r.itemNumber },
      rebatePlan: { planCode: r.planCode },
    }))
  );
}

function mockItems(items: { id: number; itemNumber: string }[]) {
  mockPrisma.item.findMany.mockResolvedValue(items);
}

async function mockXlsx(rows: Record<string, unknown>[]) {
  const XLSX = await import("xlsx");
  vi.mocked(XLSX.read).mockReturnValue({
    SheetNames: ["Sheet1"],
    Sheets: { Sheet1: {} },
  } as ReturnType<typeof XLSX.read>);
  vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(rows);
}

const baseInput: ContractUpdateInput = {
  contractId: 1,
  fileMode: "delta",
};

function resetAll() {
  vi.clearAllMocks();
  mockPrisma._tx.contractUpdateRun.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 1,
      ...data,
    })
  );
  mockPrisma._tx.contractUpdateDiff.createMany.mockResolvedValue({ count: 0 });
}

beforeEach(resetAll);

// ===========================================================================
// 1. Basic diff detection
// ===========================================================================

describe("basic diff detection", () => {
  it("detects a price change on an existing item", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "7.50" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    expect(result.success).toBe(true);
    expect(result.changedCount).toBe(1);
    expect(result.unchangedCount).toBe(0);
    expect(result.addedCount).toBe(0);

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    expect(diffData).toHaveLength(1);
    expect(diffData[0].diffType).toBe(DIFF_TYPES.CHANGED);
    expect(Number(diffData[0].oldPrice)).toBe(5.0);
    expect(Number(diffData[0].newPrice)).toBe(7.5);
    expect(diffData[0].matchedRecordId).toBe(100);
  });

  it("detects an unchanged item (no diff stored)", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    expect(result.success).toBe(true);
    expect(result.unchangedCount).toBe(1);
    expect(result.changedCount).toBe(0);
    // No diffs created — createMany should not be called (or called with empty array)
    if (mockPrisma._tx.contractUpdateDiff.createMany.mock.calls.length > 0) {
      expect(mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data).toHaveLength(0);
    }
  });

  it("detects a new item (added)", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]); // NEW-PART not in items table
    await mockXlsx([
      { "Part Number": "PART-1", Price: "5.00" },
      { "Part Number": "NEW-PART", Price: "12.00" },
    ]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    expect(result.success).toBe(true);
    expect(result.addedCount).toBe(1);
    expect(result.unchangedCount).toBe(1);

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    expect(diffData).toHaveLength(1);
    expect(diffData[0].diffType).toBe(DIFF_TYPES.ADDED);
    expect(diffData[0].itemNumber).toBe("NEW-PART");
    expect(diffData[0].itemId).toBeNull(); // unknown item
  });

  it("detects mixed changes, additions, and unchanged in one file", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
      { id: 101, rebatePlanId: 10, itemId: 2, itemNumber: "PART-2", rebatePrice: 10.0, planCode: "OSW" },
    ]);
    mockItems([
      { id: 1, itemNumber: "PART-1" },
      { id: 2, itemNumber: "PART-2" },
    ]);
    await mockXlsx([
      { "Part Number": "PART-1", Price: "5.00" },   // unchanged
      { "Part Number": "PART-2", Price: "15.00" },  // changed
      { "Part Number": "PART-3", Price: "20.00" },  // added
    ]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    expect(result.unchangedCount).toBe(1);
    expect(result.changedCount).toBe(1);
    expect(result.addedCount).toBe(1);
    expect(result.totalRows).toBe(3);
  });
});

// ===========================================================================
// 2. Snapshot vs delta mode
// ===========================================================================

describe("snapshot vs delta mode", () => {
  it("snapshot mode detects removed items", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
      { id: 101, rebatePlanId: 10, itemId: 2, itemNumber: "PART-2", rebatePrice: 10.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }, { id: 2, itemNumber: "PART-2" }]);
    // File only has PART-1 — PART-2 is "removed"
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    const result = await stageContractUpdate(
      Buffer.from("fake"),
      "test.xlsx",
      { ...baseInput, fileMode: "snapshot" },
      1
    );

    expect(result.success).toBe(true);
    expect(result.removedCount).toBe(1);
    expect(result.unchangedCount).toBe(1);

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    const removedDiff = diffData.find((d: Record<string, unknown>) => d.diffType === DIFF_TYPES.REMOVED);
    expect(removedDiff).toBeDefined();
    expect(removedDiff.itemNumber).toBe("PART-2");
    expect(removedDiff.matchedRecordId).toBe(101);
  });

  it("delta mode does NOT detect removed items", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
      { id: 101, rebatePlanId: 10, itemId: 2, itemNumber: "PART-2", rebatePrice: 10.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }, { id: 2, itemNumber: "PART-2" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    const result = await stageContractUpdate(
      Buffer.from("fake"),
      "test.xlsx",
      { ...baseInput, fileMode: "delta" },
      1
    );

    expect(result.removedCount).toBe(0);
    expect(result.unchangedCount).toBe(1);
  });
});

// ===========================================================================
// 3. Multi-plan matching
// ===========================================================================

describe("multi-plan matching", () => {
  it("single-plan contract matches automatically", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "7.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    expect(diffData[0].matchStatus).toBe(MATCH_STATUSES.AUTO);
    expect(diffData[0].rebatePlanId).toBe(10);
  });

  it("multi-plan: item in one plan matches automatically", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    mockExistingRecords([
      // PART-1 only in OSW plan
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "7.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    expect(diffData[0].matchStatus).toBe(MATCH_STATUSES.AUTO);
  });

  it("multi-plan: item in multiple plans without hint is ambiguous", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
      { id: 101, rebatePlanId: 11, itemId: 1, itemNumber: "PART-1", rebatePrice: 8.0, planCode: "SEAL" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "7.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    expect(diffData[0].matchStatus).toBe(MATCH_STATUSES.AMBIGUOUS);
    expect(diffData[0].ambiguityReason).toContain("multiple plans");
  });

  it("multi-plan: planCode hint resolves ambiguity", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
      { id: 101, rebatePlanId: 11, itemId: 1, itemNumber: "PART-1", rebatePrice: 8.0, planCode: "SEAL" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "7.00" }]);

    const result = await stageContractUpdate(
      Buffer.from("fake"),
      "test.xlsx",
      { ...baseInput, planCode: "SEAL" },
      1
    );

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    expect(diffData[0].matchStatus).toBe(MATCH_STATUSES.AUTO);
    expect(diffData[0].rebatePlanId).toBe(11);
  });

  it("multi-plan: new item without plan hint is ambiguous", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    mockExistingRecords([]);
    mockItems([]);
    await mockXlsx([{ "Part Number": "NEW-PART", Price: "12.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    expect(diffData[0].diffType).toBe(DIFF_TYPES.ADDED);
    expect(diffData[0].matchStatus).toBe(MATCH_STATUSES.AMBIGUOUS);
    expect(diffData[0].ambiguityReason).toContain("plan assignment required");
  });
});

// ===========================================================================
// 4. Error handling
// ===========================================================================

describe("error handling", () => {
  it("fails when contract not found", async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(null);
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Contract not found.");
  });

  it("fails when contract has no active plans", async () => {
    mockPrisma.contract.findUnique.mockResolvedValue({
      id: 1,
      contractNumber: "100001",
      rebatePlans: [],
    });
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Contract has no active rebate plans.");
  });

  it("warns when no differences found", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes("No differences found"))).toBe(true);
  });
});

// ===========================================================================
// 5. Persistence
// ===========================================================================

describe("persistence", () => {
  it("creates run and diffs in a single transaction", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "7.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    expect(result.success).toBe(true);
    expect(result.runId).toBe(1);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.contractUpdateRun.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.contractUpdateDiff.createMany).toHaveBeenCalledTimes(1);

    // Verify run data
    const runData = mockPrisma._tx.contractUpdateRun.create.mock.calls[0][0].data;
    expect(runData.contractId).toBe(1);
    expect(runData.fileMode).toBe("delta");
    expect(runData.status).toBe("staged");
    expect(runData.changedCount).toBe(1);
  });

  it("does not call createMany when there are no diffs", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    // createMany should not be called when there are zero diffs
    expect(mockPrisma._tx.contractUpdateDiff.createMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 6. Ambiguous match correctness (regression)
// ===========================================================================

describe("ambiguous match correctness", () => {
  it("ambiguous same-price match still produces a reviewable diff (not collapsed to unchanged)", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    // PART-1 exists in both plans at the SAME price as the file row
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
      { id: 101, rebatePlanId: 11, itemId: 1, itemNumber: "PART-1", rebatePrice: 8.0, planCode: "SEAL" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    // File price matches records[0] (OSW @ 5.00) — previously this collapsed to unchanged
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    expect(result.success).toBe(true);
    // Must NOT be counted as unchanged — must produce a reviewable diff
    expect(result.unchangedCount).toBe(0);
    expect(result.changedCount).toBe(1);

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    expect(diffData).toHaveLength(1);
    expect(diffData[0].matchStatus).toBe(MATCH_STATUSES.AMBIGUOUS);
    expect(diffData[0].ambiguityReason).toContain("multiple plans");
  });

  it("snapshot mode with ambiguous match does not create false removals for other candidates", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    // PART-1 exists in BOTH plans
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
      { id: 101, rebatePlanId: 11, itemId: 1, itemNumber: "PART-1", rebatePrice: 8.0, planCode: "SEAL" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "7.00" }]);

    const result = await stageContractUpdate(
      Buffer.from("fake"),
      "test.xlsx",
      { ...baseInput, fileMode: "snapshot" },
      1
    );

    expect(result.success).toBe(true);
    // Should have exactly 1 ambiguous changed diff, and 0 removed diffs
    expect(result.changedCount).toBe(1);
    expect(result.removedCount).toBe(0);

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    const removedDiffs = diffData.filter((d: Record<string, unknown>) => d.diffType === DIFF_TYPES.REMOVED);
    expect(removedDiffs).toHaveLength(0);
  });

  it("snapshot mode with ambiguous same-price match does not create false removals", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
      { id: 101, rebatePlanId: 11, itemId: 1, itemNumber: "PART-1", rebatePrice: 8.0, planCode: "SEAL" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    // Price matches records[0] — the worst case for the old bug
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    const result = await stageContractUpdate(
      Buffer.from("fake"),
      "test.xlsx",
      { ...baseInput, fileMode: "snapshot" },
      1
    );

    // Ambiguous diff must be stored (not collapsed)
    expect(result.changedCount).toBe(1);
    expect(result.unchangedCount).toBe(0);
    // Neither candidate should be falsely removed
    expect(result.removedCount).toBe(0);
  });
});

// ===========================================================================
// 7. Comparison set correctness
// ===========================================================================

describe("comparison set correctness", () => {
  it("loads only active plans (not expired)", async () => {
    // Contract has 2 plans, but one is expired — mock returns only active
    mockPrisma.contract.findUnique.mockResolvedValue({
      id: 1,
      contractNumber: "100001",
      // The Prisma where: { status: "active" } should filter this
      rebatePlans: [{ id: 10, planCode: "OSW" }],
    });
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "7.00" }]);

    const result = await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    expect(result.success).toBe(true);
    expect(result.changedCount).toBe(1);
    // rebateRecord.findMany should only be called with the active plan's ID
    const recordQuery = mockPrisma.rebateRecord.findMany.mock.calls[0][0];
    expect(recordQuery.where.rebatePlanId).toEqual({ in: [10] });
  });

  it("record loading query excludes expired, draft, cancelled, and superseded records", async () => {
    mockContract([{ id: 10, planCode: "OSW" }]);
    mockExistingRecords([]); // doesn't matter for this assertion
    mockItems([]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    await stageContractUpdate(Buffer.from("fake"), "test.xlsx", baseInput, 1);

    const recordQuery = mockPrisma.rebateRecord.findMany.mock.calls[0][0];
    // supersededById must be null
    expect(recordQuery.where.supersededById).toBeNull();
    // draft and cancelled excluded
    expect(recordQuery.where.status).toEqual({ notIn: ["draft", "cancelled"] });
    // endDate filter: null OR >= today
    expect(recordQuery.where.OR).toBeDefined();
    expect(recordQuery.where.OR).toHaveLength(2);
    expect(recordQuery.where.OR[0]).toEqual({ endDate: null });
    expect(recordQuery.where.OR[1].endDate).toBeDefined();
    expect(recordQuery.where.OR[1].endDate.gte).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// 8. Plan hint correctness (regression)
// ===========================================================================

describe("plan hint correctness", () => {
  it("plan hint miss: item in a different plan is treated as added to hinted plan", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    // PART-1 exists in OSW only — not in the hinted plan SEAL
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    const result = await stageContractUpdate(
      Buffer.from("fake"),
      "test.xlsx",
      { ...baseInput, planCode: "SEAL" },
      1
    );

    expect(result.success).toBe(true);
    // Item should be treated as ADDED to SEAL — not silently matched to OSW
    expect(result.addedCount).toBe(1);
    expect(result.changedCount).toBe(0);
    expect(result.unchangedCount).toBe(0);

    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    expect(diffData).toHaveLength(1);
    expect(diffData[0].diffType).toBe(DIFF_TYPES.ADDED);
    expect(diffData[0].rebatePlanId).toBe(11); // SEAL, not OSW
    expect(diffData[0].matchStatus).toBe(MATCH_STATUSES.AUTO);
  });

  it("plan hint miss with same price must not collapse to unchanged", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    // PART-1 exists in OSW at exactly the file price
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "5.00" }]);

    const result = await stageContractUpdate(
      Buffer.from("fake"),
      "test.xlsx",
      { ...baseInput, planCode: "SEAL" },
      1
    );

    // Must NOT be unchanged — must be an addition to SEAL
    expect(result.unchangedCount).toBe(0);
    expect(result.addedCount).toBe(1);
  });

  it("plan hint match: item in hinted plan matches normally", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    // PART-1 exists in both plans
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
      { id: 101, rebatePlanId: 11, itemId: 1, itemNumber: "PART-1", rebatePrice: 8.0, planCode: "SEAL" },
    ]);
    mockItems([{ id: 1, itemNumber: "PART-1" }]);
    await mockXlsx([{ "Part Number": "PART-1", Price: "9.00" }]);

    const result = await stageContractUpdate(
      Buffer.from("fake"),
      "test.xlsx",
      { ...baseInput, planCode: "SEAL" },
      1
    );

    expect(result.changedCount).toBe(1);
    const diffData = mockPrisma._tx.contractUpdateDiff.createMany.mock.calls[0][0].data;
    // Should match SEAL record (id 101), not OSW
    expect(diffData[0].matchedRecordId).toBe(101);
    expect(diffData[0].rebatePlanId).toBe(11);
    expect(Number(diffData[0].oldPrice)).toBe(8.0);
    expect(diffData[0].matchStatus).toBe(MATCH_STATUSES.AUTO);
  });

  it("snapshot mode with plan hint: records in other plans are not flagged as removed", async () => {
    mockContract([
      { id: 10, planCode: "OSW" },
      { id: 11, planCode: "SEAL" },
    ]);
    // PART-1 in OSW, PART-2 in SEAL
    mockExistingRecords([
      { id: 100, rebatePlanId: 10, itemId: 1, itemNumber: "PART-1", rebatePrice: 5.0, planCode: "OSW" },
      { id: 101, rebatePlanId: 11, itemId: 2, itemNumber: "PART-2", rebatePrice: 8.0, planCode: "SEAL" },
    ]);
    mockItems([{ id: 2, itemNumber: "PART-2" }]);
    // File only has PART-2 — updating SEAL
    await mockXlsx([{ "Part Number": "PART-2", Price: "8.00" }]);

    const result = await stageContractUpdate(
      Buffer.from("fake"),
      "test.xlsx",
      { ...baseInput, fileMode: "snapshot", planCode: "SEAL" },
      1
    );

    // PART-2 unchanged in SEAL — good
    expect(result.unchangedCount).toBe(1);
    // PART-1 in OSW must NOT be flagged as removed — it belongs to a different plan
    // Snapshot scope is limited to the hinted plan (SEAL)
    expect(result.removedCount).toBe(0);
  });
});
