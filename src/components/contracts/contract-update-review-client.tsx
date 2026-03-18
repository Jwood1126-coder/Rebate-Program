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

export function ContractUpdateReviewClient({
  run,
  contract,
  diffs: initialDiffs,
  plans,
}: {
  run: RunData;
  contract: ContractInfo;
  diffs: DiffRow[];
  plans: PlanOption[];
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

      {/* Diff sections */}
      {changedDiffs.length > 0 && (
        <DiffSection title="Price Changes" diffs={changedDiffs} resolvingId={resolvingId} onResolve={handleResolve} onResolveWithPlan={handleResolveWithPlan} plans={plans} isLocked={isLocked} />
      )}
      {addedDiffs.length > 0 && (
        <DiffSection title="New Items" diffs={addedDiffs} resolvingId={resolvingId} onResolve={handleResolve} onResolveWithPlan={handleResolveWithPlan} plans={plans} isLocked={isLocked} />
      )}
      {removedDiffs.length > 0 && (
        <DiffSection title="Removed Items" diffs={removedDiffs} resolvingId={resolvingId} onResolve={handleResolve} onResolveWithPlan={handleResolveWithPlan} plans={plans} isLocked={isLocked} />
      )}

      {diffs.length === 0 && (
        <div className="rounded-lg border border-brennan-border bg-white py-8 text-center text-sm text-gray-400">
          No actionable differences found. All {run.unchangedCount} rows match.
        </div>
      )}

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
// Diff Section
// ---------------------------------------------------------------------------

function DiffSection({
  title,
  diffs,
  resolvingId,
  onResolve,
  onResolveWithPlan,
  plans,
  isLocked,
}: {
  title: string;
  diffs: DiffRow[];
  resolvingId: number | null;
  onResolve: (id: number, resolution: "apply" | "skip" | "modify") => void;
  onResolveWithPlan: (id: number, targetPlanId: number) => void;
  plans: PlanOption[];
  isLocked: boolean;
}) {
  return (
    <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-brennan-border">
        <h3 className="text-sm font-semibold text-brennan-text">{title} ({diffs.length})</h3>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-1.5">Item #</th>
            {diffs[0]?.planCode && <th className="px-3 py-1.5">Plan</th>}
            <th className="px-3 py-1.5">Type</th>
            <th className="px-3 py-1.5 text-right">Old Price</th>
            <th className="px-3 py-1.5 text-right">New Price</th>
            <th className="px-3 py-1.5">Match</th>
            <th className="px-3 py-1.5">Status</th>
            {!isLocked && <th className="px-3 py-1.5 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {diffs.map((diff) => (
            <tr
              key={diff.id}
              className={diff.resolution ? "bg-gray-50/50 opacity-70" : "hover:bg-gray-50/50"}
            >
              <td className="px-4 py-2 font-mono font-medium text-brennan-text">
                {diff.itemNumber}
              </td>
              {diff.planCode !== undefined && (
                <td className="px-3 py-2 text-gray-600">{diff.planCode || "—"}</td>
              )}
              <td className="px-3 py-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${diffTypeBadge[diff.diffType] || "bg-gray-100"}`}>
                  {diff.diffType}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-gray-600">
                {diff.oldPrice != null ? `$${diff.oldPrice.toFixed(4)}` : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-gray-700 font-medium">
                {diff.newPrice != null ? `$${diff.newPrice.toFixed(4)}` : "—"}
              </td>
              <td className="px-3 py-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${matchStatusBadge[diff.matchStatus] || "bg-gray-100"}`}>
                  {diff.matchStatus}
                </span>
                {diff.ambiguityReason && (
                  <p className="mt-0.5 text-[10px] text-amber-600 max-w-xs truncate" title={diff.ambiguityReason}>
                    {diff.ambiguityReason}
                  </p>
                )}
              </td>
              <td className="px-3 py-2">
                {diff.resolution ? (
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${resolutionBadge[diff.resolution] || "bg-gray-100"}`}>
                    {diff.resolution}
                  </span>
                ) : (
                  <span className="text-gray-400 italic">pending</span>
                )}
              </td>
              {!isLocked && (
                <td className="px-3 py-2 text-right">
                  {!diff.resolution && (
                    diff.matchStatus === "ambiguous" && plans.length > 1 ? (
                      <AmbiguousDiffActions
                        diffId={diff.id}
                        plans={plans}
                        resolvingId={resolvingId}
                        onResolveWithPlan={onResolveWithPlan}
                        onSkip={() => onResolve(diff.id, "skip")}
                      />
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onResolve(diff.id, "apply")}
                          disabled={resolvingId === diff.id}
                          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                        >
                          Apply
                        </button>
                        <button
                          onClick={() => onResolve(diff.id, "skip")}
                          disabled={resolvingId === diff.id}
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
          ))}
        </tbody>
      </table>
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
