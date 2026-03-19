import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { auditService } from "@/lib/audit/audit.service";

/**
 * GET /api/contracts/:id/files/:fileId — Download a stored file
 * DELETE /api/contracts/:id/files/:fileId — Delete a stored file
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;

  const { id, fileId } = await params;
  const contractId = Number(id);
  const fid = Number(fileId);

  if (isNaN(contractId) || isNaN(fid)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const file = await prisma.contractFile.findFirst({
    where: { id: fid, contractId },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return new NextResponse(file.fileData, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Content-Length": String(file.fileSize),
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  if (!canEdit(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id, fileId } = await params;
  const contractId = Number(id);
  const fid = Number(fileId);

  if (isNaN(contractId) || isNaN(fid)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const file = await prisma.contractFile.findFirst({
    where: { id: fid, contractId },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Auto-stored files (contract imports, update uploads) get extra protection:
  // they are always audit-logged so there is a record of the deletion.
  const isAutoStored = file.fileType === "contract" || file.fileType === "update";

  await prisma.contractFile.delete({ where: { id: fid } });

  // Audit log the deletion — especially important for auto-stored files,
  // but we log all file deletions for traceability.
  await auditService.logDelete(
    "contract_files",
    fid,
    {
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      contractId: file.contractId,
      description: file.description,
      autoStored: isAutoStored,
    },
    {
      fileName: file.fileName,
      fileType: file.fileType,
      status: "deleted",
    },
    user.id
  );

  return NextResponse.json({ success: true });
}
