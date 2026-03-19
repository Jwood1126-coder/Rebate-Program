import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { ContractStatusTable } from "@/components/dashboard/contract-status-table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();

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
    openExceptions,
    pendingReviewContracts,
  ] = await Promise.all([
    prisma.rebateRecord.count({ where: activeWhere }),
    prisma.rebateRecord.count(),
    prisma.contract.count({ where: { status: { notIn: ["cancelled"] } } }),
    prisma.reconciliationIssue.count({ where: { resolution: null } }),
    prisma.contract.count({ where: { status: "pending_review" } }),
  ]);

  return (
    <div className="space-y-4">
      {/* Summary cards — 4 key metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          title="Contracts"
          value={contractCount}
          subtitle={pendingReviewContracts > 0 ? `${pendingReviewContracts} pending review` : undefined}
          href="/contracts"
          accent="blue"
          alert={pendingReviewContracts > 0}
        />
        <MetricCard
          title="Active Records"
          value={activeCount}
          subtitle={`${totalRecords} total`}
          href="/records?status=active"
          accent="green"
        />
        <MetricCard
          title="Open Exceptions"
          value={openExceptions}
          href="/reconciliation"
          accent={openExceptions > 0 ? "red" : "green"}
          alert={openExceptions > 0}
        />
        <MetricCard
          title="Pending Review"
          value={pendingReviewContracts}
          href="/contracts?status=pending_review"
          accent={pendingReviewContracts > 0 ? "amber" : "green"}
          alert={pendingReviewContracts > 0}
        />
      </div>

      {/* Contract Status — the main operational view */}
      <ContractStatusTable />

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <QuickAction href="/contracts/new" label="Create Contract" />
        <QuickAction href="/reconciliation" label="Reconciliation" />
        <QuickAction href="/records" label="Browse Records" />
        <QuickAction href="/audit" label="Audit Log" />
        <QuickAction href="/data-quality" label="Data Quality" />
        <QuickAction href="/test-data" label="Test Data" />
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
  accent: "green" | "amber" | "blue" | "red";
  alert?: boolean;
}) {
  const borderColor = {
    green: "border-l-green-500",
    amber: "border-l-amber-500",
    blue: "border-l-brennan-blue",
    red: "border-l-red-500",
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

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-brennan-border px-4 py-2 text-sm font-medium text-brennan-text transition-colors hover:bg-brennan-light hover:border-brennan-blue"
    >
      {label}
    </Link>
  );
}
