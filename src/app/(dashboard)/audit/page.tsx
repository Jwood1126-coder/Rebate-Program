import { prisma } from "@/lib/db/client";
import { AuditPageClient } from "@/components/audit/audit-page-client";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const entries = await prisma.auditLog.findMany({
    include: {
      user: { select: { displayName: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const users = await prisma.user.findMany({
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  const serializedEntries = entries.map((e) => ({
    id: Number(e.id),
    action: e.action,
    tableName: e.tableName,
    recordId: e.recordId,
    userName: e.user?.displayName ?? "Unknown",
    createdAt: e.createdAt.toISOString(),
    changedFields: (e.changedFields as Record<string, { old: unknown; new: unknown }>) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brennan-text">Audit Log</h1>
        <p className="mt-1 text-sm text-gray-500">
          Complete history of all data changes
        </p>
      </div>
      <AuditPageClient entries={serializedEntries} uniqueUsers={users} />
    </div>
  );
}
