import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VALIDATION_CODES } from '@/lib/constants/validation-codes';

// ---------------------------------------------------------------------------
// Mock Prisma — vi.mock is hoisted, so use vi.hoisted for the mock object
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      rebateRecord: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      rebatePlan: {
        findUnique: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/db/client', () => ({
  prisma: mockPrisma,
}));

import { validateRecord } from '../validation.service';
import type { RecordValidationInput, RecordValidationContext } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<RecordValidationInput> = {}): RecordValidationInput {
  return {
    rebatePlanId: 1,
    itemId: 10,
    rebatePrice: 5.99,
    startDate: '2026-01-15',
    endDate: '2026-12-31',
    ...overrides,
  };
}

function makeContext(overrides: Partial<RecordValidationContext> = {}): RecordValidationContext {
  return {
    mode: 'create',
    userId: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: no duplicates, no overlaps, active fixed-term contract
  mockPrisma.rebateRecord.findFirst.mockResolvedValue(null);
  mockPrisma.rebateRecord.findMany.mockResolvedValue([]);
  mockPrisma.rebatePlan.findUnique.mockResolvedValue({
    id: 1,
    contract: { status: 'active', contractType: 'fixed_term' },
  });
});

// ===========================================================================
// 1. Required field validation
// ===========================================================================
describe('required fields', () => {
  it('rejects missing rebate price', async () => {
    const result = await validateRecord(
      makeInput({ rebatePrice: 0 }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.PRICE_REQUIRED }),
    );
  });

  it('rejects negative rebate price', async () => {
    const result = await validateRecord(
      makeInput({ rebatePrice: -1 }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.PRICE_REQUIRED }),
    );
  });

  it('rejects missing start date', async () => {
    const result = await validateRecord(
      makeInput({ startDate: '' }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.START_DATE_REQUIRED }),
    );
  });

  it('rejects missing rebate plan', async () => {
    const result = await validateRecord(
      makeInput({ rebatePlanId: 0 }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.PLAN_REQUIRED }),
    );
  });

  it('rejects missing item (no itemId or itemNumber)', async () => {
    const result = await validateRecord(
      makeInput({ itemId: undefined, itemNumber: undefined }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.ITEM_REQUIRED }),
    );
  });

  it('accepts itemNumber when itemId is missing (import path)', async () => {
    const result = await validateRecord(
      makeInput({ itemId: undefined, itemNumber: 'BRN-12345' }),
      makeContext(),
    );
    // Should NOT have ITEM_REQUIRED error (may have other issues but not this one)
    expect(result.errors).not.toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.ITEM_REQUIRED }),
    );
  });

  it('passes with all required fields present', async () => {
    const result = await validateRecord(makeInput(), makeContext());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ===========================================================================
// 2. Date logic — end date before start date
// ===========================================================================
describe('end date before start date', () => {
  it('rejects end date before start date', async () => {
    const result = await validateRecord(
      makeInput({ startDate: '2026-06-15', endDate: '2026-01-01' }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.END_DATE_BEFORE_START }),
    );
  });

  it('accepts same-day start and end date', async () => {
    const result = await validateRecord(
      makeInput({ startDate: '2026-06-15', endDate: '2026-06-15' }),
      makeContext(),
    );
    expect(result.errors).not.toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.END_DATE_BEFORE_START }),
    );
  });

  it('accepts end date after start date', async () => {
    const result = await validateRecord(
      makeInput({ startDate: '2026-01-01', endDate: '2026-12-31' }),
      makeContext(),
    );
    expect(result.errors).not.toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.END_DATE_BEFORE_START }),
    );
  });
});

// ===========================================================================
// 3. Retroactive start date and far-future end date warnings
// ===========================================================================
describe('retroactive and far-future warnings', () => {
  it('warns on retroactive start date (in the past)', async () => {
    const result = await validateRecord(
      makeInput({ startDate: '2020-01-01' }),
      makeContext(),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.RETROACTIVE_START }),
    );
    // Warning, not error — should still be valid
    expect(result.valid).toBe(true);
  });

  it('warns on missing end date (open-ended)', async () => {
    const result = await validateRecord(
      makeInput({ endDate: undefined }),
      makeContext(),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.NO_END_DATE }),
    );
    expect(result.valid).toBe(true);
  });

  it('warns on far-future end date (>5 years)', async () => {
    const result = await validateRecord(
      makeInput({ endDate: '2040-12-31' }),
      makeContext(),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.FAR_FUTURE_END }),
    );
    expect(result.valid).toBe(true);
  });

  it('does not warn on near-future end date', async () => {
    const result = await validateRecord(
      makeInput({ startDate: '2026-01-01', endDate: '2027-12-31' }),
      makeContext(),
    );
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.FAR_FUTURE_END }),
    );
  });
});

// ===========================================================================
// 4. Duplicate detection (same plan + item + start_date)
// ===========================================================================
describe('duplicate detection', () => {
  it('rejects duplicate record (same plan + item + start_date)', async () => {
    mockPrisma.rebateRecord.findFirst.mockResolvedValue({
      id: 99,
      rebatePlanId: 1,
      itemId: 10,
      startDate: new Date('2026-01-15'),
    });

    const result = await validateRecord(makeInput(), makeContext());
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: VALIDATION_CODES.DUPLICATE_RECORD,
        message: expect.stringContaining('Record #99'),
      }),
    );
  });

  it('passes when no duplicate exists', async () => {
    mockPrisma.rebateRecord.findFirst.mockResolvedValue(null);
    const result = await validateRecord(makeInput(), makeContext());
    expect(result.valid).toBe(true);
  });

  it('skips duplicate/overlap checks when plan or item is missing', async () => {
    // Missing itemId + no itemNumber means we can't check for dupes
    const result = await validateRecord(
      makeInput({ itemId: undefined, itemNumber: undefined }),
      makeContext(),
    );
    // Should have ITEM_REQUIRED but should NOT call findFirst (no dupe check)
    expect(mockPrisma.rebateRecord.findFirst).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 5. Overlapping date detection
// ===========================================================================
describe('overlapping date detection', () => {
  it('rejects overlapping date range with existing record', async () => {
    // Existing record: Jan 1 - Jun 30
    mockPrisma.rebateRecord.findMany.mockResolvedValue([
      {
        id: 50,
        rebatePlanId: 1,
        itemId: 10,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
        status: 'active',
      },
    ]);

    // New record: Mar 1 - Dec 31 — overlaps with existing
    const result = await validateRecord(
      makeInput({ startDate: '2026-03-01', endDate: '2026-12-31' }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: VALIDATION_CODES.OVERLAPPING_DATES,
        message: expect.stringContaining('Record #50'),
      }),
    );
  });

  it('accepts non-overlapping date range', async () => {
    // Existing: Jan 1 - Jun 30
    mockPrisma.rebateRecord.findMany.mockResolvedValue([
      {
        id: 50,
        rebatePlanId: 1,
        itemId: 10,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
        status: 'active',
      },
    ]);

    // New: Jul 1 - Dec 31 — no overlap
    const result = await validateRecord(
      makeInput({ startDate: '2026-07-01', endDate: '2026-12-31' }),
      makeContext(),
    );
    expect(result.errors).not.toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.OVERLAPPING_DATES }),
    );
  });

  it('detects overlap with open-ended existing record', async () => {
    // Existing: Jan 1 - null (open-ended)
    mockPrisma.rebateRecord.findMany.mockResolvedValue([
      {
        id: 50,
        rebatePlanId: 1,
        itemId: 10,
        startDate: new Date('2026-01-01'),
        endDate: null,
        status: 'active',
      },
    ]);

    // New: Jun 1 - Dec 31 — overlaps with open-ended
    const result = await validateRecord(
      makeInput({ startDate: '2026-06-01', endDate: '2026-12-31' }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.OVERLAPPING_DATES }),
    );
  });

  it('reports only one overlap even if multiple exist', async () => {
    mockPrisma.rebateRecord.findMany.mockResolvedValue([
      {
        id: 50,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
        status: 'active',
      },
      {
        id: 51,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-09-30'),
        status: 'active',
      },
    ]);

    const result = await validateRecord(
      makeInput({ startDate: '2026-05-01', endDate: '2026-12-31' }),
      makeContext(),
    );
    const overlapErrors = result.errors.filter(
      (e) => e.code === VALIDATION_CODES.OVERLAPPING_DATES,
    );
    // The service breaks after finding the first overlap
    expect(overlapErrors).toHaveLength(1);
  });
});

// ===========================================================================
// 6. Exclusion of self and superseded record IDs
// ===========================================================================
describe('exclusion of self and superseded records', () => {
  it('excludes self (existingRecordId) on update', async () => {
    mockPrisma.rebateRecord.findFirst.mockResolvedValue(null);
    mockPrisma.rebateRecord.findMany.mockResolvedValue([]);

    await validateRecord(
      makeInput(),
      makeContext({ mode: 'update', existingRecordId: 42 }),
    );

    // Duplicate check should exclude self
    expect(mockPrisma.rebateRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: [42] },
        }),
      }),
    );

    // Overlap check should also exclude self
    expect(mockPrisma.rebateRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: [42] },
        }),
      }),
    );
  });

  it('excludes superseded record (supersedesRecordId) on supersede', async () => {
    mockPrisma.rebateRecord.findFirst.mockResolvedValue(null);
    mockPrisma.rebateRecord.findMany.mockResolvedValue([]);

    await validateRecord(
      makeInput(),
      makeContext({ supersedesRecordId: 77 }),
    );

    // Should exclude the superseded record
    expect(mockPrisma.rebateRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: [77] },
        }),
      }),
    );
  });

  it('excludes both self and superseded when both provided', async () => {
    mockPrisma.rebateRecord.findFirst.mockResolvedValue(null);
    mockPrisma.rebateRecord.findMany.mockResolvedValue([]);

    await validateRecord(
      makeInput(),
      makeContext({ mode: 'update', existingRecordId: 42, supersedesRecordId: 77 }),
    );

    expect(mockPrisma.rebateRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: [42, 77] },
        }),
      }),
    );
  });

  it('uses no exclusion clause on plain create', async () => {
    mockPrisma.rebateRecord.findFirst.mockResolvedValue(null);
    mockPrisma.rebateRecord.findMany.mockResolvedValue([]);

    await validateRecord(makeInput(), makeContext());

    // The where should NOT contain an id.notIn clause
    const call = mockPrisma.rebateRecord.findFirst.mock.calls[0][0];
    expect(call.where.id).toBeUndefined();
  });

  it('overlap query excludes superseded and cancelled statuses', async () => {
    mockPrisma.rebateRecord.findFirst.mockResolvedValue(null);
    mockPrisma.rebateRecord.findMany.mockResolvedValue([]);

    await validateRecord(makeInput(), makeContext());

    expect(mockPrisma.rebateRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: expect.arrayContaining(['superseded', 'cancelled']) },
        }),
      }),
    );
  });
});

// ===========================================================================
// 7. Expired contract warning
// ===========================================================================
describe('expired contract warning', () => {
  it('warns when adding record to an expired contract', async () => {
    mockPrisma.rebatePlan.findUnique.mockResolvedValue({
      id: 1,
      contract: { status: 'expired', contractType: 'fixed_term' },
    });

    const result = await validateRecord(makeInput(), makeContext());
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.EXPIRED_CONTRACT }),
    );
    // Warning, not error — still valid
    expect(result.valid).toBe(true);
  });

  it('does not warn for active contract', async () => {
    mockPrisma.rebatePlan.findUnique.mockResolvedValue({
      id: 1,
      contract: { status: 'active', contractType: 'fixed_term' },
    });

    const result = await validateRecord(makeInput(), makeContext());
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.EXPIRED_CONTRACT }),
    );
  });

  it('does not warn when plan is not found', async () => {
    mockPrisma.rebatePlan.findUnique.mockResolvedValue(null);

    const result = await validateRecord(makeInput(), makeContext());
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.EXPIRED_CONTRACT }),
    );
  });
});

// ===========================================================================
// 7b. Pending review contract warning — VAL-017
// ===========================================================================

describe('pending review contract warning', () => {
  it('warns when adding record to a pending_review contract', async () => {
    mockPrisma.rebatePlan.findUnique.mockResolvedValue({
      id: 1,
      contract: { status: 'pending_review', contractType: 'fixed_term' },
    });

    const result = await validateRecord(makeInput(), makeContext());
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.PENDING_REVIEW_CONTRACT }),
    );
    // Warning, not error — records can still be added to unapproved contracts
    expect(result.valid).toBe(true);
  });

  it('does not warn for active contract', async () => {
    mockPrisma.rebatePlan.findUnique.mockResolvedValue({
      id: 1,
      contract: { status: 'active', contractType: 'fixed_term' },
    });

    const result = await validateRecord(makeInput(), makeContext());
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.PENDING_REVIEW_CONTRACT }),
    );
  });
});

// ===========================================================================
// 8. Evergreen contract — VAL-009 suppression
// ===========================================================================
describe('evergreen contract behavior', () => {
  it('suppresses NO_END_DATE warning when contract is evergreen', async () => {
    mockPrisma.rebatePlan.findUnique.mockResolvedValue({
      id: 1,
      contract: { status: 'active', contractType: 'evergreen' },
    });

    const result = await validateRecord(
      makeInput({ endDate: undefined }),
      makeContext(),
    );
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.NO_END_DATE }),
    );
    expect(result.valid).toBe(true);
  });

  it('still warns NO_END_DATE for fixed-term contracts', async () => {
    mockPrisma.rebatePlan.findUnique.mockResolvedValue({
      id: 1,
      contract: { status: 'active', contractType: 'fixed_term' },
    });

    const result = await validateRecord(
      makeInput({ endDate: undefined }),
      makeContext(),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.NO_END_DATE }),
    );
    expect(result.valid).toBe(true);
  });

  it('evergreen records with explicit end dates still get far-future warning', async () => {
    mockPrisma.rebatePlan.findUnique.mockResolvedValue({
      id: 1,
      contract: { status: 'active', contractType: 'evergreen' },
    });

    const result = await validateRecord(
      makeInput({ endDate: '2040-12-31' }),
      makeContext(),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.FAR_FUTURE_END }),
    );
  });

  it('evergreen records with specific date ranges do not suppress other warnings', async () => {
    mockPrisma.rebatePlan.findUnique.mockResolvedValue({
      id: 1,
      contract: { status: 'active', contractType: 'evergreen' },
    });

    // Retroactive start date should still warn even under evergreen
    const result = await validateRecord(
      makeInput({ startDate: '2020-01-01', endDate: undefined }),
      makeContext(),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.RETROACTIVE_START }),
    );
    // But NO_END_DATE should be suppressed
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.NO_END_DATE }),
    );
  });

  it('still warns NO_END_DATE when plan lookup returns null', async () => {
    // If plan is not found, we cannot determine contract type — default to warning
    mockPrisma.rebatePlan.findUnique.mockResolvedValue(null);

    const result = await validateRecord(
      makeInput({ endDate: undefined }),
      makeContext(),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.NO_END_DATE }),
    );
  });
});

// ===========================================================================
// 9. Combined scenarios — multiple issues at once
// ===========================================================================
describe('combined scenarios', () => {
  it('reports both errors and warnings in one pass', async () => {
    // Missing price (error) + retroactive date (warning) + no end date (warning)
    const result = await validateRecord(
      makeInput({
        rebatePrice: 0,
        startDate: '2020-01-01',
        endDate: undefined,
      }),
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('valid record with no warnings', async () => {
    // Future start, has end date, within 5 years
    const result = await validateRecord(
      makeInput({
        startDate: '2027-01-01',
        endDate: '2027-12-31',
      }),
      makeContext(),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
