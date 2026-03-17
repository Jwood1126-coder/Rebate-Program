// POST /api/contracts/import — Upload and import contract setup data from Excel/CSV.
//
// Two modes:
//   1. Simple (default): file + context fields + column mapping in form data
//   2. Legacy: Multi-column file with all data embedded (distributorCode, endUser, etc.)
//
// Query params:
//   ?preview=true  — parse and return preview without creating anything
//   ?headers=true  — read file headers only (for column mapping UI)
//   ?mode=legacy   — use the old multi-column parser
//   (default)      — simple mode with user-confirmed column mapping

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';
import {
  previewContractImport,
  commitContractImport,
  previewSimpleImport,
  commitSimpleImport,
  readContractFileHeaders,
  type SimpleImportContext,
  type ContractColumnMapping,
} from '@/lib/contracts/contract-import.service';

export async function POST(request: NextRequest) {
  // Auth check
  const sessionResult = await getSessionUser();
  if ('error' in sessionResult) return sessionResult.error;
  if (!canEdit(sessionResult.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;

  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get('preview') === 'true';
  const isHeaders = searchParams.get('headers') === 'true';
  const mode = searchParams.get('mode') || 'simple';

  // Headers-only mode: read file headers for column mapping UI
  if (isHeaders) {
    const result = readContractFileHeaders(fileBuffer, fileName);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json(result);
  }

  // Legacy multi-column mode
  if (mode === 'legacy') {
    if (isPreview) {
      const result = await previewContractImport(fileBuffer, fileName);
      return NextResponse.json(result);
    }
    const result = await commitContractImport(fileBuffer, fileName, sessionResult.user.id);
    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  }

  // Simple mode: context fields come from form data
  const distributorId = Number(formData.get('distributorId'));
  const endUserId = Number(formData.get('endUserId'));
  const planCode = String(formData.get('planCode') || 'DEFAULT');
  const planName = formData.get('planName') ? String(formData.get('planName')) : undefined;
  const discountType = String(formData.get('discountType') || 'part');
  const description = formData.get('description') ? String(formData.get('description')) : undefined;
  const startDate = String(formData.get('startDate') || '');
  const endDate = formData.get('endDate') ? String(formData.get('endDate')) : undefined;

  if (!distributorId || !endUserId) {
    return NextResponse.json({ error: 'Distributor and end user are required' }, { status: 400 });
  }
  if (!startDate) {
    return NextResponse.json({ error: 'Start date is required' }, { status: 400 });
  }

  // Column mapping from user confirmation
  const itemNumberColumn = formData.get('itemNumberColumn') ? String(formData.get('itemNumberColumn')) : undefined;
  const priceColumn = formData.get('priceColumn') ? String(formData.get('priceColumn')) : undefined;

  const columnMapping: ContractColumnMapping | undefined =
    itemNumberColumn && priceColumn
      ? { itemNumberColumn, priceColumn }
      : undefined;

  const context: SimpleImportContext = {
    distributorId,
    endUserId,
    planCode,
    planName,
    discountType,
    description,
    startDate,
    endDate,
  };

  if (isPreview) {
    const result = await previewSimpleImport(fileBuffer, fileName, context, columnMapping);
    return NextResponse.json(result);
  }

  const result = await commitSimpleImport(fileBuffer, fileName, context, sessionResult.user.id, columnMapping);
  return NextResponse.json(result, { status: result.success ? 201 : 400 });
}
