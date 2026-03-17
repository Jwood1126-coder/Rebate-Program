import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";

export async function GET() {
  const items = await prisma.item.findMany({
    orderBy: { itemNumber: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canEdit(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.itemNumber?.trim()) {
    return NextResponse.json({ error: "Item number is required" }, { status: 400 });
  }

  const itemNumber = body.itemNumber.trim().toUpperCase();

  // Check for duplicate
  const existing = await prisma.item.findFirst({
    where: { itemNumber },
  });

  if (existing) {
    return NextResponse.json(
      { error: `Item number "${itemNumber}" already exists (Item #${existing.id})` },
      { status: 409 },
    );
  }

  const item = await prisma.item.create({
    data: {
      itemNumber,
      description: body.description?.trim() || null,
      productCode: body.productCode?.trim() || null,
    },
  });

  await auditService.logCreate("items", item.id,
    { itemNumber: item.itemNumber, description: item.description, productCode: item.productCode },
    user.id,
  );

  return NextResponse.json(item, { status: 201 });
}
