/**
 * Tests for audit log semantics — verifying that the diff computation
 * produces correct results for the soft-delete (cancel) pattern.
 */
import { describe, it, expect } from "vitest";
import { computeFieldDiff, computeInsertSnapshot } from "@/lib/audit/diff";

describe("Audit log semantics for soft delete", () => {
  it("soft delete (cancel) produces correct diff from active to cancelled", () => {
    const oldRecord = { status: "active" };
    const newRecord = { status: "cancelled" };
    const diff = computeFieldDiff(oldRecord, newRecord);

    expect(diff).toEqual({
      status: { old: "active", new: "cancelled" },
    });
  });

  it("soft delete from expired produces correct diff", () => {
    const oldRecord = { status: "expired" };
    const newRecord = { status: "cancelled" };
    const diff = computeFieldDiff(oldRecord, newRecord);

    expect(diff).toEqual({
      status: { old: "expired", new: "cancelled" },
    });
  });

  it("soft delete from draft produces correct diff", () => {
    const oldRecord = { status: "draft" };
    const newRecord = { status: "cancelled" };
    const diff = computeFieldDiff(oldRecord, newRecord);

    expect(diff).toEqual({
      status: { old: "draft", new: "cancelled" },
    });
  });

  it("no-change produces empty diff (logUpdate would skip)", () => {
    const oldRecord = { status: "active", rebatePrice: "1.50" };
    const newRecord = { status: "active", rebatePrice: "1.50" };
    const diff = computeFieldDiff(oldRecord, newRecord);

    expect(diff).toEqual({});
  });

  it("price change diff captures old and new values", () => {
    const oldRecord = { rebatePrice: "1.50", status: "active" };
    const newRecord = { rebatePrice: "2.00", status: "active" };
    const diff = computeFieldDiff(oldRecord, newRecord);

    expect(diff).toEqual({
      rebatePrice: { old: "1.50", new: "2.00" },
    });
  });
});

describe("Audit insert snapshot", () => {
  it("captures all fields for a new record", () => {
    const record = {
      rebatePlanId: 1,
      itemId: 5,
      rebatePrice: "1.50",
      startDate: "2025-01-01",
      endDate: null,
      status: "active",
    };
    const snapshot = computeInsertSnapshot(record);

    expect(snapshot).toEqual({
      rebatePlanId: { old: null, new: 1 },
      itemId: { old: null, new: 5 },
      rebatePrice: { old: null, new: "1.50" },
      startDate: { old: null, new: "2025-01-01" },
      endDate: { old: null, new: null },
      status: { old: null, new: "active" },
    });
  });
});
