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
import { prisma } from '@/lib/db/client';
import { CONTRACT_TYPES } from '@/lib/constants/statuses';
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
  const customerNumber = formData.get('customerNumber') ? String(formData.get('customerNumber')) : undefined;
  const contractType = String(formData.get('contractType') || 'fixed_term');
  const noticePeriodDays = formData.get('noticePeriodDays') ? Number(formData.get('noticePeriodDays')) : undefined;
  const startDate = String(formData.get('startDate') || '');
  const endDate = formData.get('endDate') ? String(formData.get('endDate')) : undefined;

  if (!distributorId || !endUserId) {
    return NextResponse.json({ error: 'Distributor and end user are required' }, { status: 400 });
  }
  if (!startDate) {
    return NextResponse.json({ error: 'Start date is required' }, { status: 400 });
  }

  // Validate contract type — same invariants as direct contract API
  const validTypes: string[] = Object.values(CONTRACT_TYPES);
  if (!validTypes.includes(contractType)) {
    return NextResponse.json(
      { error: `Invalid contract type. Must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    );
  }
  if (contractType === CONTRACT_TYPES.FIXED_TERM && !endDate) {
    return NextResponse.json(
      { error: 'Fixed-term contracts require an end date.' },
      { status: 400 }
    );
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
    customerNumber,
    contractType,
    noticePeriodDays,
    startDate,
    endDate,
  };

  if (isPreview) {
    const result = await previewSimpleImport(fileBuffer, fileName, context, columnMapping);
    return NextResponse.json(result);
  }

  const result = await commitSimpleImport(fileBuffer, fileName, context, sessionResult.user.id, columnMapping);

  // Store the original file on successful import (with shared guardrails)
  if (result.success && result.contractId) {
    let fileStorageWarning: string | undefined;
    const { validateFileForStorage } = await import('@/lib/constants/file-limits');
    const fileValidation = validateFileForStorage(fileName, fileBuffer.length);
    if (fileValidation) {
      fileStorageWarning = `Original file not archived: ${fileValidation}`;
    } else try {
      await prisma.contractFile.create({
        data: {
          contractId: result.contractId,
          fileName: fileName,
          fileType: 'contract',
          fileSize: fileBuffer.length,
          mimeType: file.type || 'application/octet-stream',
          fileData: fileBuffer,
          description: 'Original contract upload',
          uploadedById: sessionResult.user.id,
        },
      });
    } catch {
      // File storage failure should not block contract creation, but warn the user
      fileStorageWarning = 'Original file could not be saved for reference. The contract was created successfully, but the source file was not archived.';
    }

    if (fileStorageWarning) {
      return NextResponse.json({ ...result, fileStorageWarning }, { status: 201 });
    }
  }

  return NextResponse.json(result, { status: result.success ? 201 : 400 });
}
