import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      rebateRecord: { findMany: vi.fn() },
      auditLog: { findMany: vi.fn() },
      contractUpdateRun: { findMany: vi.fn() },
      reconciliationRun: { findMany: vi.fn() },
      claimRow: { findMany: vi.fn() },
      reconciliationIssue: { findMany: vi.fn() },
    },
  };
});

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

import { getContractActivity, getContractDisputes } from "../contract-activity.service";

beforeEach(() => vi.clearAllMocks());

// ===========================================================================
// getContractActivity
// ===========================================================================

describe("getContractActivity", () => {
  it("returns empty array when contract has no plans and no audit entries", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.contractUpdateRun.findMany.mockResolvedValue([]);

    const events = await getContractActivity(1, 1, [], 50);
    expect(events).toEqual([]);
  });

  it("includes contract audit entries as contract_update events", async () => {
    mockPrisma.auditLog.findMany
      .mockResolvedValueOnce([{
        createdAt: new Date("2026-03-15T10:00:00Z"),
        action: "UPDATE",
        changedFields: { status: { old: "active", new: "expired" } },
        user: { displayName: "Admin" },
      }])
      .mockResolvedValueOnce([]); // record audit
    mockPrisma.contractUpdateRun.findMany.mockResolvedValue([]);
    mockPrisma.rebateRecord.findMany.mockResolvedValue([]);
    mockPrisma.reconciliationRun.findMany.mockResolvedValue([]);

    const events = await getContractActivity(1, 1, [10], 50);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("contract_update");
    expect(events[0].user).toBe("Admin");
    expect(events[0].summary).toContain("update: status");
  });

  it("uses committedBy for committed update runs when available", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.contractUpdateRun.findMany.mockResolvedValue([{
      id: 1,
      status: "committed",
      commitSummary: { recordsCreated: 2, recordsSuperseded: 1, skipped: 0 },
      committedAt: new Date("2026-03-15T12:00:00Z"),
      createdAt: new Date("2026-03-15T10:00:00Z"),
      fileMode: "delta",
      fileName: "test.xlsx",
      changedCount: 2,
      addedCount: 1,
      removedCount: 0,
      runBy: { displayName: "Uploader" },
      committedBy: { displayName: "Reviewer" },
    }]);
    mockPrisma.rebateRecord.findMany.mockResolvedValue([]);
    mockPrisma.reconciliationRun.findMany.mockResolvedValue([]);

    const events = await getContractActivity(1, 1, [10], 50);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("contract_update_committed");
    expect(events[0].user).toBe("Reviewer"); // NOT Uploader
    expect(events[0].detail?.uploadedBy).toBe("Uploader");
    expect(events[0].detail?.committedBy).toBe("Reviewer");
  });

  it("falls back to runBy when committedBy is null", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.contractUpdateRun.findMany.mockResolvedValue([{
      id: 1,
      status: "committed",
      commitSummary: { recordsCreated: 1, recordsSuperseded: 0, skipped: 0 },
      committedAt: new Date("2026-03-15T12:00:00Z"),
      createdAt: new Date("2026-03-15T10:00:00Z"),
      fileMode: "delta",
      fileName: "test.xlsx",
      changedCount: 1,
      addedCount: 0,
      removedCount: 0,
      runBy: { displayName: "SameUser" },
      committedBy: null,
    }]);
    mockPrisma.rebateRecord.findMany.mockResolvedValue([]);
    mockPrisma.reconciliationRun.findMany.mockResolvedValue([]);

    const events = await getContractActivity(1, 1, [10], 50);
    expect(events[0].user).toBe("SameUser");
  });

  it("sorts events by timestamp descending and respects limit", async () => {
    mockPrisma.auditLog.findMany
      .mockResolvedValueOnce([
        { createdAt: new Date("2026-03-10"), action: "INSERT", changedFields: { x: {} }, user: { displayName: "A" } },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.contractUpdateRun.findMany.mockResolvedValue([{
      id: 1, status: "staged", createdAt: new Date("2026-03-15"),
      fileMode: "delta", fileName: "f.xlsx", changedCount: 1, addedCount: 0, removedCount: 0,
      runBy: { displayName: "B" }, committedBy: null,
    }]);
    mockPrisma.rebateRecord.findMany.mockResolvedValue([]);
    mockPrisma.reconciliationRun.findMany.mockResolvedValue([]);

    const events = await getContractActivity(1, 1, [10], 1);
    // Limit = 1, so only the most recent event
    expect(events).toHaveLength(1);
    expect(events[0].user).toBe("B"); // Mar 15 > Mar 10
  });
});

// ===========================================================================
// getContractDisputes
// ===========================================================================

describe("getContractDisputes", () => {
  it("returns empty result when no claim rows match", async () => {
    mockPrisma.claimRow.findMany.mockResolvedValue([]);

    const result = await getContractDisputes("100001", 1, 100);
    expect(result.totalIssues).toBe(0);
    expect(result.runs).toEqual([]);
  });

  it("groups issues by run and computes severity breakdown", async () => {
    mockPrisma.claimRow.findMany.mockResolvedValue([
      { id: 1, batchId: 10 },
      { id: 2, batchId: 10 },
    ]);
    mockPrisma.reconciliationRun.findMany.mockResolvedValue([{
      id: 100,
      claimPeriodStart: new Date("2026-01-01"),
      claimPeriodEnd: new Date("2026-01-31"),
      status: "committed",
      startedAt: new Date("2026-02-01"),
    }]);
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      { id: 1, reconciliationRunId: 100, claimRowId: 1, code: "CLM-001", severity: "error", category: "Price", description: "Mismatch", resolution: "approved" },
      { id: 2, reconciliationRunId: 100, claimRowId: 2, code: "CLM-003", severity: "warning", category: "Item", description: "Missing", resolution: null },
    ]);

    const result = await getContractDisputes("100001", 1, 100);
    expect(result.totalIssues).toBe(2);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].runId).toBe(100);
    expect(result.runs[0].issues).toHaveLength(2);
    expect(result.bySeverity.error).toBe(1);
    expect(result.bySeverity.warning).toBe(1);
    expect(result.byCode["CLM-001"]).toBe(1);
  });

  it("excludes runs with no issues for this contract", async () => {
    mockPrisma.claimRow.findMany.mockResolvedValue([{ id: 1, batchId: 10 }]);
    mockPrisma.reconciliationRun.findMany.mockResolvedValue([
      { id: 100, claimPeriodStart: new Date("2026-01-01"), claimPeriodEnd: new Date("2026-01-31"), status: "committed", startedAt: new Date("2026-02-01") },
      { id: 101, claimPeriodStart: new Date("2026-02-01"), claimPeriodEnd: new Date("2026-02-28"), status: "committed", startedAt: new Date("2026-03-01") },
    ]);
    // Only run 100 has issues for this contract's claim rows
    mockPrisma.reconciliationIssue.findMany.mockResolvedValue([
      { id: 1, reconciliationRunId: 100, claimRowId: 1, code: "CLM-001", severity: "error", category: "Price", description: "Mismatch", resolution: null },
    ]);

    const result = await getContractDisputes("100001", 1, 100);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].runId).toBe(100);
  });
});
