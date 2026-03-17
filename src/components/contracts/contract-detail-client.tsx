"use client";

import { useState } from "react";
import Link from "next/link";

interface ContractData {
  id: number;
  contractNumber: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: string;
  updatedAt: string;
  distributor: { code: string; name: string };
  endUser: { name: string; code: string | null };
}

interface RecordRow {
  id: number;
  itemNumber: string;
  itemDescription: string | null;
  rebatePrice: string;
  startDate: string;
  endDate: string;
  rawStartDate: string;
  rawEndDate: string | null;
  status: string;
}

interface PlanData {
  id: number;
  planCode: string;
  planName: string | null;
  discountType: string;
  status: string;
  records: RecordRow[];
}

interface Props {
  contract: ContractData;
  plans: PlanData[];
  totalRecords: number;
  statusCounts: Record<string, number>;
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-gray-100 text-gray-600",
  future: "bg-blue-100 text-blue-700",
  superseded: "bg-purple-100 text-purple-600",
  draft: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
};

export function ContractDetailClient({ contract, plans, totalRecords, statusCounts }: Props) {
  const [expandedPlans, setExpandedPlans] = useState<Set<number>>(() => {
    // Auto-expand if 3 or fewer plans
    if (plans.length <= 3) return new Set(plans.map((p) => p.id));
    return new Set();
  });

  function togglePlan(planId: number) {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) {
        next.delete(planId);
      } else {
        next.add(planId);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedPlans(new Set(plans.map((p) => p.id)));
  }

  function collapseAll() {
    setExpandedPlans(new Set());
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb + back link */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Link href="/contracts" className="hover:text-brennan-blue hover:underline">
          Contracts
        </Link>
        <span>/</span>
        <span className="font-medium text-brennan-text">{contract.contractNumber}</span>
      </div>

      {/* Header card */}
      <div className="rounded-lg border border-brennan-border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-brennan-text font-mono">
                {contract.contractNumber}
              </h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[contract.status] || "bg-gray-100 text-gray-600"}`}>
                {contract.status}
              </span>
            </div>
            {contract.description && (
              <p className="mt-1 text-sm text-gray-500">{contract.description}</p>
            )}
          </div>
          <Link
            href={`/records?contract=${contract.contractNumber}`}
            className="rounded-lg border border-brennan-border bg-white px-3 py-1.5 text-xs font-medium text-brennan-blue transition-colors hover:bg-brennan-light"
          >
            View all records →
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Distributor</p>
            <p className="mt-0.5 text-sm font-medium text-brennan-text">
              <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-bold text-brennan-blue mr-1.5">
                {contract.distributor.code}
              </span>
              {contract.distributor.name}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">End User</p>
            <p className="mt-0.5 text-sm font-medium text-brennan-text">{contract.endUser.name}</p>
            {contract.endUser.code && (
              <p className="text-xs text-gray-400">{contract.endUser.code}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Effective Dates</p>
            <p className="mt-0.5 text-sm text-brennan-text">
              {contract.startDate || "—"} → {contract.endDate || <span className="text-amber-500">Open</span>}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Last Updated</p>
            <p className="mt-0.5 text-sm text-gray-600">
              {new Date(contract.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Summary stats bar */}
      <div className="flex items-center gap-4 text-xs">
        <span className="font-medium text-gray-500">
          {plans.length} plan{plans.length !== 1 ? "s" : ""} · {totalRecords} record{totalRecords !== 1 ? "s" : ""}
        </span>
        {Object.entries(statusCounts).map(([status, count]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${(statusColors[status] || "bg-gray-300").split(" ")[0]}`} />
            <span className="text-gray-600">{count} {status}</span>
          </span>
        ))}
        {plans.length > 1 && (
          <span className="ml-auto flex gap-2">
            <button onClick={expandAll} className="text-brennan-blue hover:underline">Expand all</button>
            <button onClick={collapseAll} className="text-gray-400 hover:underline">Collapse all</button>
          </span>
        )}
      </div>

      {/* Plans with nested records */}
      {plans.length === 0 ? (
        <div className="rounded-lg border border-brennan-border bg-white py-8 text-center text-sm text-gray-400">
          No rebate plans under this contract.
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const isExpanded = expandedPlans.has(plan.id);
            return (
              <div key={plan.id} className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
                {/* Plan header — clickable to expand */}
                <button
                  onClick={() => togglePlan(plan.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-brennan-light/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                    <span className="font-mono font-bold text-sm text-brennan-text">{plan.planCode}</span>
                    {plan.planName && (
                      <span className="text-sm text-gray-500">— {plan.planName}</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[plan.status] || "bg-gray-100 text-gray-600"}`}>
                      {plan.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{plan.records.length} record{plan.records.length !== 1 ? "s" : ""}</span>
                    <span className="text-gray-300">·</span>
                    <span>{plan.discountType}</span>
                  </div>
                </button>

                {/* Expanded records table */}
                {isExpanded && (
                  <div className="border-t border-brennan-border">
                    {plan.records.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-gray-400">No records in this plan.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 text-left text-gray-500 uppercase tracking-wider">
                            <th className="px-4 py-1.5">Item #</th>
                            <th className="px-3 py-1.5">Description</th>
                            <th className="px-3 py-1.5 text-right">Price</th>
                            <th className="px-3 py-1.5">Start</th>
                            <th className="px-3 py-1.5">End</th>
                            <th className="px-3 py-1.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {plan.records.map((r) => (
                            <tr key={r.id} className="hover:bg-gray-50/50">
                              <td className="px-4 py-1.5 font-mono font-medium text-brennan-text">
                                {r.itemNumber}
                              </td>
                              <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">
                                {r.itemDescription || "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-gray-700">
                                ${Number(r.rebatePrice).toFixed(4)}
                              </td>
                              <td className="px-3 py-1.5 text-gray-600">{r.startDate}</td>
                              <td className="px-3 py-1.5 text-gray-600">
                                {r.endDate || <span className="text-amber-500">Open</span>}
                              </td>
                              <td className="px-3 py-1.5">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status] || "bg-gray-100 text-gray-600"}`}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {/* Link to Records workspace filtered by this plan */}
                    <div className="border-t border-gray-100 px-4 py-2">
                      <Link
                        href={`/records?contract=${contract.contractNumber}&plan=${plan.planCode}`}
                        className="text-xs text-brennan-blue hover:underline"
                      >
                        View in Records workspace →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
