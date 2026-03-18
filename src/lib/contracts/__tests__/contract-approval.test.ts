import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      contract: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

// ---------------------------------------------------------------------------
// Mock audit service
// ---------------------------------------------------------------------------
const { mockAudit } = vi.hoisted(() => ({
  mockAudit: { logUpdate: vi.fn() },
}));

vi.mock("@/lib/audit/audit.service", () => ({
  auditService: mockAudit,
}));

// ---------------------------------------------------------------------------
// Mock auth
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn().mockResolvedValue({
    user: { id: 1, role: "admin", displayName: "Admin" },
  }),
}));

vi.mock("@/lib/auth/roles", () => ({
  canEdit: vi.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Import the route handler
// ---------------------------------------------------------------------------
import { POST } from "@/app/api/contracts/[id]/approve/route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/contracts/1/approve", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const makeParams = (id: string) => Promise.resolve({ id });

beforeEach(() => vi.clearAllMocks());

// ===========================================================================
// Approve transitions
// ===========================================================================

describe("contract approval endpoint", () => {
  it("approve transitions pending_review → active", async () => {
    mockPrisma.contract.findUnique.mockResolvedValue({
      id: 1,
      status: "pending_review",
      lastReviewedAt: null,
    });
    mockPrisma.contract.update.mockResolvedValue({
      id: 1,
      status: "active",
      lastReviewedAt: new Date().toISOString(),
      distributor: { code: "FAS", name: "Fastenal" },
      endUser: { code: "LB", name: "Link-Belt" },
    });

    const res = await POST(makeRequest({ action: "approve" }), { params: makeParams("1") });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("active");

    // Verify the update call set status to active and lastReviewedAt
    const updateCall = mockPrisma.contract.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("active");
    expect(updateCall.data.lastReviewedAt).toBeDefined();
  });

  it("reject transitions pending_review → cancelled", async () => {
    mockPrisma.contract.findUnique.mockResolvedValue({
      id: 1,
      status: "pending_review",
    });
    mockPrisma.contract.update.mockResolvedValue({
      id: 1,
      status: "cancelled",
      distributor: { code: "FAS", name: "Fastenal" },
      endUser: { code: "LB", name: "Link-Belt" },
    });

    const res = await POST(makeRequest({ action: "reject" }), { params: makeParams("1") });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("cancelled");

    // Reject should NOT set lastReviewedAt
    const updateCall = mockPrisma.contract.update.mock.calls[0][0];
    expect(updateCall.data.lastReviewedAt).toBeUndefined();
  });

  it("writes audit entry with approval action", async () => {
    mockPrisma.contract.findUnique.mockResolvedValue({
      id: 1,
      status: "pending_review",
    });
    mockPrisma.contract.update.mockResolvedValue({
      id: 1,
      status: "active",
      lastReviewedAt: new Date().toISOString(),
      distributor: { code: "FAS", name: "Fastenal" },
      endUser: { code: "LB", name: "Link-Belt" },
    });

    await POST(makeRequest({ action: "approve", note: "Looks good" }), { params: makeParams("1") });

    expect(mockAudit.logUpdate).toHaveBeenCalledWith(
      "contracts",
      1,
      { status: "pending_review" },
      expect.objectContaining({
        status: "active",
        approvalAction: "approve",
        approvalNote: "Looks good",
      }),
      1,
    );
  });

  // ===========================================================================
  // Conflict: non-pending contracts cannot be approved
  // ===========================================================================

  it("returns 409 for already-active contract", async () => {
    mockPrisma.contract.findUnique.mockResolvedValue({
      id: 1,
      status: "active",
    });

    const res = await POST(makeRequest({ action: "approve" }), { params: makeParams("1") });
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.error).toContain("not pending review");
  });

  it("returns 409 for cancelled contract", async () => {
    mockPrisma.contract.findUnique.mockResolvedValue({
      id: 1,
      status: "cancelled",
    });

    const res = await POST(makeRequest({ action: "reject" }), { params: makeParams("1") });
    expect(res.status).toBe(409);
  });

  it("returns 409 for expired contract", async () => {
    mockPrisma.contract.findUnique.mockResolvedValue({
      id: 1,
      status: "expired",
    });

    const res = await POST(makeRequest({ action: "approve" }), { params: makeParams("1") });
    expect(res.status).toBe(409);
  });

  // ===========================================================================
  // Validation
  // ===========================================================================

  it("returns 400 for invalid action", async () => {
    const res = await POST(makeRequest({ action: "maybe" }), { params: makeParams("1") });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing action", async () => {
    const res = await POST(makeRequest({}), { params: makeParams("1") });
    expect(res.status).toBe(400);
  });

  it("returns 404 for nonexistent contract", async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ action: "approve" }), { params: makeParams("999") });
    expect(res.status).toBe(404);
  });
});
