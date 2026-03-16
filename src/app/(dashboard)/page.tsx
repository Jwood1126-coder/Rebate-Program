import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { deriveRecordStatus } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Dashboard — operator cockpit: metrics, expiring records, recent changes
export default async function DashboardPage() {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const activeWhere = {
    startDate: { lte: now },
    OR: [{ endDate: null }, { endDate: { gte: now } }],
    supersededById: null,
    status: { notIn: ["draft", "cancelled"] },
  };

  const [activeCount, expiringRecords, distributorCount, modifiedCount, recentActivity] =
    await Promise.all([
      prisma.rebateRecord.count({ where: activeWhere }),

      // Expiring soon — get actual records, not just count
      prisma.rebateRecord.findMany({
        where: {
          ...activeWhere,
          endDate: { gte: now, lte: thirtyDaysFromNow },
        },
        include: {
          rebatePlan: {
            include: {
              contract: {
                include: {
                  distributor: { select: { code: true } },
                  endUser: { select: { name: true } },
                },
              },
            },
          },
          item: { select: { itemNumber: true } },
        },
        orderBy: { endDate: "asc" },
        take: 10,
      }),

      prisma.distributor.count({ where: { isActive: true } }),

      prisma.rebateRecord.count({ where: { updatedAt: { gte: sevenDaysAgo } } }),

      prisma.auditLog.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { displayName: true } } },
      }),
    ]);

  const expiringCount = expiringRecords.length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          title="Active Records"
          value={activeCount}
          href="/records?status=active"
          accent="green"
        />
        <MetricCard
          title="Expiring Soon"
          value={expiringCount}
          href="/records?status=active"
          accent="amber"
          alert={expiringCount > 0}
        />
        <MetricCard
          title="Distributors"
          value={distributorCount}
          href="/distributors"
          accent="blue"
        />
        <MetricCard
          title="Modified (7d)"
          value={modifiedCount}
          href="/records"
          accent="gray"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Expiring Soon — takes more space, this is actionable */}
        <div className="lg:col-span-3 rounded-lg border border-brennan-border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-brennan-border px-4 py-3">
            <h2 className="text-sm font-semibold text-brennan-text">
              Expiring Within 30 Days
            </h2>
            {expiringCount > 0 && (
              <Link href="/records?status=active" className="text-xs font-medium text-brennan-blue hover:text-brennan-dark">
                View all
              </Link>
            )}
          </div>
          {expiringRecords.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No records expiring in the next 30 days.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-brennan-border bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Distributor</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Contract</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Item</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Price</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brennan-border">
                {expiringRecords.map((r) => {
                  const daysLeft = r.endDate
                    ? Math.ceil((r.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                  return (
                    <tr key={r.id} className="hover:bg-brennan-light/40">
                      <td className="px-3 py-2">
                        <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-bold text-brennan-blue">
                          {r.rebatePlan.contract.distributor.code}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-brennan-text">{r.rebatePlan.contract.contractNumber}</td>
                      <td className="px-3 py-2 font-mono text-sm text-brennan-text">{r.item.itemNumber}</td>
                      <td className="px-3 py-2 text-right text-sm font-medium text-brennan-text">${r.rebatePrice.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium ${daysLeft !== null && daysLeft <= 7 ? "text-red-600" : "text-amber-600"}`}>
                          {r.endDate ? formatDate(r.endDate) : "—"}
                          {daysLeft !== null && (
                            <span className="ml-1 text-gray-400">({daysLeft}d)</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 rounded-lg border border-brennan-border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-brennan-border px-4 py-3">
            <h2 className="text-sm font-semibold text-brennan-text">Recent Activity</h2>
            <Link href="/audit" className="text-xs font-medium text-brennan-blue hover:text-brennan-dark">
              View all
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No activity yet.
            </div>
          ) : (
            <ul className="divide-y divide-brennan-border">
              {recentActivity.map((entry) => (
                <li
                  key={entry.id.toString()}
                  className="flex items-start justify-between gap-2 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-brennan-text">
                      <ActionBadge action={entry.action} />{" "}
                      <span className="font-medium">{entry.tableName}</span>{" "}
                      <span className="text-gray-400">#{entry.recordId}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {entry.user.displayName}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-gray-400">
                    {formatDateTime(entry.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  href,
  accent,
  alert,
}: {
  title: string;
  value: number;
  href: string;
  accent: "green" | "amber" | "blue" | "gray";
  alert?: boolean;
}) {
  const borderColor = {
    green: "border-l-green-500",
    amber: "border-l-amber-500",
    blue: "border-l-brennan-blue",
    gray: "border-l-gray-400",
  }[accent];

  return (
    <Link
      href={href}
      className={`group rounded-lg border border-brennan-border border-l-4 ${borderColor} bg-white p-4 shadow-sm transition-all hover:shadow-md`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${alert ? "text-amber-600" : "text-brennan-text"}`}>
        {value.toLocaleString()}
      </p>
    </Link>
  );
}

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    INSERT: "bg-green-100 text-green-700",
    UPDATE: "bg-blue-100 text-blue-700",
    DELETE: "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${styles[action] ?? "bg-gray-100 text-gray-700"}`}>
      {action}
    </span>
  );
}
