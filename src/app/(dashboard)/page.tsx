import Link from "next/link";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Dashboard — operator cockpit: metrics, distributor breakdown, reconciliation status, expiring records, activity
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

  const [
    activeCount,
    totalRecords,
    contractCount,
    itemCount,
    openExceptions,
    expiringRecords,
    distributorCount,
    modifiedCount,
    recentActivity,
    distributors,
    openRuns,
    openEndedCount,
    expiredNotSupersededCount,
    orphanedItemCount,
    reconProgress,
  ] = await Promise.all([
    prisma.rebateRecord.count({ where: activeWhere }),
    prisma.rebateRecord.count(),
    prisma.contract.count(),
    prisma.item.count(),
    prisma.reconciliationIssue.count({ where: { resolution: null } }),

    // Expiring soon
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
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { displayName: true } } },
    }),

    // Per-distributor breakdown
    prisma.distributor.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        _count: { select: { contracts: true } },
        contracts: {
          select: {
            rebatePlans: {
              select: {
                _count: { select: { rebateRecords: true } },
              },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    }),

    // Open reconciliation runs (not committed/cancelled)
    prisma.reconciliationRun.findMany({
      where: { status: { notIn: ["committed", "cancelled"] } },
      include: {
        distributor: { select: { code: true } },
        runBy: { select: { displayName: true } },
        _count: { select: { issues: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),

    // Data quality: open-ended records
    prisma.rebateRecord.count({
      where: { endDate: null, status: { notIn: ["cancelled", "superseded"] } },
    }),

    // Data quality: expired not superseded
    prisma.rebateRecord.count({
      where: { endDate: { lt: now }, supersededById: null, status: { notIn: ["cancelled", "superseded"] } },
    }),

    // Data quality: orphaned items (no active records)
    prisma.item.count({
      where: { rebateRecords: { none: { status: { notIn: ["cancelled", "superseded"] } } } },
    }),

    // Reconciliation progress: distributors with contracts vs completed runs for last month
    (async () => {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const [withContracts, completedRuns] = await Promise.all([
        prisma.distributor.count({
          where: { isActive: true, contracts: { some: {} } },
        }),
        prisma.reconciliationRun.count({
          where: {
            status: { in: ["committed", "reviewed"] },
            claimPeriodStart: { gte: lastMonth },
            claimPeriodEnd: { lte: lastMonthEnd },
          },
        }),
      ]);
      return { withContracts, completedRuns, period: lastMonth };
    })(),
  ]);

  const expiringCount = expiringRecords.length;

  const openExceptionCount = openExceptions;

  // Compute per-distributor record counts from nested data
  const distributorStats = distributors.map((d) => {
    const recordCount = d.contracts.reduce(
      (sum: number, c: typeof d.contracts[number]) =>
        sum + c.rebatePlans.reduce((s: number, p: typeof c.rebatePlans[number]) => s + p._count.rebateRecords, 0),
      0
    );
    return {
      code: d.code,
      name: d.name,
      contracts: d._count.contracts,
      records: recordCount,
    };
  });

  return (
    <div className="space-y-4">
      {/* Row 1: Summary cards — 6 columns */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <MetricCard
          title="Active Records"
          value={activeCount}
          subtitle={`${totalRecords} total`}
          href="/records?status=active"
          accent="green"
        />
        <MetricCard
          title="Contracts"
          value={contractCount}
          href="/records"
          accent="blue"
        />
        <MetricCard
          title="Items"
          value={itemCount}
          href="/records"
          accent="slate"
        />
        <MetricCard
          title="Distributors"
          value={distributorCount}
          href="/distributors"
          accent="indigo"
        />
        <MetricCard
          title="Expiring (30d)"
          value={expiringCount}
          href="/records?status=active"
          accent="amber"
          alert={expiringCount > 0}
        />
        <MetricCard
          title="Reconciled"
          value={reconProgress.completedRuns}
          subtitle={`of ${reconProgress.withContracts} distributors`}
          href="/reconciliation"
          accent={reconProgress.completedRuns >= reconProgress.withContracts ? "green" : "red"}
          alert={reconProgress.completedRuns < reconProgress.withContracts}
        />
      </div>

      {/* Row 2: Distributor breakdown + Data Quality + Claims Pending */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Distributor Breakdown */}
        <div className="rounded-lg border border-brennan-border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-brennan-border px-4 py-3">
            <h2 className="text-sm font-semibold text-brennan-text">Distributor Overview</h2>
            <Link href="/distributors" className="text-xs font-medium text-brennan-blue hover:text-brennan-dark">
              View all
            </Link>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-brennan-border bg-gray-50">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Distributor</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Contracts</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Records</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brennan-border">
              {distributorStats.map((d) => (
                <tr key={d.code} className="hover:bg-brennan-light/40">
                  <td className="px-3 py-2">
                    <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-bold text-brennan-blue">
                      {d.code}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">{d.name}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-brennan-text">
                    {d.contracts}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-brennan-text">
                    {d.records}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/records?distributor=${d.code}`}
                      className="text-xs text-brennan-blue hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {distributorStats.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">
                    No distributors configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Data Quality Summary */}
        <div className="rounded-lg border border-brennan-border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-brennan-border px-4 py-3">
            <h2 className="text-sm font-semibold text-brennan-text">Data Quality</h2>
            <Link href="/data-quality" className="text-xs font-medium text-brennan-blue hover:text-brennan-dark">
              Full scan →
            </Link>
          </div>
          <div className="divide-y divide-brennan-border">
            <DqRow
              label="Open-ended records"
              sublabel="No end date set"
              count={openEndedCount}
              severity={openEndedCount > 10 ? "warn" : "info"}
              href="/data-quality"
            />
            <DqRow
              label="Expired records"
              sublabel="Ended but not superseded"
              count={expiredNotSupersededCount}
              severity={expiredNotSupersededCount > 20 ? "warn" : "info"}
              href="/data-quality"
            />
            <DqRow
              label="Orphaned items"
              sublabel="No active records"
              count={orphanedItemCount}
              severity={orphanedItemCount > 5 ? "warn" : "info"}
              href="/data-quality"
            />
            <DqRow
              label="Open exceptions"
              sublabel="Unresolved claim issues"
              count={openExceptionCount}
              severity={openExceptionCount > 0 ? "alert" : "ok"}
              href="/reconciliation"
            />
          </div>
          <div className="px-4 py-2.5 bg-gray-50 border-t border-brennan-border">
            <Link href="/data-quality" className="text-xs font-medium text-brennan-blue hover:underline">
              Run full duplicate &amp; overlap scan →
            </Link>
          </div>
        </div>

        {/* Claims Pending Review */}
        <div className="rounded-lg border border-brennan-border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-brennan-border px-4 py-3">
            <h2 className="text-sm font-semibold text-brennan-text">Claims Pending Review</h2>
            <Link href="/reconciliation" className="text-xs font-medium text-brennan-blue hover:text-brennan-dark">
              View all
            </Link>
          </div>
          {openRuns.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-400">No claims pending review.</p>
              <p className="mt-1 text-xs text-gray-400">
                Upload a distributor claim file on the{" "}
                <Link href="/reconciliation" className="text-brennan-blue hover:underline">Reconciliation</Link> page.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-brennan-border bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Distributor</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Period</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brennan-border">
                {openRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-brennan-light/40">
                    <td className="px-3 py-2">
                      <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-bold text-brennan-blue">
                        {run.distributor.code}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-brennan-text">
                      {formatDate(run.claimPeriodStart)} – {formatDate(run.claimPeriodEnd)}
                    </td>
                    <td className="px-3 py-2">
                      <RunStatusBadge status={run.status} />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-medium">
                      {run._count.issues > 0 ? (
                        <span className="text-amber-600">{run._count.issues}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row 3: Expiring records + Recent Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Expiring Soon */}
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
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">End User</th>
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
                      <td className="px-3 py-2 text-sm text-gray-500">{r.rebatePlan.contract.endUser.name}</td>
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
                      <span className="font-medium">{friendlyTableName(entry.tableName)}</span>{" "}
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

      {/* Row 4: Quick Actions */}
      <div className="rounded-lg border border-brennan-border bg-white shadow-sm">
        <div className="border-b border-brennan-border px-4 py-3">
          <h2 className="text-sm font-semibold text-brennan-text">Quick Actions</h2>
        </div>
        <div className="flex flex-wrap gap-3 px-4 py-3">
          <QuickAction href="/contracts/new" label="Create Contract" icon="+" />
          <QuickAction href="/reconciliation" label="New Reconciliation" icon="⇄" />
          <QuickAction href="/records" label="Browse Records" icon="☰" />
          <QuickAction href="/audit" label="Audit Log" icon="◷" />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  href,
  accent,
  alert,
}: {
  title: string;
  value: number;
  subtitle?: string;
  href: string;
  accent: "green" | "amber" | "blue" | "slate" | "indigo" | "red" | "gray";
  alert?: boolean;
}) {
  const borderColor = {
    green: "border-l-green-500",
    amber: "border-l-amber-500",
    blue: "border-l-brennan-blue",
    slate: "border-l-slate-500",
    indigo: "border-l-indigo-500",
    red: "border-l-red-500",
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
      {subtitle && (
        <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
      )}
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

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    staged: "bg-blue-100 text-blue-700",
    running: "bg-yellow-100 text-yellow-700",
    review: "bg-amber-100 text-amber-700",
    reviewed: "bg-indigo-100 text-indigo-700",
    committed: "bg-green-100 text-green-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-600",
  };
  const labels: Record<string, string> = {
    reviewed: "ready to commit",
    committed: "committed",
  };

  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold capitalize ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-brennan-border px-4 py-2.5 text-sm font-medium text-brennan-text transition-colors hover:bg-brennan-light hover:border-brennan-blue"
    >
      <span className="text-base text-brennan-blue">{icon}</span>
      {label}
    </Link>
  );
}

function DqRow({ label, sublabel, count, severity, href }: {
  label: string;
  sublabel: string;
  count: number;
  severity: "ok" | "info" | "warn" | "alert";
  href: string;
}) {
  const dotColor = {
    ok: "bg-green-500",
    info: "bg-gray-400",
    warn: "bg-amber-500",
    alert: "bg-red-500",
  }[severity];

  return (
    <Link href={href} className="flex items-center justify-between px-4 py-2.5 hover:bg-brennan-light/40 transition-colors">
      <div className="flex items-center gap-2.5">
        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
        <div>
          <p className="text-sm text-brennan-text">{label}</p>
          <p className="text-xs text-gray-400">{sublabel}</p>
        </div>
      </div>
      <span className={`text-sm font-bold ${severity === "alert" ? "text-red-600" : severity === "warn" ? "text-amber-600" : "text-brennan-text"}`}>
        {count}
      </span>
    </Link>
  );
}

function friendlyTableName(table: string): string {
  const map: Record<string, string> = {
    rebate_records: "Record",
    contracts: "Contract",
    rebate_plans: "Plan",
    items: "Item",
    distributors: "Distributor",
    end_users: "End User",
    reconciliation_runs: "Recon Run",
    reconciliation_issues: "Exception",
    claim_rows: "Claim Row",
  };
  return map[table] ?? table;
}
