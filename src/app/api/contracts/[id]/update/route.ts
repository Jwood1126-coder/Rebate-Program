import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/auth/roles";
import { FILE_MODES } from "@/lib/constants/statuses";
import {
  stageContractUpdate,
  type ContractUpdateInput,
} from "@/lib/contracts/contract-update.service";
import {
  readContractFileHeaders,
  type ContractColumnMapping,
} from "@/lib/contracts/contract-import.service";

/**
 * POST /api/contracts/:id/update
 *
 * Upload a file to diff against an existing contract.
 * Query params:
 *   ?headers=true — read file headers only (for column mapping UI)
 *   (default)     — stage a contract update run
 *
 * Form data:
 *   file (required)
 *   fileMode: "snapshot" | "delta" (required)
 *   effectiveDate: ISO date (optional)
 *   planCode: string (optional, for multi-plan contracts)
 *   itemNumberColumn: string (optional, user-confirmed mapping)
 *   priceColumn: string (optional, user-confirmed mapping)
 */
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

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;

  const { searchParams } = new URL(request.url);

  // Headers-only mode
  if (searchParams.get("headers") === "true") {
    const headerResult = readContractFileHeaders(fileBuffer, fileName);
    if ("error" in headerResult) {
      return NextResponse.json({ error: headerResult.error }, { status: 422 });
    }
    return NextResponse.json(headerResult);
  }

  // Stage mode — validate required fields
  const fileMode = String(formData.get("fileMode") || "");
  const validModes: string[] = Object.values(FILE_MODES);
  if (!validModes.includes(fileMode)) {
    return NextResponse.json(
      { error: `fileMode is required. Must be one of: ${validModes.join(", ")}` },
      { status: 400 }
    );
  }

  const effectiveDateRaw = formData.get("effectiveDate") ? String(formData.get("effectiveDate")) : undefined;
  let effectiveDate: string | undefined;
  if (effectiveDateRaw) {
    // Validate ISO date format (YYYY-MM-DD)
    const parsed = new Date(effectiveDateRaw);
    if (isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDateRaw)) {
      return NextResponse.json(
        { error: `Invalid effectiveDate "${effectiveDateRaw}". Must be a valid ISO date (YYYY-MM-DD).` },
        { status: 400 }
      );
    }
    // Future effective dates are not yet supported — the current data model
    // cannot represent future-effective supersession without immediately
    // marking the old record as superseded, which would remove it from
    // active views before the new record takes effect.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed > today) {
      return NextResponse.json(
        { error: "Future effective dates are not yet supported. Effective date must be today or earlier." },
        { status: 400 }
      );
    }
    effectiveDate = effectiveDateRaw;
  }
  const planCode = formData.get("planCode") ? String(formData.get("planCode")) : undefined;

  // Column mapping
  const itemNumberColumn = formData.get("itemNumberColumn") ? String(formData.get("itemNumberColumn")) : undefined;
  const priceColumn = formData.get("priceColumn") ? String(formData.get("priceColumn")) : undefined;
  const columnMapping: ContractColumnMapping | undefined =
    itemNumberColumn && priceColumn ? { itemNumberColumn, priceColumn } : undefined;

  const input: ContractUpdateInput = {
    contractId,
    fileMode: fileMode as "snapshot" | "delta",
    effectiveDate,
    columnMapping,
    planCode,
  };

  const stageResult = await stageContractUpdate(fileBuffer, fileName, input, user.id);

  return NextResponse.json(stageResult, {
    status: stageResult.success ? 201 : 400,
  });
}
