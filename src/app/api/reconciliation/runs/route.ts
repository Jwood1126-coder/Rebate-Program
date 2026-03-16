// GET /api/reconciliation/runs — List reconciliation runs.

import { NextRequest, NextResponse } from 'next/server';
import { listReconciliationRuns } from '@/lib/reconciliation/staging.service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const distributorId = searchParams.get('distributorId');
  const status = searchParams.get('status');

  const runs = await listReconciliationRuns({
    distributorId: distributorId ? parseInt(distributorId) : undefined,
    status: status || undefined,
  });

  return NextResponse.json(runs);
}
