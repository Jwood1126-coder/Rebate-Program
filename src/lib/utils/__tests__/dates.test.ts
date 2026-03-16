import { describe, it, expect } from "vitest";
import {
  deriveRecordStatus,
  datesOverlap,
  stripTime,
  isRetroactive,
  isFarFuture,
  isFarPast,
  safeParseDate,
} from "../dates";

const today = new Date(2025, 5, 15); // June 15, 2025

describe("deriveRecordStatus", () => {
  it("returns 'draft' for draft status (manual, never overridden)", () => {
    const start = new Date(2025, 0, 1);
    expect(deriveRecordStatus(start, null, null, "draft", today)).toBe("draft");
  });

  it("returns 'cancelled' for cancelled status (manual, never overridden)", () => {
    const start = new Date(2025, 0, 1);
    expect(deriveRecordStatus(start, null, null, "cancelled", today)).toBe("cancelled");
  });

  it("returns 'superseded' when supersededById is set", () => {
    const start = new Date(2025, 0, 1);
    expect(deriveRecordStatus(start, null, 42, "active", today)).toBe("superseded");
  });

  it("returns 'expired' when endDate is before today", () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2025, 4, 1); // May 1, before June 15
    expect(deriveRecordStatus(start, end, null, "active", today)).toBe("expired");
  });

  it("returns 'future' when startDate is after today", () => {
    const start = new Date(2025, 6, 1); // July 1, after June 15
    expect(deriveRecordStatus(start, null, null, "active", today)).toBe("future");
  });

  it("returns 'active' when started and not ended", () => {
    const start = new Date(2025, 0, 1);
    expect(deriveRecordStatus(start, null, null, "active", today)).toBe("active");
  });

  it("returns 'active' when today equals startDate", () => {
    expect(deriveRecordStatus(today, null, null, "active", today)).toBe("active");
  });

  it("returns 'active' when today equals endDate", () => {
    const start = new Date(2025, 0, 1);
    expect(deriveRecordStatus(start, today, null, "active", today)).toBe("active");
  });

  it("returns 'expired' when endDate is yesterday", () => {
    const start = new Date(2025, 0, 1);
    const yesterday = new Date(2025, 5, 14);
    expect(deriveRecordStatus(start, yesterday, null, "active", today)).toBe("expired");
  });

  it("returns 'future' when startDate is tomorrow", () => {
    const tomorrow = new Date(2025, 5, 16);
    expect(deriveRecordStatus(tomorrow, null, null, "active", today)).toBe("future");
  });

  it("manual status takes priority over superseded", () => {
    const start = new Date(2025, 0, 1);
    expect(deriveRecordStatus(start, null, 42, "cancelled", today)).toBe("cancelled");
  });

  it("superseded takes priority over expired", () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 11, 31);
    expect(deriveRecordStatus(start, end, 42, "active", today)).toBe("superseded");
  });
});

describe("datesOverlap", () => {
  it("detects overlap when ranges intersect", () => {
    const a = { start: new Date(2025, 0, 1), end: new Date(2025, 5, 30) };
    const b = { start: new Date(2025, 3, 1), end: new Date(2025, 11, 31) };
    expect(datesOverlap(a.start, a.end, b.start, b.end)).toBe(true);
  });

  it("detects no overlap when ranges are disjoint", () => {
    const a = { start: new Date(2025, 0, 1), end: new Date(2025, 2, 31) };
    const b = { start: new Date(2025, 4, 1), end: new Date(2025, 11, 31) };
    expect(datesOverlap(a.start, a.end, b.start, b.end)).toBe(false);
  });

  it("treats touching end/start as overlapping (inclusive)", () => {
    const a = { start: new Date(2025, 0, 1), end: new Date(2025, 5, 15) };
    const b = { start: new Date(2025, 5, 15), end: new Date(2025, 11, 31) };
    expect(datesOverlap(a.start, a.end, b.start, b.end)).toBe(true);
  });

  it("handles null end date (open-ended) A", () => {
    const a = { start: new Date(2025, 0, 1), end: null };
    const b = { start: new Date(2026, 0, 1), end: new Date(2026, 11, 31) };
    expect(datesOverlap(a.start, a.end, b.start, b.end)).toBe(true);
  });

  it("handles null end date (open-ended) B", () => {
    const a = { start: new Date(2025, 0, 1), end: new Date(2025, 5, 30) };
    const b = { start: new Date(2024, 0, 1), end: null };
    expect(datesOverlap(a.start, a.end, b.start, b.end)).toBe(true);
  });

  it("handles both open-ended", () => {
    const a = { start: new Date(2025, 0, 1), end: null };
    const b = { start: new Date(2026, 0, 1), end: null };
    expect(datesOverlap(a.start, a.end, b.start, b.end)).toBe(true);
  });

  it("no overlap: A ends before B starts", () => {
    const a = { start: new Date(2025, 0, 1), end: new Date(2025, 0, 10) };
    const b = { start: new Date(2025, 0, 11), end: new Date(2025, 0, 20) };
    expect(datesOverlap(a.start, a.end, b.start, b.end)).toBe(false);
  });
});

describe("stripTime", () => {
  it("removes time component", () => {
    const d = new Date(2025, 5, 15, 14, 30, 45);
    const stripped = stripTime(d);
    expect(stripped.getHours()).toBe(0);
    expect(stripped.getMinutes()).toBe(0);
    expect(stripped.getSeconds()).toBe(0);
    expect(stripped.getDate()).toBe(15);
  });
});

describe("safeParseDate", () => {
  it("parses valid ISO date", () => {
    const result = safeParseDate("2025-06-15");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
  });

  it("returns null for empty string", () => {
    expect(safeParseDate("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(safeParseDate(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(safeParseDate(undefined)).toBeNull();
  });

  it("returns null for garbage", () => {
    expect(safeParseDate("not-a-date")).toBeNull();
  });
});

describe("isRetroactive", () => {
  it("returns true when startDate is before today", () => {
    expect(isRetroactive(new Date(2025, 4, 1), today)).toBe(true);
  });

  it("returns false when startDate is today", () => {
    expect(isRetroactive(today, today)).toBe(false);
  });

  it("returns false when startDate is in the future", () => {
    expect(isRetroactive(new Date(2025, 6, 1), today)).toBe(false);
  });
});

describe("isFarFuture", () => {
  it("returns true when endDate is more than 5 years away", () => {
    expect(isFarFuture(new Date(2031, 0, 1), 5, today)).toBe(true);
  });

  it("returns false when endDate is within 5 years", () => {
    expect(isFarFuture(new Date(2029, 0, 1), 5, today)).toBe(false);
  });
});

describe("isFarPast", () => {
  it("returns true when startDate is more than 2 years ago", () => {
    expect(isFarPast(new Date(2022, 0, 1), 2, today)).toBe(true);
  });

  it("returns false when startDate is within 2 years", () => {
    expect(isFarPast(new Date(2024, 0, 1), 2, today)).toBe(false);
  });
});
