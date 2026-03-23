import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";

/**
 * GET /api/contracts/:id/files/latest
 *
 * Downloads the most recently uploaded contract or update file.
 * Returns the actual file (not JSON) for direct browser download.
 * Returns 404 if no files exist for this contract.
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

  // Find the most recent contract or update file (not generic documents)
  const file = await prisma.contractFile.findFirst({
    where: {
      contractId,
      fileType: { in: ["contract", "update", "spa"] },
    },
    orderBy: { uploadedAt: "desc" },
  });

  if (!file) {
    return NextResponse.json(
      { error: "No contract document found. Upload a contract file first." },
      { status: 404 }
    );
  }

  return new NextResponse(file.fileData, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Content-Length": String(file.fileSize),
    },
  });
}
