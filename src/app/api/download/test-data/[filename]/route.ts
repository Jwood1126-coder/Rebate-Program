import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const ALLOWED_FILES = new Set([
  'ait-contract-104040.xlsx',
  'fas-spa-bayshore-2026.xlsx',
  'motion-contract-linkbelt-2026.xlsx',
  'fas-claim-feb2026.xlsx',
  'fas-pos-feb2026.xlsx',
  'motion-pos-feb2026.xlsx',
  'sample-motion-claim-feb2026.xlsx',
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  if (!ALLOWED_FILES.has(filename)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // sample-motion-claim is in public/ root, others in public/test-data/
  const filePath = filename.startsWith('sample-')
    ? path.join(process.cwd(), 'public', filename)
    : path.join(process.cwd(), 'public', 'test-data', filename);

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
