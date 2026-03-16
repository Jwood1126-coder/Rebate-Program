import { prisma } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { AUDIT_ACTIONS } from "@/lib/constants/statuses";
import { computeFieldDiff, computeInsertSnapshot } from "./diff";

/**
 * Audit logging service. Append-only — no update or delete operations.
 * Every write on business tables must call one of these methods.
 */
export const auditService = {
  async logCreate(
    tableName: string,
    recordId: number,
    record: Record<string, unknown>,
    userId: number,
    ipAddress?: string
  ) {
    await prisma.auditLog.create({
      data: {
        tableName,
        recordId,
        action: AUDIT_ACTIONS.INSERT,
        changedFields: computeInsertSnapshot(record) as unknown as Prisma.InputJsonValue,
        userId,
        ipAddress: ipAddress ?? null,
      },
    });
  },

  async logUpdate(
    tableName: string,
    recordId: number,
    oldRecord: Record<string, unknown>,
    newRecord: Record<string, unknown>,
    userId: number,
    ipAddress?: string
  ) {
    const diff = computeFieldDiff(oldRecord, newRecord);

    // Only log if there are actual changes
    if (Object.keys(diff).length === 0) return;

    await prisma.auditLog.create({
      data: {
        tableName,
        recordId,
        action: AUDIT_ACTIONS.UPDATE,
        changedFields: diff as unknown as Prisma.InputJsonValue,
        userId,
        ipAddress: ipAddress ?? null,
      },
    });
  },

  async logDelete(
    tableName: string,
    recordId: number,
    oldRecord: Record<string, unknown>,
    newRecord: Record<string, unknown>,
    userId: number,
    ipAddress?: string
  ) {
    const diff = computeFieldDiff(oldRecord, newRecord);
    await prisma.auditLog.create({
      data: {
        tableName,
        recordId,
        action: AUDIT_ACTIONS.DELETE,
        changedFields: Object.keys(diff).length > 0
          ? (diff as unknown as Prisma.InputJsonValue)
          : ({ status: { old: oldRecord.status ?? null, new: "cancelled" } } as unknown as Prisma.InputJsonValue),
        userId,
        ipAddress: ipAddress ?? null,
      },
    });
  },

  async getHistoryForRecord(tableName: string, recordId: number) {
    return prisma.auditLog.findMany({
      where: { tableName, recordId },
      include: { user: { select: { displayName: true, username: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  async getGlobalHistory(params: {
    page?: number;
    limit?: number;
    userId?: number;
    tableName?: string;
    action?: string;
  }) {
    const { page = 1, limit = 50, userId, tableName, action } = params;

    const where = {
      ...(userId && { userId }),
      ...(tableName && { tableName }),
      ...(action && { action }),
    };

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { displayName: true, username: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },
};
