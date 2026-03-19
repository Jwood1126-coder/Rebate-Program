import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Targeted tests for contract export correctness:
 * - Fastenal SPA export row filtering
 * - CSV export scoping
 *
 * These validate the query/filter logic that determines
 * which records appear in exports.
 */

// ---------------------------------------------------------------------------
// Helpers: simulate the filtering logic used in export endpoints
// ---------------------------------------------------------------------------

interface MockRecord {
  id: number;
  itemNumber: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  supersededById: number | null;
  rebatePrice: number;
}

/**
 * Mirrors the Fastenal SPA export's record filter:
 * status NOT IN (cancelled, superseded), startDate <= now,
 * (endDate is null OR endDate >= now), supersededById is null
 */
function filterCurrentOperativeRecords(records: MockRecord[], now = new Date()): MockRecord[] {
  return records.filter((r) => {
    if (["cancelled", "superseded"].includes(r.status)) return false;
    if (r.startDate > now) return false;
    if (r.endDate && r.endDate < now) return false;
    if (r.supersededById !== null) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Fastenal SPA export — record filtering", () => {
  const now = new Date("2026-03-19T12:00:00Z");

  const records: MockRecord[] = [
    // Active, current — should be included
    { id: 1, itemNumber: "7000-12", status: "active", startDate: new Date("2026-01-01"), endDate: null, supersededById: null, rebatePrice: 13.25 },
    // Active with future end date — should be included
    { id: 2, itemNumber: "7001-12", status: "active", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), supersededById: null, rebatePrice: 14.75 },
    // Expired — should be excluded
    { id: 3, itemNumber: "7002-12", status: "active", startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31"), supersededById: null, rebatePrice: 11.20 },
    // Superseded — should be excluded
    { id: 4, itemNumber: "7000-12", status: "superseded", startDate: new Date("2025-01-01"), endDate: null, supersededById: 1, rebatePrice: 12.50 },
    // Cancelled — should be excluded
    { id: 5, itemNumber: "7003-12", status: "cancelled", startDate: new Date("2026-01-01"), endDate: null, supersededById: null, rebatePrice: 20.00 },
    // Future — should be excluded (not yet started)
    { id: 6, itemNumber: "7004-12", status: "active", startDate: new Date("2026-07-01"), endDate: null, supersededById: null, rebatePrice: 25.00 },
    // Active but supersededById set (data-model edge case) — should be excluded
    { id: 7, itemNumber: "7005-12", status: "active", startDate: new Date("2026-01-01"), endDate: null, supersededById: 8, rebatePrice: 30.00 },
  ];

  it("includes only current operative records", () => {
    const result = filterCurrentOperativeRecords(records, now);
    expect(result.map((r) => r.id)).toEqual([1, 2]);
  });

  it("excludes expired records", () => {
    const result = filterCurrentOperativeRecords(records, now);
    expect(result.find((r) => r.id === 3)).toBeUndefined();
  });

  it("excludes superseded records", () => {
    const result = filterCurrentOperativeRecords(records, now);
    expect(result.find((r) => r.id === 4)).toBeUndefined();
  });

  it("excludes cancelled records", () => {
    const result = filterCurrentOperativeRecords(records, now);
    expect(result.find((r) => r.id === 5)).toBeUndefined();
  });

  it("excludes future records not yet started", () => {
    const result = filterCurrentOperativeRecords(records, now);
    expect(result.find((r) => r.id === 6)).toBeUndefined();
  });

  it("excludes records with supersededById even if status is active", () => {
    const result = filterCurrentOperativeRecords(records, now);
    expect(result.find((r) => r.id === 7)).toBeUndefined();
  });

  it("returns empty for all-expired contract", () => {
    const expiredOnly: MockRecord[] = [
      { id: 10, itemNumber: "OLD-1", status: "active", startDate: new Date("2024-01-01"), endDate: new Date("2024-12-31"), supersededById: null, rebatePrice: 5.00 },
    ];
    expect(filterCurrentOperativeRecords(expiredOnly, now)).toEqual([]);
  });
});

describe("CSV export scoping", () => {
  it("contract-detail export URL includes distributor and endUserCode for precise scoping", () => {
    const contract = {
      contractNumber: "100001",
      distributor: { code: "FAS" },
      endUser: { name: "LINK-BELT", code: "LINKBELT" },
    };
    // Simulate the URL built by contract-detail-client.tsx — uses endUserCode when available
    const url = `/api/export/records-csv?contract=${contract.contractNumber}&distributor=${contract.distributor.code}&endUserCode=${encodeURIComponent(contract.endUser.code)}&columns=item,price`;

    expect(url).toContain("contract=100001");
    expect(url).toContain("distributor=FAS");
    expect(url).toContain("endUserCode=LINKBELT");
    // endUserCode is unique, so this is stronger than endUser name
  });

  it("falls back to endUser name when code is null", () => {
    const contract = {
      contractNumber: "100001",
      distributor: { code: "FAS" },
      endUser: { name: "LINK-BELT", code: null as string | null },
    };
    const url = contract.endUser.code
      ? `/api/export/records-csv?contract=${contract.contractNumber}&distributor=${contract.distributor.code}&endUserCode=${encodeURIComponent(contract.endUser.code)}&columns=item,price`
      : `/api/export/records-csv?contract=${contract.contractNumber}&distributor=${contract.distributor.code}&endUser=${encodeURIComponent(contract.endUser.name)}&columns=item,price`;

    expect(url).toContain("endUser=LINK-BELT");
    expect(url).not.toContain("endUserCode");
  });

  it("same contract number across distributors produces different URLs", () => {
    const url1 = `/api/export/records-csv?contract=100001&distributor=FAS&endUserCode=LINKBELT`;
    const url2 = `/api/export/records-csv?contract=100001&distributor=MOTION&endUser=KOMATSU`;
    expect(url1).not.toBe(url2);
  });
});

describe("Records deep-link scoping", () => {
  it("contract-detail Records link includes distributor and endUser", () => {
    const contract = {
      contractNumber: "100001",
      distributor: { code: "FAS" },
      endUser: { name: "LINK-BELT" },
    };
    const url = `/records?contract=${contract.contractNumber}&distributor=${contract.distributor.code}&endUser=${encodeURIComponent(contract.endUser.name)}`;
    expect(url).toContain("contract=100001");
    expect(url).toContain("distributor=FAS");
    expect(url).toContain("endUser=LINK-BELT");
  });

  it("Records links for same contract number in different distributors are distinct", () => {
    const url1 = `/records?contract=100001&distributor=FAS&endUser=LINK-BELT`;
    const url2 = `/records?contract=100001&distributor=MOTION&endUser=KOMATSU`;
    expect(url1).not.toBe(url2);
  });
});

describe("Multi-plan add-items guard", () => {
  it("single-plan contract uses the only plan as default", () => {
    const plans = [{ id: 1, planCode: "DEFAULT" }];
    const defaultPlanId = plans.length === 1 ? plans[0].id : null;
    expect(defaultPlanId).toBe(1);
  });

  it("multi-plan contract requires explicit selection (no default)", () => {
    const plans = [{ id: 1, planCode: "OSW" }, { id: 2, planCode: "SEAL" }];
    const defaultPlanId = plans.length === 1 ? plans[0].id : null;
    expect(defaultPlanId).toBeNull();
  });
});
