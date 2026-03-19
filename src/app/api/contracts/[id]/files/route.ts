import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";

/**
 * GET /api/contracts/:id/files — List all files for a contract
 * POST /api/contracts/:id/files — Upload a file to a contract
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;

  const { id } = await params;
  const contractId = Number(id);
  if (isNaN(contractId)) {
    return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
  }

  const files = await prisma.contractFile.findMany({
    where: { contractId },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      mimeType: true,
      description: true,
      uploadedAt: true,
      uploadedBy: { select: { displayName: true } },
    },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json(files);
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
  const contractId = Number(id);
  if (isNaN(contractId)) {
    return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
  }

  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const fileType = (formData.get("fileType") as string) || "contract";
  const description = formData.get("description") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Shared file guardrails (size + type)
  const { validateFileForStorage } = await import("@/lib/constants/file-limits");
  const validationError = validateFileForStorage(file.name, file.size);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Validate fileType against known values
  const VALID_FILE_TYPES = ["contract", "update", "spa", "claim", "document"];
  const safeFileType = VALID_FILE_TYPES.includes(fileType) ? fileType : "document";

  const buffer = Buffer.from(await file.arrayBuffer());

  const stored = await prisma.contractFile.create({
    data: {
      contractId,
      fileName: file.name,
      fileType: safeFileType,
      fileSize: buffer.length,
      mimeType: file.type || "application/octet-stream",
      fileData: buffer,
      description,
      uploadedById: user.id,
    },
    select: { id: true, fileName: true, fileType: true, fileSize: true, uploadedAt: true },
  });

  return NextResponse.json(stored, { status: 201 });
}
