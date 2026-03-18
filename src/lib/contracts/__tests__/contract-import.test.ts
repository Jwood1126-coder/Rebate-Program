import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma client
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => {
  const txMethods = {
    contract: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    rebatePlan: {
      create: vi.fn(),
    },
    rebateRecord: {
      create: vi.fn(),
    },
    item: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    endUser: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    mockPrisma: {
      distributor: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      endUser: {
        findUnique: vi.fn(),
      },
      contract: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: typeof txMethods) => Promise<unknown>) => {
        return fn(txMethods);
      }),
      _tx: txMethods,
    },
  };
});

vi.mock('@/lib/db/client', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/audit/diff', () => ({
  computeInsertSnapshot: vi.fn((rec: Record<string, unknown>) => {
    const snap: Record<string, { old: null; new: unknown }> = {};
    for (const [k, v] of Object.entries(rec)) snap[k] = { old: null, new: v };
    return snap;
  }),
}));

// Mock xlsx — we test the commit logic, not file parsing
vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: { sheet_to_json: vi.fn() },
}));

import {
  commitSimpleImport,
  commitContractImport,
  parseContractFile,
  parseSimpleContractFile,
  type SimpleImportContext,
} from '../contract-import.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetAllMocks() {
  vi.clearAllMocks();

  // Default: no existing contracts → contract number starts at 100001
  mockPrisma._tx.contract.findMany.mockResolvedValue([]);
  mockPrisma._tx.contract.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 1,
    ...data,
  }));
  mockPrisma._tx.rebatePlan.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 1,
    ...data,
  }));
  mockPrisma._tx.rebateRecord.create.mockResolvedValue({ id: 1 });
  mockPrisma._tx.item.findFirst.mockResolvedValue(null);
  mockPrisma._tx.item.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 100,
    ...data,
  }));
  mockPrisma._tx.endUser.findFirst.mockResolvedValue(null);
  mockPrisma._tx.endUser.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 50,
    ...data,
  }));
  mockPrisma._tx.auditLog.create.mockResolvedValue({});

  // For pre-validation (outside tx)
  mockPrisma.distributor.findUnique.mockResolvedValue({ id: 1, code: 'FAS', name: 'Fastenal' });
  mockPrisma.endUser.findUnique.mockResolvedValue({ id: 2, code: 'LINKBELT', name: 'Link-Belt' });
  mockPrisma.contract.findMany.mockResolvedValue([]);
}

const defaultContext: SimpleImportContext = {
  distributorId: 1,
  endUserId: 2,
  planCode: 'OSW',
  planName: 'OSW Plan',
  discountType: 'part',
  description: 'Test contract',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
};

// ---------------------------------------------------------------------------
// Tests: commitSimpleImport
// ---------------------------------------------------------------------------

/**
 * Helper: set up xlsx mock so parseSimpleContractFile succeeds.
 */
async function mockXlsxForSimpleParse(rows: Record<string, unknown>[]) {
  const XLSX = await import('xlsx');
  vi.mocked(XLSX.read).mockReturnValue({
    SheetNames: ['Sheet1'],
    Sheets: { Sheet1: {} },
  } as ReturnType<typeof XLSX.read>);
  vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(rows);
}

describe('commitSimpleImport', () => {
  beforeEach(resetAllMocks);

  it('wraps all writes in a single $transaction call', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
      { 'Part Number': 'PART-2', Price: '20.00' },
    ]);

    const result = await commitSimpleImport(
      Buffer.from('fake'),
      'test.xlsx',
      defaultContext,
      1,
    );

    expect(result.success).toBe(true);
    expect(result.recordsCreated).toBe(2);
    // All writes in a single transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.contract.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.rebatePlan.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.rebateRecord.create).toHaveBeenCalledTimes(2);
  });

  it('fails cleanly when distributor not found — no transaction', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);
    mockPrisma.distributor.findUnique.mockResolvedValue(null);

    const result = await commitSimpleImport(
      Buffer.from('fake'),
      'test.xlsx',
      defaultContext,
      1,
    );

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Distributor not found');
    // $transaction should NOT have been called
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails cleanly when end user not found — no transaction', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);
    mockPrisma.endUser.findUnique.mockResolvedValue(null);

    const result = await commitSimpleImport(
      Buffer.from('fake'),
      'test.xlsx',
      defaultContext,
      1,
    );

    expect(result.success).toBe(false);
    expect(result.errors).toContain('End user not found');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes audit entries inside the transaction', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);

    await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', defaultContext, 1);

    // Audit entries for contract + plan (at minimum)
    const auditCalls = mockPrisma._tx.auditLog.create.mock.calls;
    expect(auditCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('creates items inside transaction when they do not exist', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'NEW-ITEM', Price: '7.50' },
    ]);

    const result = await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', defaultContext, 1);

    expect(result.success).toBe(true);
    expect(mockPrisma._tx.item.create).toHaveBeenCalledTimes(1);
    expect(result.warnings.some(w => w.includes('Created new item: NEW-ITEM'))).toBe(true);
  });

  it('generates contract number inside transaction', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);
    mockPrisma._tx.contract.findMany.mockResolvedValue([{ contractNumber: '100010' }]);

    await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', defaultContext, 1);

    expect(mockPrisma._tx.contract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contractNumber: '100011' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: commitSimpleImport — evergreen/fixed-term contract invariants
// ---------------------------------------------------------------------------

describe('commitSimpleImport contract type handling', () => {
  beforeEach(resetAllMocks);

  it('creates an evergreen contract with noticePeriodDays', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);

    const context: SimpleImportContext = {
      ...defaultContext,
      contractType: 'evergreen',
      noticePeriodDays: 30,
      endDate: undefined,
    };

    const result = await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', context, 1);
    expect(result.success).toBe(true);

    const contractCreateCall = mockPrisma._tx.contract.create.mock.calls[0][0];
    expect(contractCreateCall.data.contractType).toBe('evergreen');
    expect(contractCreateCall.data.noticePeriodDays).toBe(30);
    expect(contractCreateCall.data.endDate).toBeNull();
  });

  it('creates a fixed-term contract with null noticePeriodDays even if provided', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);

    // Simulates a stale/malicious client sending noticePeriodDays with fixed_term
    const context: SimpleImportContext = {
      ...defaultContext,
      contractType: 'fixed_term',
      noticePeriodDays: 60,
    };

    const result = await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', context, 1);
    expect(result.success).toBe(true);

    const contractCreateCall = mockPrisma._tx.contract.create.mock.calls[0][0];
    expect(contractCreateCall.data.contractType).toBe('fixed_term');
    // noticePeriodDays should be null — fixed-term contracts never carry it
    expect(contractCreateCall.data.noticePeriodDays).toBeNull();
  });

  it('defaults contractType to fixed_term when not provided', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);

    // Omit contractType entirely
    const context: SimpleImportContext = {
      distributorId: 1,
      endUserId: 2,
      planCode: 'OSW',
      discountType: 'part',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    };

    const result = await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', context, 1);
    expect(result.success).toBe(true);

    const contractCreateCall = mockPrisma._tx.contract.create.mock.calls[0][0];
    expect(contractCreateCall.data.contractType).toBe('fixed_term');
  });

  it('includes contractType in audit log entry', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);

    const context: SimpleImportContext = {
      ...defaultContext,
      contractType: 'evergreen',
      noticePeriodDays: 60,
      endDate: undefined,
    };

    await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', context, 1);

    // First audit entry should be for the contract
    const auditCalls = mockPrisma._tx.auditLog.create.mock.calls;
    const contractAudit = auditCalls.find(
      (c: Array<{ data: { tableName: string } }>) => c[0].data.tableName === 'contracts'
    );
    expect(contractAudit).toBeDefined();
    // changedFields is already an object (from computeInsertSnapshot mock)
    const changedFields = contractAudit![0].data.changedFields as Record<string, unknown>;
    expect(changedFields.contractType).toBeDefined();
  });

  it('includes customerNumber in audit log entry when provided', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);

    const context: SimpleImportContext = {
      ...defaultContext,
      customerNumber: 'CUST-42',
    };

    await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', context, 1);

    const auditCalls = mockPrisma._tx.auditLog.create.mock.calls;
    const contractAudit = auditCalls.find(
      (c: Array<{ data: { tableName: string } }>) => c[0].data.tableName === 'contracts'
    );
    expect(contractAudit).toBeDefined();
    const changedFields = contractAudit![0].data.changedFields as Record<string, unknown>;
    expect(changedFields.customerNumber).toBeDefined();
  });

  it('stores customerNumber on the created contract', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);

    const context: SimpleImportContext = {
      ...defaultContext,
      customerNumber: 'CUST-42',
    };

    const result = await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', context, 1);
    expect(result.success).toBe(true);

    const contractCreateCall = mockPrisma._tx.contract.create.mock.calls[0][0];
    expect(contractCreateCall.data.customerNumber).toBe('CUST-42');
  });

  it('creates contract with pending_review status', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);

    const result = await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', defaultContext, 1);
    expect(result.success).toBe(true);

    const contractCreateCall = mockPrisma._tx.contract.create.mock.calls[0][0];
    expect(contractCreateCall.data.status).toBe('pending_review');
  });

  it('creates plans with active status (not pending_review)', async () => {
    await mockXlsxForSimpleParse([
      { 'Part Number': 'PART-1', Price: '10.00' },
    ]);

    const result = await commitSimpleImport(Buffer.from('fake'), 'test.xlsx', defaultContext, 1);
    expect(result.success).toBe(true);

    // Plan should be active even though the contract is pending_review.
    // Approval is a contract-level concept, not a plan-level concept.
    const planCreateCall = mockPrisma._tx.rebatePlan.create.mock.calls[0][0];
    expect(planCreateCall.data.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// Tests: commitContractImport
// ---------------------------------------------------------------------------

describe('commitContractImport', () => {
  beforeEach(resetAllMocks);

  it('fails before entering transaction when distributor not found', async () => {
    mockPrisma.distributor.findFirst.mockResolvedValue(null);

    // Need to provide a parseable file — but xlsx is mocked.
    // We can test this by mocking xlsx to return valid data.
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { Distributor: 'UNKNOWN', 'Item Number': 'PART-1', 'Deviated Price': '10.00', 'Start Date': '2026-01-01' },
    ]);

    const result = await commitContractImport(Buffer.from('fake'), 'test.xlsx', 1);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('not found in system');
    // Transaction should NOT have been called
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses transaction for all writes when distributors exist', async () => {
    mockPrisma.distributor.findFirst.mockResolvedValue({ id: 1, code: 'FAS', name: 'Fastenal' });

    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { Distributor: 'FAS', 'Item Number': 'PART-1', 'Deviated Price': '10.00', 'Start Date': '2026-01-01' },
      { Distributor: 'FAS', 'Item Number': 'PART-2', 'Deviated Price': '20.00', 'Start Date': '2026-01-01' },
    ]);

    const result = await commitContractImport(Buffer.from('fake'), 'test.xlsx', 1);

    expect(result.success).toBe(true);
    expect(result.contractsCreated).toBe(1);
    expect(result.recordsCreated).toBe(2);

    // Verify $transaction was called exactly once
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // Verify writes happened inside the transaction (via tx methods)
    expect(mockPrisma._tx.contract.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.rebatePlan.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.rebateRecord.create).toHaveBeenCalledTimes(2);
  });

  it('generates contract numbers inside transaction', async () => {
    mockPrisma.distributor.findFirst.mockResolvedValue({ id: 1, code: 'FAS', name: 'Fastenal' });
    mockPrisma._tx.contract.findMany.mockResolvedValue([{ contractNumber: '100005' }]);

    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { Distributor: 'FAS', 'Item Number': 'PART-1', 'Deviated Price': '10.00', 'Start Date': '2026-01-01' },
    ]);

    await commitContractImport(Buffer.from('fake'), 'test.xlsx', 1);

    // Contract number should be 100006 (next after 100005)
    expect(mockPrisma._tx.contract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contractNumber: '100006' }),
      }),
    );
  });

  it('creates end users inside transaction when they do not exist', async () => {
    mockPrisma.distributor.findFirst.mockResolvedValue({ id: 1, code: 'FAS', name: 'Fastenal' });
    mockPrisma._tx.endUser.findFirst.mockResolvedValue(null);

    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { Distributor: 'FAS', 'Item Number': 'PART-1', 'Deviated Price': '10.00', 'Start Date': '2026-01-01' },
    ]);

    const result = await commitContractImport(Buffer.from('fake'), 'test.xlsx', 1);

    expect(result.success).toBe(true);
    // End user created inside transaction
    expect(mockPrisma._tx.endUser.create).toHaveBeenCalledTimes(1);
    expect(result.warnings.some(w => w.includes('Created new end user'))).toBe(true);
  });

  it('creates items inside transaction when they do not exist', async () => {
    mockPrisma.distributor.findFirst.mockResolvedValue({ id: 1, code: 'FAS', name: 'Fastenal' });

    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { Distributor: 'FAS', 'Item Number': 'NEW-PART', 'Deviated Price': '5.00', 'Start Date': '2026-01-01' },
    ]);

    const result = await commitContractImport(Buffer.from('fake'), 'test.xlsx', 1);

    expect(result.success).toBe(true);
    expect(mockPrisma._tx.item.create).toHaveBeenCalledTimes(1);
    expect(result.warnings.some(w => w.includes('Created new item: NEW-PART'))).toBe(true);
  });

  it('writes audit entries inside transaction', async () => {
    mockPrisma.distributor.findFirst.mockResolvedValue({ id: 1, code: 'FAS', name: 'Fastenal' });

    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { Distributor: 'FAS', 'Item Number': 'PART-1', 'Deviated Price': '10.00', 'Start Date': '2026-01-01' },
    ]);

    await commitContractImport(Buffer.from('fake'), 'test.xlsx', 1);

    // Should have audit entries for: end_user (created), contract, plan
    // (plus end user audit if created)
    const auditCalls = mockPrisma._tx.auditLog.create.mock.calls;
    expect(auditCalls.length).toBeGreaterThanOrEqual(2); // contract + plan minimum

    // Verify at least one audit entry is for 'contracts'
    const contractAudit = auditCalls.find(
      (c: Array<{ data: { tableName: string } }>) => c[0].data.tableName === 'contracts'
    );
    expect(contractAudit).toBeDefined();
  });

  it('rolls back everything when transaction fails mid-write', async () => {
    mockPrisma.distributor.findFirst.mockResolvedValue({ id: 1, code: 'FAS', name: 'Fastenal' });

    // Make rebateRecord.create throw on the second call
    let callCount = 0;
    mockPrisma._tx.rebateRecord.create.mockImplementation(async () => {
      callCount++;
      if (callCount >= 2) throw new Error('DB constraint violation');
      return { id: 1 };
    });

    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { Distributor: 'FAS', 'Item Number': 'PART-1', 'Deviated Price': '10.00', 'Start Date': '2026-01-01' },
      { Distributor: 'FAS', 'Item Number': 'PART-2', 'Deviated Price': '20.00', 'Start Date': '2026-01-01' },
    ]);

    // The error propagates — Prisma $transaction would rollback in production
    await expect(
      commitContractImport(Buffer.from('fake'), 'test.xlsx', 1)
    ).rejects.toThrow('DB constraint violation');
  });

  it('handles multiple groups in one transaction', async () => {
    // Two distributors, each with their own group
    mockPrisma.distributor.findFirst
      .mockResolvedValueOnce({ id: 1, code: 'FAS', name: 'Fastenal' })
      .mockResolvedValueOnce({ id: 2, code: 'MOTION', name: 'Motion Industries' });

    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { Distributor: 'FAS', 'Item Number': 'PART-1', 'Deviated Price': '10.00', 'Start Date': '2026-01-01' },
      { Distributor: 'MOTION', 'Item Number': 'PART-2', 'Deviated Price': '20.00', 'Start Date': '2026-01-01' },
    ]);

    // Need different contract numbers for each group
    mockPrisma._tx.contract.findMany
      .mockResolvedValueOnce([]) // first call: no contracts → 100001
      .mockResolvedValueOnce([{ contractNumber: '100001' }]); // second call → 100002

    const result = await commitContractImport(Buffer.from('fake'), 'test.xlsx', 1);

    expect(result.success).toBe(true);
    expect(result.contractsCreated).toBe(2);
    // All in one transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.contract.create).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: parseContractFile
// ---------------------------------------------------------------------------

describe('parseContractFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses valid rows with flexible header matching', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { Distributor: 'FAS', 'Item Number': 'PART-1', 'Deviated Price': '$10.50', 'Start Date': '01/15/2026' },
    ]);

    const result = parseContractFile(Buffer.from('fake'), 'test.xlsx');

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].distributorCode).toBe('FAS');
    expect(result.rows[0].deviatedPrice).toBe(10.50);
    expect(result.rows[0].startDate).toBe('2026-01-15');
  });

  it('rejects rows with missing required fields', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { Distributor: '', 'Item Number': 'PART-1', 'Deviated Price': '10.00', 'Start Date': '2026-01-01' },
      { Distributor: 'FAS', 'Item Number': '', 'Deviated Price': '10.00', 'Start Date': '2026-01-01' },
      { Distributor: 'FAS', 'Item Number': 'PART-3', 'Deviated Price': 'abc', 'Start Date': '2026-01-01' },
    ]);

    const result = parseContractFile(Buffer.from('fake'), 'test.xlsx');

    expect(result.errors).toHaveLength(3);
    expect(result.rows).toHaveLength(0);
  });

  it('returns error when required columns are missing', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { 'Random Column': 'value' },
    ]);

    const result = parseContractFile(Buffer.from('fake'), 'test.xlsx');

    expect(result.errors[0]).toContain('Missing required columns');
    expect(result.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: parseSimpleContractFile
// ---------------------------------------------------------------------------

describe('parseSimpleContractFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses explicit column mapping when provided', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { 'Supplier P/N': 'ABC-123', 'Agreement Price': '$5.50', 'Other': 'ignore' },
    ]);

    const result = parseSimpleContractFile(Buffer.from('fake'), 'test.xlsx', {
      itemNumberColumn: 'Supplier P/N',
      priceColumn: 'Agreement Price',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].itemNumber).toBe('ABC-123');
    expect(result.items[0].price).toBe(5.50);
  });

  it('detects duplicate part numbers and keeps last occurrence', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { 'Part Number': 'DUP-1', Price: '10.00' },
      { 'Part Number': 'DUP-1', Price: '15.00' },
    ]);

    const result = parseSimpleContractFile(Buffer.from('fake'), 'test.xlsx');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].price).toBe(15.00);
    expect(result.warnings.some(w => w.includes('Duplicate'))).toBe(true);
  });

  it('rejects when mapped column does not exist in file', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    } as ReturnType<typeof XLSX.read>);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      { 'Col A': 'value', 'Col B': '10' },
    ]);

    const result = parseSimpleContractFile(Buffer.from('fake'), 'test.xlsx', {
      itemNumberColumn: 'NonExistent',
      priceColumn: 'Col B',
    });

    expect(result.errors[0]).toContain('not found in file headers');
    expect(result.items).toHaveLength(0);
  });
});
