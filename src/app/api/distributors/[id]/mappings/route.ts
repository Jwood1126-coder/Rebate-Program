// CRUD for per-distributor column mappings.
// GET — list all mappings for a distributor
// POST — create or update a mapping for a distributor + file type

import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const distributorId = parseInt(id);
  if (isNaN(distributorId)) {
    return NextResponse.json({ error: "Invalid distributor ID" }, { status: 400 });
  }

  const mappings = await prisma.distributorColumnMapping.findMany({
    where: { distributorId },
    orderBy: { fileType: "asc" },
  });

  return NextResponse.json(mappings);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canEdit(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const distributorId = parseInt(id);
  if (isNaN(distributorId)) {
    return NextResponse.json({ error: "Invalid distributor ID" }, { status: 400 });
  }

  const body = await request.json();
  const { fileType, name, mappings, dateFormat, skipColumns, sampleHeaders } = body;

  if (!fileType || !name || !mappings) {
    return NextResponse.json(
      { error: "fileType, name, and mappings are required" },
      { status: 400 }
    );
  }

  // Upsert: one mapping per distributor + file type
  const existing = await prisma.distributorColumnMapping.findFirst({
    where: { distributorId, fileType },
  });

  if (existing) {
    const updated = await prisma.distributorColumnMapping.update({
      where: { id: existing.id },
      data: {
        name,
        mappings,
        dateFormat: dateFormat || "M/d/yyyy",
        skipColumns: skipColumns || null,
        sampleHeaders: sampleHeaders || null,
      },
    });

    await auditService.logUpdate(
      "distributor_column_mappings",
      updated.id,
      { mappings: existing.mappings, name: existing.name, dateFormat: existing.dateFormat },
      { mappings, name, dateFormat: dateFormat || "M/d/yyyy" },
      user.id
    );

    return NextResponse.json(updated);
  }

  const created = await prisma.distributorColumnMapping.create({
    data: {
      distributorId,
      fileType,
      name,
      mappings,
      dateFormat: dateFormat || "M/d/yyyy",
      skipColumns: skipColumns || null,
      sampleHeaders: sampleHeaders || null,
    },
  });

  await auditService.logCreate("distributor_column_mappings", created.id, {
    distributorId,
    fileType,
    name,
  }, user.id);

  return NextResponse.json(created, { status: 201 });
}
