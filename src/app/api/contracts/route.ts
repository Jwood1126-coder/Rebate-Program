import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";

export async function GET() {
  const contracts = await prisma.contract.findMany({
    include: {
      distributor: { select: { id: true, code: true, name: true } },
      endUser: { select: { id: true, code: true, name: true } },
      rebatePlans: { select: { id: true, planCode: true, status: true } },
    },
    orderBy: [{ distributor: { code: "asc" } }, { contractNumber: "asc" }],
  });
  return NextResponse.json(contracts);
}

export async function POST(request: NextRequest) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canEdit(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { distributorId, endUserId, description, status, startDate, endDate } = body;
  let { contractNumber } = body;

  if (!distributorId || !endUserId) {
    return NextResponse.json(
      { error: "Distributor and end user are required" },
      { status: 400 }
    );
  }

  // Auto-generate contract number if not provided or set to "auto"
  if (!contractNumber || contractNumber === "auto") {
    const latest = await prisma.contract.findMany({
      select: { contractNumber: true },
      orderBy: { contractNumber: "desc" },
      take: 1,
    });
    let nextNum = 100001;
    if (latest.length > 0) {
      const highest = parseInt(latest[0].contractNumber, 10);
      if (!isNaN(highest)) nextNum = highest + 1;
    }
    contractNumber = String(nextNum);
  }

  const existing = await prisma.contract.findFirst({
    where: { distributorId, endUserId, contractNumber },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Contract already exists for this distributor/end user combination" },
      { status: 409 }
    );
  }

  const contract = await prisma.contract.create({
    data: {
      distributorId,
      endUserId,
      contractNumber,
      description: description || null,
      status: status || "active",
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
    include: {
      distributor: { select: { code: true, name: true } },
      endUser: { select: { code: true, name: true } },
    },
  });

  await auditService.logCreate("contracts", contract.id, {
    distributorId,
    endUserId,
    contractNumber,
    status: contract.status,
  }, user.id);

  return NextResponse.json(contract, { status: 201 });
}
