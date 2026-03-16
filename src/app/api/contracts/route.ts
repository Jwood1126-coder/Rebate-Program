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
  const { distributorId, endUserId, contractNumber, description, status } = body;

  if (!distributorId || !endUserId || !contractNumber) {
    return NextResponse.json(
      { error: "Distributor, end user, and contract number are required" },
      { status: 400 }
    );
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
