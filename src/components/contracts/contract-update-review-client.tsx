"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiffRow {
  id: number;
  diffType: string;
  itemId: number | null;
  itemNumber: string;
  rebatePlanId: number | null;
  planCode: string | null;
  matchedRecordId: number | null;
  oldPrice: number | null;
  newPrice: number | null;
  matchStatus: string;
  ambiguityReason: string | null;
  resolution: string | null;
  resolutionData: Record<string, unknown> | null;
  resolvedAt: string | null;
  committedRecordId: number | null;
}

interface RunData {
  id: number;
  contractId: number;
  fileMode: string;
  fileName: string;
  effectiveDate: string | null;
  status: string;
  totalRows: number;
  unchangedCount: number;
  changedCount: number;
  addedCount: number;
  removedCount: number;
  commitSummary: Record<string, unknown> | null;
  runBy: string;
  createdAt: string;
  committedAt: string | null;
}

interface ContractInfo {
  id: number;
  contractNumber: string;
  contractType: string;
  distributor: { code: string; name: string };
  endUser: { name: string };
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const diffTypeBadge: Record<string, string> = {
  changed: "bg-amber-100 text-amber-700",
  added: "bg-emerald-100 text-emerald-700",
  removed: "bg-red-100 text-red-700",
};

const resolutionBadge: Record<string, string> = {
  apply: "bg-emerald-100 text-emerald-700",
  skip: "bg-gray-100 text-gray-600",
  modify: "bg-blue-100 text-blue-700",
};

const matchStatusBadge: Record<string, string> = {
  auto: "bg-gray-100 text-gray-500",
  ambiguous: "bg-amber-100 text-amber-700",
  manual: "bg-blue-100 text-blue-700",
};

const runStatusBadge: Record<string, string> = {
  staged: "bg-blue-100 text-blue-700",
  review: "bg-amber-100 text-amber-700",
  committed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PlanOption {
  id: number;
  planCode: string;
  planName: string | null;
}

interface CurrentRecord {
  id: number;
  itemNumber: string;
  rebatePrice: number;
  startDate: string;
  endDate: string | null;
  status: string;
}

export function ContractUpdateReviewClient({
  run,
  contract,
  diffs: initialDiffs,
  plans,
  currentRecords = [],
}: {
  run: RunData;
  contract: ContractInfo;
  diffs: DiffRow[];
  plans: PlanOption[];
  currentRecords?: CurrentRecord[];
}) {
  const router = useRouter();
  const [diffs, setDiffs] = useState(initialDiffs);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [bulkResolving, setBulkResolving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<Record<string, unknown> | null>(run.commitSummary);
  const [runStatus, setRunStatus] = useState(run.status);
  const [error, setError] = useState<string | null>(null);

  const pendingCount = diffs.filter((d) => !d.resolution).length;
  const resolvedCount = diffs.filter((d) => d.resolution).length;
  const allResolved = diffs.length > 0 && pendingCount === 0;
  const isCommitted = runStatus === "committed";
  const isLocked = isCommitted || runStatus === "cancelled";

  // Group diffs by type for display
  const changedDiffs = diffs.filter((d) => d.diffType === "changed");
  const addedDiffs = diffs.filter((d) => d.diffType === "added");
  const removedDiffs = diffs.filter((d) => d.diffType === "removed");

  async function handleResolveWithPlan(diffId: number, targetPlanId: number) {
    setResolvingId(diffId);
    setError(null);
    try {
      const res = await fetch(
        `/api/contracts/${contract.id}/update/${run.id}/diffs/${diffId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolution: "modify", resolutionData: { targetPlanId } }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setDiffs((prev) =>
          prev.map((d) =>
            d.id === diffId
              ? { ...d, resolution: data.diff.resolution, resolvedAt: data.diff.resolvedAt, resolutionData: { targetPlanId } }
              : d
          )
        );
        if (data.runProgress?.allResolved) setRunStatus("review");
      } else {
        setError(data.error || "Failed to resolve diff");
      }
    } catch {
      setError("Network error");
    } finally {
      setResolvingId(null);
    }
  }

  async function handleResolve(diffId: number, resolution: "apply" | "skip" | "modify") {
    setResolvingId(diffId);
    setError(null);
    try {
      const res = await fetch(
        `/api/contracts/${contract.id}/update/${run.id}/diffs/${diffId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolution }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setDiffs((prev) =>
          prev.map((d) =>
            d.id === diffId
              ? { ...d, resolution: data.diff.resolution, resolvedAt: data.diff.resolvedAt }
              : d
          )
        );
        if (data.runProgress?.allResolved) setRunStatus("review");
      } else {
        setError(data.error || "Failed to resolve diff");
      }
    } catch {
      setError("Network error");
    } finally {
      setResolvingId(null);
    }
  }

  async function handleBulkResolve(resolution: "apply" | "skip", filter?: "changed" | "added" | "removed") {
    // Bulk apply excludes ambiguous diffs — they need individual plan selection.
    const targetDiffs = diffs.filter((d) =>
      !d.resolution &&
      (!filter || d.diffType === filter) &&
      (resolution !== "apply" || d.matchStatus !== "ambiguous")
    );
    if (targetDiffs.length === 0) return;

    setBulkResolving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/contracts/${contract.id}/update/${run.id}/diffs/bulk-resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diffIds: targetDiffs.map((d) => d.id), resolution }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        // Refresh page to get updated state
        router.refresh();
        // Optimistic update
        const resolvedIds = new Set(targetDiffs.map((d) => d.id));
        setDiffs((prev) =>
          prev.map((d) =>
            resolvedIds.has(d.id)
              ? { ...d, resolution, resolvedAt: new Date().toISOString() }
              : d
          )
        );
        if (data.runProgress?.allResolved) setRunStatus("review");
      } else {
        setError(data.error || "Bulk resolve failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setBulkResolving(false);
    }
  }

  async function handleCommit() {
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/contracts/${contract.id}/update/${run.id}/commit`,
        { method: "POST" }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setCommitResult(data.summary);
        setRunStatus("committed");
      } else {
        setError(data.error || "Commit failed");
      }
    } catch {
      setError("Network error during commit");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Link href="/contracts" className="hover:text-brennan-blue hover:underline">Contracts</Link>
        <span>/</span>
        <Link href={`/contracts/${contract.id}`} className="hover:text-brennan-blue hover:underline">{contract.contractNumber}</Link>
        <span>/</span>
        <span className="font-medium text-brennan-text">Update Review</span>
      </div>

      {/* Header card */}
      <div className="rounded-lg border border-brennan-border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-brennan-text">Pricing Update Review</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${runStatusBadge[runStatus] || "bg-gray-100"}`}>
                {runStatus}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {contract.distributor.code} — {contract.contractNumber} — {contract.endUser.name}
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>{run.fileName}</p>
            <p>{run.fileMode} mode{run.effectiveDate ? ` · effective ${run.effectiveDate}` : ""}</p>
            <p>by {run.runBy} · {new Date(run.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="mt-4 flex items-center gap-4 text-xs">
          <span className="text-gray-500">{run.totalRows} rows in file</span>
          <span className="text-gray-400">·</span>
          {run.unchangedCount > 0 && <span className="text-gray-500">{run.unchangedCount} unchanged</span>}
          {run.changedCount > 0 && <span className="text-amber-600 font-medium">{run.changedCount} changed</span>}
          {run.addedCount > 0 && <span className="text-emerald-600 font-medium">{run.addedCount} added</span>}
          {run.removedCount > 0 && <span className="text-red-600 font-medium">{run.removedCount} removed</span>}
          <span className="text-gray-400">·</span>
          <span className={pendingCount > 0 ? "text-amber-600 font-medium" : "text-emerald-600 font-medium"}>
            {resolvedCount}/{diffs.length} resolved
          </span>
        </div>

        {/* Progress bar */}
        {diffs.length > 0 && (
          <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-brennan-blue transition-all duration-300"
              style={{ width: `${(resolvedCount / diffs.length) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Commit result */}
      {commitResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-800">Committed successfully</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-emerald-700">
            <span>{String(commitResult.recordsCreated || 0)} records created</span>
            <span>{String(commitResult.recordsSuperseded || 0)} records superseded</span>
            <span>{String(commitResult.itemsCreated || 0)} items created</span>
            <span>{String(commitResult.totalApplied || 0)} applied</span>
            <span>{String(commitResult.skipped || 0)} skipped</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Bulk actions */}
      {!isLocked && diffs.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 mr-1">Bulk:</span>
          <button
            onClick={() => handleBulkResolve("apply")}
            disabled={bulkResolving || pendingCount === 0}
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
          >
            Apply all pending
          </button>
          <button
            onClick={() => handleBulkResolve("skip")}
            disabled={bulkResolving || pendingCount === 0}
            className="rounded border border-gray-300 bg-gray-50 px-3 py-1 font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
          >
            Skip all pending
          </button>
          {changedDiffs.some((d) => !d.resolution) && (
            <button
              onClick={() => handleBulkResolve("apply", "changed")}
              disabled={bulkResolving}
              className="rounded border border-amber-300 bg-amber-50 px-3 py-1 font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40"
            >
              Apply all changes
            </button>
          )}
          {addedDiffs.some((d) => !d.resolution) && (
            <button
              onClick={() => handleBulkResolve("apply", "added")}
              disabled={bulkResolving}
              className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
            >
              Apply all additions
            </button>
          )}
        </div>
      )}

      {/* Unified contract view — every item in one table */}
      {(() => {
        // Build lookup: item number → diff
        const diffByItem = new Map<string, DiffRow>();
        for (const d of diffs) diffByItem.set(d.itemNumber, d);

        // Merge: existing records + new items (added diffs not in current records)
        const existingItemNumbers = new Set(currentRecords.map((r) => r.itemNumber));

        type UnifiedRow = {
          key: string;
          itemNumber: string;
          currentPrice: number | null;
          newPrice: number | null;
          status: "no change" | "changed" | "added" | "removed";
          diff: DiffRow | null;
          dates: string;
        };

        const rows: UnifiedRow[] = [];

        // Existing records
        for (const rec of currentRecords) {
          const diff = diffByItem.get(rec.itemNumber) ?? null;
          const status = diff?.diffType === "changed" ? "changed" as const
            : diff?.diffType === "removed" ? "removed" as const
            : "no change" as const;
          rows.push({
            key: `rec-${rec.id}`,
            itemNumber: rec.itemNumber,
            currentPrice: rec.rebatePrice,
            newPrice: diff?.newPrice ?? null,
            status,
            diff,
            dates: `${rec.startDate}${rec.endDate ? ` – ${rec.endDate}` : " – open"}`,
          });
        }

        // New items (added diffs not already in current records)
        for (const d of addedDiffs) {
          if (!existingItemNumbers.has(d.itemNumber)) {
            rows.push({
              key: `add-${d.id}`,
              itemNumber: d.itemNumber,
              currentPrice: null,
              newPrice: d.newPrice,
              status: "added",
              diff: d,
              dates: "",
            });
          }
        }

        const statusBg: Record<string, string> = {
          changed: "bg-amber-50",
          added: "bg-emerald-50",
          removed: "bg-red-50",
          "no change": "",
        };

        const statusBadge: Record<string, { bg: string; text: string; label: string }> = {
          changed: { bg: "bg-amber-100", text: "text-amber-700", label: "price change" },
          added: { bg: "bg-emerald-100", text: "text-emerald-700", label: "new item" },
          removed: { bg: "bg-red-100", text: "text-red-700", label: "removed" },
          "no change": { bg: "bg-gray-100", text: "text-gray-500", label: "no change" },
        };

        return (
          <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-brennan-border bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-brennan-text">
                  Contract {contract.contractNumber} — {rows.length} item{rows.length !== 1 ? "s" : ""}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {run.unchangedCount} unchanged · {run.changedCount} price change{run.changedCount !== 1 ? "s" : ""} · {run.addedCount} new · {run.removedCount} removed
                </p>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-200" /> price change
                <span className="ml-2 inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> new
                <span className="ml-2 inline-block w-3 h-3 rounded bg-red-100 border border-red-200" /> removed
              </div>
            </div>

            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Current Price</th>
                  <th className="px-3 py-2 text-right">New Price</th>
                  <th className="px-3 py-2">Change</th>
                  <th className="px-3 py-2">Resolution</th>
                  {!isLocked && <th className="px-3 py-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => {
                  const badge = statusBadge[row.status];
                  const isResolved = !!row.diff?.resolution;

                  return (
                    <tr key={row.key} className={`${statusBg[row.status]} ${isResolved ? "opacity-60" : ""}`}>
                      <td className="px-5 py-2 font-mono font-medium text-brennan-text">{row.itemNumber}</td>
                      <td className={`px-3 py-2 text-right font-mono ${row.status === "changed" ? "line-through text-gray-400" : row.currentPrice != null ? "text-gray-600" : "text-gray-300"}`}>
                        {row.currentPrice != null ? `$${row.currentPrice.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.newPrice != null ? (
                          <span className={`font-medium ${row.status === "changed" ? "text-amber-700" : row.status === "added" ? "text-emerald-700" : "text-gray-700"}`}>
                            ${row.newPrice.toFixed(2)}
                          </span>
                        ) : row.status === "removed" ? (
                          <span className="text-red-400 italic">—</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                        {row.diff?.ambiguityReason && (
                          <p className="mt-0.5 text-[10px] text-amber-600 max-w-xs truncate" title={row.diff.ambiguityReason}>
                            {row.diff.ambiguityReason}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.diff ? (
                          row.diff.resolution ? (
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${resolutionBadge[row.diff.resolution] || "bg-gray-100"}`}>
                              {row.diff.resolution}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">pending</span>
                          )
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      {!isLocked && (
                        <td className="px-3 py-2 text-right">
                          {row.diff && !row.diff.resolution && (
                            row.diff.matchStatus === "ambiguous" && plans.length > 1 ? (
                              <AmbiguousDiffActions
                                diffId={row.diff.id}
                                plans={plans}
                                resolvingId={resolvingId}
                                onResolveWithPlan={handleResolveWithPlan}
                                onSkip={() => handleResolve(row.diff!.id, "skip")}
                              />
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleResolve(row.diff!.id, "apply")}
                                  disabled={resolvingId === row.diff!.id}
                                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                                >
                                  Apply
                                </button>
                                <button
                                  onClick={() => handleResolve(row.diff!.id, "skip")}
                                  disabled={resolvingId === row.diff!.id}
                                  className="rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                                >
                                  Skip
                                </button>
                              </div>
                            )
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {diffs.length === 0 && (
              <div className="py-6 text-center text-sm text-gray-400">
                No differences found. All {run.unchangedCount} items match.
              </div>
            )}
          </div>
        );
      })()}

      {/* Commit bar */}
      {!isLocked && (
        <div className="flex items-center justify-between rounded-lg border border-brennan-border bg-white px-5 py-3 shadow-sm">
          <div className="text-sm text-gray-600">
            {allResolved ? (
              <span className="text-emerald-600 font-medium">All diffs resolved — ready to commit</span>
            ) : (
              <span>{pendingCount} diff{pendingCount !== 1 ? "s" : ""} still pending</span>
            )}
          </div>
          <button
            onClick={handleCommit}
            disabled={!allResolved || committing}
            className="rounded-lg bg-brennan-blue px-6 py-2 text-sm font-medium text-white hover:bg-brennan-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {committing ? "Committing..." : "Commit Changes"}
          </button>
        </div>
      )}

      {/* Back link */}
      <div className="text-xs">
        <Link href={`/contracts/${contract.id}`} className="text-brennan-blue hover:underline">
          ← Back to contract
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambiguous Diff Actions — requires plan selection before apply
// ---------------------------------------------------------------------------

function AmbiguousDiffActions({
  diffId,
  plans,
  resolvingId,
  onResolveWithPlan,
  onSkip,
}: {
  diffId: number;
  plans: PlanOption[];
  resolvingId: number | null;
  onResolveWithPlan: (id: number, targetPlanId: number) => void;
  onSkip: () => void;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  return (
    <div className="flex items-center justify-end gap-1">
      <select
        value={selectedPlanId}
        onChange={(e) => setSelectedPlanId(e.target.value)}
        className="h-6 rounded border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      >
        <option value="">Select plan...</option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.planCode}{p.planName ? ` — ${p.planName}` : ""}
          </option>
        ))}
      </select>
      <button
        onClick={() => onResolveWithPlan(diffId, Number(selectedPlanId))}
        disabled={!selectedPlanId || resolvingId === diffId}
        className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
      >
        Apply
      </button>
      <button
        onClick={onSkip}
        disabled={resolvingId === diffId}
        className="rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
      >
        Skip
      </button>
    </div>
  );
}
