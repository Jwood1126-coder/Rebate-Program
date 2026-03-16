import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { validateRecord } from "@/lib/validation/validation.service";
import { RECORD_STATUSES, MANUAL_STATUSES } from "@/lib/constants/statuses";
import { auditService } from "@/lib/audit/audit.service";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { deriveRecordStatus } from "@/lib/utils/dates";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const distributor = searchParams.get("distributor");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (distributor) {
    where.rebatePlan = {
      contract: {
        distributor: { code: distributor },
      },
    };
  }

  // Translate status filter to date-based query instead of trusting stored status
  if (status) {
    const now = new Date();
    switch (status) {
      case "active":
        where.startDate = { lte: now };
        where.AND = [
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ];
        where.supersededById = null;
        where.status = { notIn: ["draft", "cancelled"] };
        break;
      case "expired":
        where.endDate = { lt: now };
        where.status = { notIn: ["draft", "cancelled", "superseded"] };
        break;
      case "future":
        where.startDate = { gt: now };
        where.status = { notIn: ["draft", "cancelled", "superseded"] };
        break;
      case "superseded":
        where.supersededById = { not: null };
        break;
      case "draft":
      case "cancelled":
        where.status = status;
        break;
    }
  }

  if (search) {
    const searchConditions = [
      { item: { itemNumber: { contains: search, mode: "insensitive" } } },
      { rebatePlan: { planCode: { contains: search, mode: "insensitive" } } },
      { rebatePlan: { contract: { contractNumber: { contains: search, mode: "insensitive" } } } },
    ];
    if (where.AND) {
      where.AND.push({ OR: searchConditions });
    } else {
      where.OR = searchConditions;
    }
  }

  const [records, total] = await Promise.all([
    prisma.rebateRecord.findMany({
      where,
      include: {
        rebatePlan: {
          include: {
            contract: {
              include: { distributor: true, endUser: true },
            },
          },
        },
        item: true,
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.rebateRecord.count({ where }),
  ]);

  return NextResponse.json({ records, total, page, limit });
}

export async function POST(request: NextRequest) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canEdit(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { rebatePlanId, itemId, rebatePrice, startDate, endDate } = body;

  if (!rebatePlanId || !itemId || rebatePrice === undefined || !startDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const validationResult = await validateRecord(
    {
      rebatePlanId,
      itemId,
      rebatePrice: parseFloat(rebatePrice),
      startDate,
      endDate: endDate || null,
    },
    {
      mode: "create",
      userId: user.id,
    }
  );

  if (!validationResult.valid) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: validationResult.errors,
        warnings: validationResult.warnings,
      },
      { status: 422 }
    );
  }

  // If there are warnings and the client hasn't acknowledged them, return warnings for confirmation
  if (validationResult.warnings.length > 0 && !body.confirmWarnings) {
    return NextResponse.json({
      needsConfirmation: true,
      warnings: validationResult.warnings,
    });
  }

  // Derive initial status from dates rather than always storing "active"
  const parsedStart = new Date(startDate);
  const parsedEnd = endDate ? new Date(endDate) : null;
  const initialStatus = deriveRecordStatus(parsedStart, parsedEnd, null, RECORD_STATUSES.ACTIVE, new Date());

  const record = await prisma.rebateRecord.create({
    data: {
      rebatePlanId,
      itemId,
      rebatePrice: parseFloat(rebatePrice),
      startDate: parsedStart,
      endDate: parsedEnd,
      status: initialStatus,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  await auditService.logCreate(
    "rebate_records",
    record.id,
    {
      rebatePlanId,
      itemId,
      rebatePrice,
      startDate,
      endDate: endDate || null,
      status: initialStatus,
    },
    user.id
  );

  return NextResponse.json(record, { status: 201 });
}
