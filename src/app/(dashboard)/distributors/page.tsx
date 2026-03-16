import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { deriveRecordStatus } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function DistributorsPage() {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const rawDistributors = await prisma.distributor.findMany({
    where: { isActive: true },
    include: {
      contracts: {
        include: {
          endUser: { select: { name: true } },
          rebatePlans: {
            include: {
              rebateRecords: {
                select: { id: true, startDate: true, endDate: true, supersededById: true, status: true, updatedAt: true },
              },
            },
          },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  const distributors = rawDistributors.map((d) => {
    const allRecords = d.contracts.flatMap((c) =>
      c.rebatePlans.flatMap((p) => p.rebateRecords)
    );
    const activeRecords = allRecords.filter(
      (r) => deriveRecordStatus(r.startDate, r.endDate, r.supersededById, r.status, now) === "active"
    ).length;
    const expiringRecords = allRecords.filter((r) => {
      const status = deriveRecordStatus(r.startDate, r.endDate, r.supersededById, r.status, now);
      return status === "active" && r.endDate && r.endDate >= now && r.endDate <= thirtyDaysFromNow;
    }).length;
    const latestUpdate = allRecords.length > 0
      ? new Date(Math.max(...allRecords.map((r) => r.updatedAt.getTime())))
      : null;

    return {
      id: d.id,
      code: d.code,
      name: d.name,
      contractCount: d.contracts.length,
      totalRecords: allRecords.length,
      activeRecords,
      expiringRecords,
      latestUpdate,
      contracts: d.contracts.map((c) => ({
        contractNumber: c.contractNumber,
        endUser: c.endUser.name,
        recordCount: c.rebatePlans.reduce((sum, p) => sum + p.rebateRecords.length, 0),
      })),
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-brennan-text">Distributors</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {distributors.length} active distributors
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {distributors.map((d) => (
          <Link
            key={d.id}
            href={`/records?distributor=${d.code}`}
            className="group rounded-lg border border-brennan-border bg-white p-4 shadow-sm transition-all hover:border-brennan-blue hover:shadow-md"
          >
            {/* Distributor header */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brennan-blue text-sm font-bold text-white">
                {d.code.substring(0, 3)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brennan-text group-hover:text-brennan-blue">
                  {d.name}
                </p>
                <p className="text-xs text-gray-400">{d.code}</p>
              </div>
            </div>

            {/* Metrics row */}
            <div className="mt-3 flex items-center gap-4 border-t border-brennan-border/50 pt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-brennan-text">{d.activeRecords}</p>
                <p className="text-xs text-gray-400">Active</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-brennan-text">{d.totalRecords}</p>
                <p className="text-xs text-gray-400">Total</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-brennan-text">{d.contractCount}</p>
                <p className="text-xs text-gray-400">Contracts</p>
              </div>
              {d.expiringRecords > 0 && (
                <div className="text-center">
                  <p className="text-lg font-bold text-amber-600">{d.expiringRecords}</p>
                  <p className="text-xs text-amber-500">Expiring</p>
                </div>
              )}
            </div>

            {/* Contracts */}
            <div className="mt-3 space-y-1">
              {d.contracts.slice(0, 3).map((c) => (
                <div key={c.contractNumber} className="flex items-center justify-between text-xs text-gray-500">
                  <span className="truncate">
                    <span className="font-medium text-brennan-text">{c.contractNumber}</span>
                    {" "}&middot; {c.endUser}
                  </span>
                  <span className="shrink-0 text-gray-400">{c.recordCount} rec</span>
                </div>
              ))}
              {d.contracts.length > 3 && (
                <p className="text-xs text-gray-400">+{d.contracts.length - 3} more</p>
              )}
            </div>

            {/* Last updated */}
            {d.latestUpdate && (
              <p className="mt-2 text-xs text-gray-400">
                Updated {formatDate(d.latestUpdate)}
              </p>
            )}
          </Link>
        ))}
      </div>

      {distributors.length === 0 && (
        <div className="rounded-lg border border-brennan-border bg-white py-12 text-center text-sm text-gray-400 shadow-sm">
          No active distributors.
        </div>
      )}
    </div>
  );
}
