"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ContractRow {
  id: number;
  contractNumber: string;
  customerNumber: string | null;
  contractType: string;
  contractStatus: string;
  distributor: { code: string; name: string };
  endUser: { code: string | null; name: string };
  recordCount: number;
  lastReviewedAt: string | null;
  periodReconState: "reconciled" | "in_progress" | "never";
  periodOpenRunId: number | null;
  periodOpenRunStatus: string | null;
  lastReconciledAt: string | null;
  lastClaimPeriod: string | null;
  lastUpdatedAt: string | null;
  updateChanges: number;
}

interface DashboardData {
  period: { year: number; month: number; label: string };
  contracts: ContractRow[];
  summary: {
    total: number;
    reconciled: number;
    inProgress: number;
    notReconciled: number;
    pendingReview: number;
  };
}

const reconBadge: Record<string, { bg: string; label: string }> = {
  reconciled: { bg: "bg-emerald-100 text-emerald-700", label: "Reconciled" },
  in_progress: { bg: "bg-amber-100 text-amber-700", label: "In Progress" },
  never: { bg: "bg-gray-100 text-gray-500", label: "Not Reconciled" },
};

const contractStatusBadge: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-gray-100 text-gray-500",
  cancelled: "bg-red-100 text-red-600",
};

export function ContractStatusTable() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "reconciled" | "in_progress" | "never" | "pending_review">("all");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/contracts?year=${year}&month=${month}`)
      .then((res) => res.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  }

  const filtered = data?.contracts.filter((c) => {
    if (filter === "all") return true;
    if (filter === "pending_review") return c.contractStatus === "pending_review";
    return c.periodReconState === filter;
  }) ?? [];

  return (
    <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
      {/* Header with period selector */}
      <div className="border-b border-brennan-border px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-brennan-text">Contract Status</h2>

        {/* Period selector */}
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="rounded p-1 hover:bg-gray-100 transition-colors">
            <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="px-3 py-1 text-sm font-medium text-brennan-text min-w-[140px] text-center">
            {data?.period.label ?? `${new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`}
          </span>
          <button onClick={nextMonth} className="rounded p-1 hover:bg-gray-100 transition-colors">
            <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Summary chips + filter */}
      {data && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${data.summary.total})`} />
          <FilterChip active={filter === "reconciled"} onClick={() => setFilter("reconciled")} label={`Reconciled (${data.summary.reconciled})`} color="emerald" />
          <FilterChip active={filter === "in_progress"} onClick={() => setFilter("in_progress")} label={`In Progress (${data.summary.inProgress})`} color="amber" />
          <FilterChip active={filter === "never"} onClick={() => setFilter("never")} label={`Not Reconciled (${data.summary.notReconciled})`} color="gray" />
          {data.summary.pendingReview > 0 && (
            <FilterChip active={filter === "pending_review"} onClick={() => setFilter("pending_review")} label={`Pending Review (${data.summary.pendingReview})`} color="red" />
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="px-4 py-8 text-center text-sm text-gray-400 animate-pulse">Loading contracts...</div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-4 py-2">Distributor</th>
                <th className="px-3 py-2">Contract</th>
                <th className="px-3 py-2">End User</th>
                <th className="px-3 py-2 text-center">Items</th>
                <th className="px-3 py-2">Reconciliation</th>
                <th className="px-3 py-2">Last Reconciled</th>
                <th className="px-3 py-2">Last Updated</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => {
                const badge = reconBadge[c.periodReconState];
                return (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2">
                      <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-bold text-brennan-blue">
                        {c.distributor.code}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/contracts/${c.id}`} className="font-mono font-medium text-brennan-blue hover:underline">
                        {c.contractNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{c.endUser.name}</td>
                    <td className="px-3 py-2 text-center font-medium">{c.recordCount}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {c.lastClaimPeriod ? (
                        <span title={c.lastReconciledAt ? new Date(c.lastReconciledAt).toLocaleString() : ""}>
                          {c.lastClaimPeriod}
                        </span>
                      ) : (
                        <span className="text-gray-300 italic">Never</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {c.lastUpdatedAt ? (
                        <span>
                          {new Date(c.lastUpdatedAt).toLocaleDateString()}
                          {c.updateChanges > 0 && (
                            <span className="ml-1 text-blue-600">({c.updateChanges})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${contractStatusBadge[c.contractStatus] || "bg-gray-100 text-gray-600"}`}>
                        {c.contractStatus === "pending_review" ? "Pending" : c.contractStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.contractStatus === "pending_review" ? (
                        <Link href={`/contracts/${c.id}`} className="text-amber-600 font-medium hover:underline">
                          Review →
                        </Link>
                      ) : c.periodReconState === "in_progress" && c.periodOpenRunId ? (
                        <Link href={`/reconciliation/run/${c.periodOpenRunId}`} className="text-amber-600 font-medium hover:underline">
                          Continue →
                        </Link>
                      ) : c.periodReconState === "never" ? (
                        <Link href="/reconciliation" className="text-brennan-blue font-medium hover:underline">
                          Reconcile →
                        </Link>
                      ) : (
                        <Link href={`/contracts/${c.id}`} className="text-gray-400 hover:text-brennan-blue hover:underline">
                          View →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          {data && data.contracts.length > 0
            ? "No contracts match this filter."
            : "No contracts found. Create a contract to get started."}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, color }: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  const activeClass = active
    ? "bg-brennan-blue text-white border-brennan-blue"
    : `bg-white text-gray-600 border-gray-200 hover:border-gray-300`;
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${activeClass}`}
    >
      {!active && color && (
        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
          color === "emerald" ? "bg-emerald-500" :
          color === "amber" ? "bg-amber-500" :
          color === "red" ? "bg-red-500" :
          "bg-gray-400"
        }`} />
      )}
      {label}
    </button>
  );
}
