import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Only allow .xlsx and .csv downloads — prevents path traversal to arbitrary files
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.csv']);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Guard: extension must be .xlsx or .csv
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Guard: no path traversal (reject slashes, .., etc.)
  if (filename !== path.basename(filename)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // sample-* files live in public/ root, everything else in public/test-data/
  const filePath = filename.startsWith('sample-')
    ? path.join(process.cwd(), 'public', filename)
    : path.join(process.cwd(), 'public', 'test-data', filename);

  try {
    const buffer = await readFile(filePath);
    const contentType = ext === '.csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
