import { prisma } from "@/lib/db/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;

  const { id } = await params;
  const recordId = parseInt(id);

  const record = await prisma.rebateRecord.findUnique({ where: { id: recordId } });
  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const notes = await prisma.recordNote.findMany({
    where: { rebateRecordId: recordId },
    include: {
      createdBy: { select: { displayName: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(notes);
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
  const recordId = parseInt(id);
  const body = await request.json();

  const record = await prisma.rebateRecord.findUnique({ where: { id: recordId } });
  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const noteText = body.noteText?.trim();
  if (!noteText) {
    return NextResponse.json({ error: "Note text is required" }, { status: 400 });
  }

  const noteType = body.noteType?.trim() || "general";

  const note = await prisma.recordNote.create({
    data: {
      rebateRecordId: recordId,
      noteText,
      noteType,
      createdById: user.id,
    },
    include: {
      createdBy: { select: { displayName: true, username: true } },
    },
  });

  return NextResponse.json(note, { status: 201 });
}
