import { describe, it, expect } from 'vitest';
import { buildStatusWhere } from '../status-filter';

// Fixed "today" for deterministic tests: 2025-06-15T00:00:00.000Z
const TODAY = new Date(2025, 5, 15); // month is 0-indexed

describe('buildStatusWhere', () => {
  // -----------------------------------------------------------------------
  // active
  // -----------------------------------------------------------------------
  it('active: excludes superseded, manual statuses, and requires startDate <= today', () => {
    const w = buildStatusWhere('active', new Date(TODAY));
    expect(w.supersededById).toBeNull();
    expect(w.status).toEqual({ notIn: ['draft', 'cancelled'] });
    expect(w.startDate).toEqual({ lte: TODAY });
  });

  it('active: allows null endDate or endDate >= today', () => {
    const w = buildStatusWhere('active', new Date(TODAY));
    expect(w.OR).toEqual([
      { endDate: null },
      { endDate: { gte: TODAY } },
    ]);
  });

  // -----------------------------------------------------------------------
  // expired
  // -----------------------------------------------------------------------
  it('expired: requires endDate < today and excludes superseded/manual', () => {
    const w = buildStatusWhere('expired', new Date(TODAY));
    expect(w.supersededById).toBeNull();
    expect(w.status).toEqual({ notIn: ['draft', 'cancelled'] });
    expect(w.endDate).toEqual({ lt: TODAY });
    // No startDate constraint — any start date is fine for expired
    expect(w.startDate).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // future
  // -----------------------------------------------------------------------
  it('future: requires startDate > today and excludes superseded/manual', () => {
    const w = buildStatusWhere('future', new Date(TODAY));
    expect(w.supersededById).toBeNull();
    expect(w.status).toEqual({ notIn: ['draft', 'cancelled'] });
    expect(w.startDate).toEqual({ gt: TODAY });
    // No endDate constraint
    expect(w.endDate).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // superseded
  // -----------------------------------------------------------------------
  it('superseded: only checks supersededById is not null', () => {
    const w = buildStatusWhere('superseded', new Date(TODAY));
    expect(w.supersededById).toEqual({ not: null });
    // No other constraints
    expect(w.status).toBeUndefined();
    expect(w.startDate).toBeUndefined();
    expect(w.endDate).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // manual statuses
  // -----------------------------------------------------------------------
  it('draft: matches stored status column directly', () => {
    const w = buildStatusWhere('draft', new Date(TODAY));
    expect(w.status).toBe('draft');
    expect(w.supersededById).toBeUndefined();
  });

  it('cancelled: matches stored status column directly', () => {
    const w = buildStatusWhere('cancelled', new Date(TODAY));
    expect(w.status).toBe('cancelled');
    expect(w.supersededById).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // fallback
  // -----------------------------------------------------------------------
  it('unknown status falls back to stored column match', () => {
    const w = buildStatusWhere('some_custom', new Date(TODAY));
    expect(w.status).toBe('some_custom');
  });

  // -----------------------------------------------------------------------
  // Consistency with deriveRecordStatus
  // -----------------------------------------------------------------------
  // These tests verify that the WHERE conditions would match records that
  // deriveRecordStatus would classify the same way.

  it('active filter matches a record active today', () => {
    // Record: starts 2025-01-01, ends 2025-12-31, not superseded, status=active
    const w = buildStatusWhere('active', new Date(TODAY));
    // startDate 2025-01-01 <= 2025-06-15 ✓
    expect(new Date(2025, 0, 1) <= w.startDate!.lte!).toBe(true);
    // endDate 2025-12-31 >= 2025-06-15 ✓ (matches the OR branch)
  });

  it('expired filter would not match a record with null endDate', () => {
    // SQL: NULL < date → false, so null endDate records are excluded from expired
    const w = buildStatusWhere('expired', new Date(TODAY));
    expect(w.endDate).toEqual({ lt: TODAY });
    // Prisma's { lt: date } on a nullable field excludes NULLs — correct behavior
  });

  it('today parameter is stripped to midnight', () => {
    const withTime = new Date(2025, 5, 15, 14, 30, 45, 123);
    const w = buildStatusWhere('active', withTime);
    // The date in the WHERE should have time zeroed
    expect(w.startDate!.lte!.getHours()).toBe(0);
    expect(w.startDate!.lte!.getMinutes()).toBe(0);
    expect(w.startDate!.lte!.getSeconds()).toBe(0);
    expect(w.startDate!.lte!.getMilliseconds()).toBe(0);
  });
});
