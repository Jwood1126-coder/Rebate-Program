import { describe, it, expect } from "vitest";
import { computeFieldDiff, computeInsertSnapshot } from "../diff";

describe("computeFieldDiff", () => {
  it("detects changed fields", () => {
    const old = { rebatePrice: "0.30", status: "active" };
    const now = { rebatePrice: "0.45", status: "active" };
    const diff = computeFieldDiff(old, now);

    expect(diff).toHaveProperty("rebatePrice");
    expect(diff.rebatePrice.old).toBe("0.30");
    expect(diff.rebatePrice.new).toBe("0.45");
    expect(diff).not.toHaveProperty("status");
  });

  it("returns empty object when nothing changed", () => {
    const record = { rebatePrice: "0.30", status: "active" };
    const diff = computeFieldDiff(record, record);
    expect(Object.keys(diff)).toHaveLength(0);
  });

  it("excludes metadata fields (updatedAt, updatedById)", () => {
    const old = { name: "A", updatedAt: "2025-01-01", updatedById: 1 };
    const now = { name: "B", updatedAt: "2025-06-15", updatedById: 2 };
    const diff = computeFieldDiff(old, now);

    expect(diff).toHaveProperty("name");
    expect(diff).not.toHaveProperty("updatedAt");
    expect(diff).not.toHaveProperty("updatedById");
  });

  it("handles null values", () => {
    const old = { endDate: null };
    const now = { endDate: "2025-12-31" };
    const diff = computeFieldDiff(old, now);

    expect(diff.endDate.old).toBeNull();
    expect(diff.endDate.new).toBe("2025-12-31");
  });

  it("normalizes Date objects to ISO strings", () => {
    const old = { startDate: new Date("2025-01-01") };
    const now = { startDate: new Date("2025-06-15") };
    const diff = computeFieldDiff(old, now);

    expect(typeof diff.startDate.old).toBe("string");
    expect(typeof diff.startDate.new).toBe("string");
  });

  it("handles new fields appearing", () => {
    const old = { a: "1" };
    const now = { a: "1", b: "2" };
    const diff = computeFieldDiff(old, now);

    expect(diff).toHaveProperty("b");
    expect(diff.b.old).toBeNull();
    expect(diff.b.new).toBe("2");
  });
});

describe("computeInsertSnapshot", () => {
  it("creates snapshot with old: null for all fields", () => {
    const record = { rebatePrice: "0.30", status: "active", startDate: "2025-01-01" };
    const snapshot = computeInsertSnapshot(record);

    expect(Object.keys(snapshot)).toHaveLength(3);
    for (const [, value] of Object.entries(snapshot)) {
      expect(value.old).toBeNull();
    }
  });

  it("excludes metadata fields", () => {
    const record = { name: "Test", updatedAt: "2025-01-01" };
    const snapshot = computeInsertSnapshot(record);

    expect(snapshot).toHaveProperty("name");
    expect(snapshot).not.toHaveProperty("updatedAt");
  });

  it("normalizes Date values", () => {
    const record = { startDate: new Date("2025-01-01") };
    const snapshot = computeInsertSnapshot(record);

    expect(typeof snapshot.startDate.new).toBe("string");
  });
});
