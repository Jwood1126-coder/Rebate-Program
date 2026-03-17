// Per-distributor column mapping — DB-backed async lookups.
// Server-only: imports prisma directly. Never import this from client components.
//
// Falls back to hardcoded defaults (from column-mappings.ts) when no DB entry exists.

import { prisma } from '@/lib/db/client';
import { HARDCODED_MAPPINGS } from './column-mappings';
import type { ColumnMapping } from './types';

/**
 * Get the column mapping for a distributor, checking DB first then fallback.
 * For claim file type by default.
 */
export async function getColumnMappingAsync(
  distributorCode: string,
  fileType: string = 'claim'
): Promise<ColumnMapping | null> {
  // Try DB first
  const dbMapping = await prisma.distributorColumnMapping.findFirst({
    where: {
      distributor: { code: distributorCode.toUpperCase() },
      fileType,
      isActive: true,
    },
    include: { distributor: { select: { code: true } } },
  });

  if (dbMapping) {
    return {
      distributorCode: dbMapping.distributor.code,
      name: dbMapping.name,
      mappings: dbMapping.mappings as Record<string, string>,
      dateFormat: dbMapping.dateFormat,
      skipColumns: (dbMapping.skipColumns as string[]) || undefined,
    };
  }

  // Fallback to hardcoded (claim type only)
  if (fileType === 'claim') {
    return HARDCODED_MAPPINGS[distributorCode.toUpperCase()] ?? null;
  }

  return null;
}

/**
 * List all configured distributor codes (DB + hardcoded, deduplicated).
 */
export async function getConfiguredDistributorsAsync(): Promise<string[]> {
  const dbMappings = await prisma.distributorColumnMapping.findMany({
    where: { isActive: true, fileType: 'claim' },
    include: { distributor: { select: { code: true } } },
  });

  const dbCodes = dbMappings.map(m => m.distributor.code);
  const hardcodedCodes = Object.keys(HARDCODED_MAPPINGS);

  return [...new Set([...dbCodes, ...hardcodedCodes])];
}
