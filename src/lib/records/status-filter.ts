/**
 * Translates derived record status names into Prisma WHERE conditions.
 *
 * Record status is derived at read time from dates + supersession, not stored
 * directly (except manual statuses: draft, cancelled). This module produces
 * the equivalent SQL-level conditions so that server-side filtering matches
 * the UI badge display. See deriveRecordStatus() in src/lib/utils/dates.ts.
 */

export interface StatusWhereInput {
  supersededById?: null | { not: null };
  status?: string | { notIn: string[] };
  startDate?: { lte?: Date; gt?: Date };
  endDate?: { lt?: Date; gte?: Date };
  OR?: Array<{ endDate: null } | { endDate: { gte: Date } }>;
}

/**
 * Build a Prisma-compatible WHERE fragment for a derived status filter value.
 * `today` parameter is injectable for testing — defaults to midnight of current day.
 */
export function buildStatusWhere(status: string, today?: Date): StatusWhereInput {
  const d = today ?? new Date();
  d.setHours(0, 0, 0, 0);

  switch (status) {
    case 'active':
      // Not superseded, not manual, started on or before today, not yet ended
      return {
        supersededById: null,
        status: { notIn: ['draft', 'cancelled'] },
        startDate: { lte: d },
        OR: [{ endDate: null }, { endDate: { gte: d } }],
      };
    case 'expired':
      // Not superseded, not manual, endDate in the past
      return {
        supersededById: null,
        status: { notIn: ['draft', 'cancelled'] },
        endDate: { lt: d }, // NULL excluded automatically (NULL < date → false in SQL)
      };
    case 'future':
      // Not superseded, not manual, starts after today
      return {
        supersededById: null,
        status: { notIn: ['draft', 'cancelled'] },
        startDate: { gt: d },
      };
    case 'superseded':
      return { supersededById: { not: null } };
    case 'draft':
      return { status: 'draft' };
    case 'cancelled':
      return { status: 'cancelled' };
    default:
      // Fallback for unknown status values — stored column match
      return { status };
  }
}
