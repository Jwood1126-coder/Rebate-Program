// Detect column headers from an uploaded sample file.
// POST with multipart form data containing a file.
// Returns: { headers: string[], suggestedMappings: Record<string, string> }

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { STANDARD_FIELD_LABELS, suggestMappings } from "@/lib/reconciliation/mapping-utils";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return NextResponse.json({ error: "File contains no sheets" }, { status: 400 });
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
      defval: null,
      raw: false,
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: "File contains no data rows" }, { status: 400 });
    }

    const headers = Object.keys(rows[0]);
    const suggested = suggestMappings(headers);

    // Include a few sample values for each header to help the user
    const sampleData: Record<string, string[]> = {};
    for (const header of headers) {
      sampleData[header] = rows
        .slice(0, 3)
        .map((row) => {
          const val = row[header];
          return val != null ? String(val).substring(0, 50) : "";
        })
        .filter(Boolean);
    }

    return NextResponse.json({
      headers,
      suggestedMappings: suggested,
      sampleData,
      standardFields: STANDARD_FIELD_LABELS,
      totalRows: rows.length,
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse file" }, { status: 400 });
  }
}
