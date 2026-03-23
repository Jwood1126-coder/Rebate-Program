"use client";

import React from "react";
import type {
  DbIssue,
  RunProgress,
  ReconciliationRunSummary,
  CommitSummaryData,
} from "@/lib/reconciliation/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MatchedRow {
  id: number;
  rowNumber: number;
  itemNumber: string | null;
  contractNumber: string | null;
  deviatedPrice: string | null;
  quantity: string | null;
  transactionDate: string | null;
}

export interface ReviewPanelProps {
  runId: number;
  run: ReconciliationRunSummary | null;
  issues: DbIssue[];
  matchedRows?: MatchedRow[];
  progress: RunProgress | null;
  loading: boolean;
  expandedIssueId: number | null;
  resolvingIssue: number | null;
  bulkResolving: boolean;
  committing: boolean;
  commitResult: {
    success: boolean;
    summary?: CommitSummaryData;
    error?: string;
    failedIssueId?: number;
  } | null;
  onResolve: (issueId: number, resolution: string, note?: string) => void;
  onBulkResolve: (resolution: string, filter: "all" | "warnings" | "errors") => void;
  onCommit: (runId: number) => void;
  onExpandIssue: (issueId: number | null) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Issue card — extracted for reuse in contract-grouped and flat views
// ---------------------------------------------------------------------------

function renderIssueCard(
  issue: DbIssue,
  expandedIssueId: number | null,
  resolvingIssue: number | null,
  onExpandIssue: (id: number | null) => void,
  onResolve: (issueId: number, resolution: string, note?: string) => void,
  run: ReconciliationRunSummary | null,
) {
  const isExpanded = expandedIssueId === issue.id;
  const cr = issue.claimRow;
  return (
    <div
      key={issue.id}
      className={`rounded-lg border transition-colors ${
        issue.resolution
          ? "border-gray-200 bg-gray-50/50 opacity-70"
          : isExpanded
            ? "border-brennan-blue/30 bg-brennan-light/20"
            : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer"
        onClick={() => onExpandIssue(isExpanded ? null : issue.id)}
      >
        <svg className={`h-4 w-4 mt-0.5 text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <div className="shrink-0 w-20">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
            issue.severity === "error"
              ? "bg-red-100 text-red-700"
              : issue.severity === "warning"
                ? "bg-amber-100 text-amber-700"
                : "bg-blue-50 text-blue-600"
          }`}>
            {issue.code}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          {cr && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs mb-1">
              {cr.itemNumber && <span className="font-mono font-semibold text-brennan-text">{cr.itemNumber}</span>}
              {cr.deviatedPrice != null && (
                <span className="text-gray-500">@ <span className="font-medium text-gray-700">${cr.deviatedPrice.toFixed(2)}</span></span>
              )}
              {cr.quantity != null && (
                <span className="text-gray-500">qty <span className="font-medium text-gray-700">{cr.quantity}</span></span>
              )}
              <span className="text-gray-300">Row #{cr.rowNumber}</span>
            </div>
          )}
          <div className="text-xs text-gray-500">
            <span className="font-medium text-gray-600">{issue.category}</span>
            <span className="mx-1.5 text-gray-300">&middot;</span>
            <CommitConsequenceLabel issue={issue} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {issue.resolution ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              issue.resolution === "approved" ? "bg-green-100 text-green-700"
                : issue.resolution === "rejected" ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-600"
            }`}>
              {issue.resolution}
            </span>
          ) : (
            <>
              {issue.masterRecordId && (
                <a href={`/records?search=${encodeURIComponent(cr?.itemNumber || "")}`} target="_blank" rel="noopener noreferrer" className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50">Search</a>
              )}
              {!(run?.status === "committed") && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); onResolve(issue.id, "approved"); }} disabled={resolvingIssue === issue.id} className="rounded border border-green-200 px-1.5 py-0.5 text-[10px] font-medium text-green-700 hover:bg-green-50 disabled:opacity-50">Approve</button>
                  <button onClick={(e) => { e.stopPropagation(); onResolve(issue.id, "rejected"); }} disabled={resolvingIssue === issue.id} className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Reject</button>
                  <button onClick={(e) => { e.stopPropagation(); onResolve(issue.id, "dismissed"); }} disabled={resolvingIssue === issue.id} className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50 disabled:opacity-50">Dismiss</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
          <IssueDetailPanel issue={issue} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Review Panel component
// ---------------------------------------------------------------------------

export function ReviewPanel({
  runId,
  run,
  issues,
  matchedRows = [],
  progress,
  loading,
  expandedIssueId,
  resolvingIssue,
  bulkResolving,
  committing,
  commitResult,
  onResolve,
  onBulkResolve,
  onCommit,
  onExpandIssue,
  onClose,
}: ReviewPanelProps) {
  return (
    <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
      <div className="border-b border-brennan-border px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-brennan-text">
            Exception Review — Run #{runId}
          </h2>
          {progress && (
            <span className="text-xs text-gray-500">
              {progress.resolvedCount}/{progress.totalIssues} resolved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {run && ["review", "reviewed", "committed"].includes(run.status) && (
            <>
              <a
                href={`/api/export/claim-response/${runId}`}
                download
                className="rounded border border-brennan-blue bg-brennan-blue px-2.5 py-1 text-xs font-medium text-white hover:bg-brennan-blue/90 transition-colors"
              >
                Export Claim Response
              </a>
              <a
                href={`/api/export/reconciliation-run/${runId}`}
                download
                className="rounded border border-brennan-border px-2.5 py-1 text-xs font-medium text-brennan-blue hover:bg-brennan-light transition-colors"
              >
                Export CSV
              </a>
            </>
          )}
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Close
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <div className="text-center py-6 text-sm text-gray-500">Loading issues...</div>
        ) : (
          <>
            {/* Progress bar */}
            {progress && progress.totalIssues > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Resolution Progress</span>
                  <span className="text-xs font-medium text-gray-700">
                    {Math.round((progress.resolvedCount / progress.totalIssues) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${progress.allResolved ? "bg-green-500" : "bg-brennan-blue"}`}
                    style={{ width: `${(progress.resolvedCount / progress.totalIssues) * 100}%` }}
                  />
                </div>
                {progress.allResolved && (
                  <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
                    <p className="text-sm font-medium text-green-800">All exceptions resolved</p>
                    <p className="mt-1 text-xs text-green-700">
                      {progress.breakdown.approved ?? 0} approved, {progress.breakdown.rejected ?? 0} rejected, {progress.breakdown.dismissed ?? 0} dismissed
                    </p>

                    {commitResult?.error ? (
                      <div className="mt-2 rounded border border-red-200 bg-red-50 p-2">
                        <p className="text-xs text-red-700">{commitResult.error}</p>
                        {commitResult.failedIssueId && (
                          <p className="text-xs text-red-500 mt-0.5">Issue ID: {commitResult.failedIssueId}</p>
                        )}
                      </div>
                    ) : run?.status === "committed" ? null : (
                      <button
                        onClick={() => onCommit(runId)}
                        disabled={committing}
                        className="mt-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {committing ? "Committing..." : "Commit Approved Claims to Master Data"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Durable Run Outcome panel — shown for committed runs */}
            {run?.status === "committed" && (
              <RunOutcomePanel run={run} />
            )}

            {/* Bulk actions */}
            {progress && progress.pendingCount > 0 && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-xs font-medium text-gray-600 mr-2">Bulk actions:</span>
                <button
                  onClick={() => onBulkResolve("dismissed", "warnings")}
                  disabled={bulkResolving}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-white disabled:opacity-50"
                >
                  Dismiss all warnings
                </button>
                <button
                  onClick={() => onBulkResolve("rejected", "errors")}
                  disabled={bulkResolving}
                  className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Reject all errors
                </button>
                <button
                  onClick={() => onBulkResolve("approved", "all")}
                  disabled={bulkResolving}
                  className="rounded border border-green-200 px-2 py-1 text-xs text-green-600 hover:bg-green-50 disabled:opacity-50"
                >
                  Approve all pending
                </button>
                {bulkResolving && <span className="text-xs text-gray-400 ml-2">Processing...</span>}
              </div>
            )}

            {/* Contract-grouped view */}
            {(() => {
              // Group issues and matched rows by contract number
              const issuesByContract = new Map<string, DbIssue[]>();
              const matchedByContract = new Map<string, MatchedRow[]>();

              for (const issue of issues) {
                const cn = issue.claimRow?.contractNumber ?? "Unknown Contract";
                if (!issuesByContract.has(cn)) issuesByContract.set(cn, []);
                issuesByContract.get(cn)!.push(issue);
              }
              for (const row of matchedRows) {
                const cn = row.contractNumber ?? "Unknown Contract";
                if (!matchedByContract.has(cn)) matchedByContract.set(cn, []);
                matchedByContract.get(cn)!.push(row);
              }

              // Merge all contract numbers from both sources
              const allContracts = [...new Set([...issuesByContract.keys(), ...matchedByContract.keys()])].sort();

              // If only one contract, skip the grouping headers
              if (allContracts.length <= 1) {
                return (
                  <>
                    {matchedRows.length > 0 && <MatchedRowsSection rows={matchedRows} />}
                    {issues.length > 0 && (
                      <div className="space-y-2">
                        {issues.map((issue) => renderIssueCard(issue, expandedIssueId, resolvingIssue, onExpandIssue, onResolve, run))}
                      </div>
                    )}
                  </>
                );
              }

              // Multiple contracts: render grouped
              return (
                <div className="space-y-4">
                  {allContracts.map((cn) => {
                    const contractIssues = issuesByContract.get(cn) || [];
                    const contractMatched = matchedByContract.get(cn) || [];
                    const pendingCount = contractIssues.filter((i) => !i.resolution).length;
                    const errorCount = contractIssues.filter((i) => i.severity === "error" && !i.resolution).length;

                    return (
                      <div key={cn} className="rounded-lg border border-gray-200 overflow-hidden">
                        <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-brennan-text">Contract {cn}</span>
                            <span className="text-xs text-gray-500">
                              {contractMatched.length} matched
                              {contractIssues.length > 0 && (
                                <>, <span className={errorCount > 0 ? "text-red-600 font-medium" : "text-amber-600 font-medium"}>{contractIssues.length} exception{contractIssues.length !== 1 ? "s" : ""}</span></>
                              )}
                              {pendingCount > 0 && (
                                <> (<span className="font-medium">{pendingCount} pending</span>)</>
                              )}
                            </span>
                          </div>
                          {contractMatched.length > 0 && contractIssues.length === 0 && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">All OK</span>
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          {contractMatched.length > 0 && <MatchedRowsSection rows={contractMatched} />}
                          {contractIssues.map((issue) => renderIssueCard(issue, expandedIssueId, resolvingIssue, onExpandIssue, onResolve, run))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}


            {issues.length === 0 && matchedRows.length === 0 && !loading && (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500">No exceptions for this run.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function RunOutcomePanel({ run }: { run: ReconciliationRunSummary }) {
  const cs = run.commitSummary;
  const hasDataChanges = cs && (cs.recordsCreated > 0 || cs.recordsSuperseded > 0 || cs.recordsUpdated > 0 || cs.itemsCreated > 0);

  return (
    <div className="mb-4 rounded-lg border border-green-200 bg-green-50/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <h3 className="text-sm font-bold text-green-800">Run Committed</h3>
        </div>
        {run.completedAt && (
          <span className="text-xs text-green-600">
            {formatDate(run.completedAt)}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <span className="text-green-600">Distributor</span>
          <p className="font-medium text-green-900">{run.distributor.code}</p>
        </div>
        <div>
          <span className="text-green-600">Claim Period</span>
          <p className="font-medium text-green-900">{formatPeriod(run.claimPeriodStart)}</p>
        </div>
        <div>
          <span className="text-green-600">Total Claim Lines</span>
          <p className="font-medium text-green-900">{run.totalClaimLines}</p>
        </div>
        <div>
          <span className="text-green-600">Exceptions</span>
          <p className="font-medium text-green-900">{run.exceptionCount}</p>
        </div>
      </div>

      {cs && (
        <div className="mt-3 border-t border-green-200 pt-3">
          <p className="text-xs font-medium text-green-800 mb-2">Resolution Summary</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {cs.totalApproved > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span className="text-green-800 font-medium">{cs.totalApproved} approved</span>
              </span>
            )}
            {cs.rejected > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                <span className="text-red-700 font-medium">{cs.rejected} rejected</span>
              </span>
            )}
            {cs.dismissed > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
                <span className="text-gray-600 font-medium">{cs.dismissed} dismissed</span>
              </span>
            )}
            {cs.deferred > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-amber-700 font-medium">{cs.deferred} deferred</span>
              </span>
            )}
          </div>
        </div>
      )}

      {hasDataChanges && (
        <div className="mt-3 border-t border-green-200 pt-3">
          <p className="text-xs font-medium text-green-800 mb-2">Master Data Changes</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {cs.recordsCreated > 0 && (
              <span className="rounded bg-green-100 px-2 py-0.5 font-medium text-green-800">
                {cs.recordsCreated} record{cs.recordsCreated !== 1 ? "s" : ""} created
              </span>
            )}
            {cs.recordsSuperseded > 0 && (
              <span className="rounded bg-orange-100 px-2 py-0.5 font-medium text-orange-800">
                {cs.recordsSuperseded} superseded
              </span>
            )}
            {cs.recordsUpdated > 0 && (
              <span className="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-800">
                {cs.recordsUpdated} updated
              </span>
            )}
            {cs.itemsCreated > 0 && (
              <span className="rounded bg-purple-100 px-2 py-0.5 font-medium text-purple-800">
                {cs.itemsCreated} item{cs.itemsCreated !== 1 ? "s" : ""} created
              </span>
            )}
            {cs.confirmed > 0 && (
              <span className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                {cs.confirmed} confirmed (no change)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CommitConsequenceLabel({ issue }: { issue: DbIssue }) {
  const sd = issue.suggestedData;
  const code = issue.code;

  if (code === "CLM-001") {
    const oldPrice = sd?.oldPrice as number | undefined;
    const newPrice = sd?.newPrice as number | undefined;
    if (oldPrice != null && newPrice != null) {
      return <span className="text-amber-700">Update price ${oldPrice.toFixed(2)} → ${newPrice.toFixed(2)}</span>;
    }
    return <span className="text-amber-700">Update master record price</span>;
  }
  if (code === "CLM-003") return <span className="text-blue-700">Add item to contract plan</span>;
  if (code === "CLM-004") return <span className="text-red-700">Contract not found — manual review</span>;
  if (code === "CLM-006") return <span className="text-blue-700">Create new item + record</span>;
  if (code === "CLM-005") return <span className="text-amber-700">Ambiguous match — pick plan</span>;
  if (code === "CLM-007") return <span className="text-red-700">Contract date issue — reject likely</span>;
  if (code === "CLM-009") return <span className="text-gray-500">Possible duplicate — dismiss or reject</span>;
  if (issue.severity === "warning") return <span className="text-gray-500">Informational — no master data change</span>;
  return <span className="text-gray-400">—</span>;
}

function IssueDetailPanel({ issue }: { issue: DbIssue }) {
  const sd = issue.suggestedData;
  const cr = issue.claimRow;

  return (
    <div className="px-8 py-3 space-y-3 border-t border-gray-200">
      <p className="text-xs text-gray-600">{issue.description}</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Claim Data</h4>
          {cr ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <DetailField label="Row" value={`#${cr.rowNumber}`} />
              <DetailField label="Contract" value={cr.contractNumber} />
              <DetailField label="Plan Code" value={cr.planCode} />
              <DetailField label="Item" value={cr.itemNumber} />
              <DetailField label="Open Net Price" value={cr.deviatedPrice != null ? `$${cr.deviatedPrice.toFixed(2)}` : null} />
              <DetailField label="Quantity" value={cr.quantity != null ? String(cr.quantity) : null} />
              {cr.claimedAmount != null && <DetailField label="Line Amount" value={`$${cr.claimedAmount.toFixed(2)}`} />}
              {cr.transactionDate && <DetailField label="Trans. Date" value={new Date(cr.transactionDate).toLocaleDateString()} />}
              {cr.endUserCode && <DetailField label="End User" value={`${cr.endUserCode}${cr.endUserName ? ` — ${cr.endUserName}` : ""}`} />}
              {cr.distributorOrderNumber && <DetailField label="Order #" value={cr.distributorOrderNumber} />}
            </dl>
          ) : (
            <p className="text-xs text-gray-400 italic">No claim row data available</p>
          )}
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            {issue.code === "CLM-001" ? "Price Comparison" :
             issue.code === "CLM-003" ? "Contract Context" :
             issue.code === "CLM-006" ? "Resolution Detail" :
             "Master Data"}
          </h4>
          <IssueTypeDetail issue={issue} />
        </div>
      </div>
      {issue.resolutionNote && (
        <div className="text-xs">
          <span className="font-medium text-gray-500">Note: </span>
          <span className="text-gray-600">{issue.resolutionNote}</span>
        </div>
      )}
    </div>
  );
}

function IssueTypeDetail({ issue }: { issue: DbIssue }) {
  const sd = issue.suggestedData;

  if (issue.code === "CLM-001" && sd) {
    const oldPrice = sd.oldPrice as number | undefined;
    const newPrice = sd.newPrice as number | undefined;
    return (
      <div className="space-y-2">
        {oldPrice != null && newPrice != null && (
          <div className="flex items-center gap-3">
            <div className="rounded border border-gray-200 bg-white px-3 py-1.5 text-center">
              <div className="text-[10px] text-gray-400 uppercase">Contract</div>
              <div className="text-sm font-semibold text-gray-700">${oldPrice.toFixed(2)}</div>
            </div>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-center">
              <div className="text-[10px] text-amber-600 uppercase">Claimed</div>
              <div className="text-sm font-semibold text-amber-700">${newPrice.toFixed(2)}</div>
            </div>
            <div className="text-xs text-gray-400">diff ${Math.abs(newPrice - oldPrice).toFixed(2)}</div>
          </div>
        )}
        {issue.masterRecordId && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <DetailField label="Master Record" value={`#${issue.masterRecordId}`} />
            {sd.planId != null && <DetailField label="Plan ID" value={`#${sd.planId}`} />}
          </dl>
        )}
        <p className="text-xs text-amber-600">
          If approved: {issue.masterRecordId ? "supersede or update existing record at claimed price" : "update contract price"}
        </p>
      </div>
    );
  }

  if (issue.code === "CLM-003" && sd) {
    const candidatePlanIds = sd.candidatePlanIds as number[] | undefined;
    return (
      <div className="space-y-1.5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {sd.contractId != null && <DetailField label="Contract ID" value={`#${sd.contractId}`} />}
          {sd.itemId != null && <DetailField label="Item ID" value={`#${sd.itemId}`} />}
          {sd.planId != null && <DetailField label="Target Plan" value={`#${sd.planId}`} />}
          {sd.claimedPrice != null && <DetailField label="Claimed Price" value={`$${(sd.claimedPrice as number).toFixed(2)}`} />}
          {candidatePlanIds && candidatePlanIds.length > 1 && (
            <DetailField label="Available Plans" value={candidatePlanIds.map(id => `#${id}`).join(", ")} />
          )}
        </dl>
        <p className="text-xs text-blue-600">
          If approved: create new rebate record under {sd.planId != null ? `plan #${sd.planId}` : "contract plan"} at claimed price
        </p>
      </div>
    );
  }

  if (issue.code === "CLM-006" && sd) {
    return (
      <div className="space-y-1.5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <DetailField label="Item Number" value={sd.itemNumber as string | undefined} />
          {sd.contractNumber != null && <DetailField label="Contract" value={String(sd.contractNumber)} />}
          {sd.claimedPrice != null && <DetailField label="Claimed Price" value={`$${(sd.claimedPrice as number).toFixed(2)}`} />}
        </dl>
        <p className="text-xs text-blue-600">
          If approved: create new item &quot;{String(sd.itemNumber)}&quot; + rebate record at claimed price
        </p>
      </div>
    );
  }

  if (issue.code === "CLM-004" && sd) {
    return (
      <div className="space-y-1.5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <DetailField label="Searched For" value={sd.contractNumber as string | undefined} />
        </dl>
        <p className="text-xs text-red-600">
          No matching contract found for this distributor. Verify the contract number or create the contract first.
        </p>
      </div>
    );
  }

  if (issue.code === "CLM-005" && sd) {
    const candidateIds = sd.candidateRecordIds as number[] | undefined;
    return (
      <div className="space-y-1.5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {sd.contractId != null && <DetailField label="Contract ID" value={`#${sd.contractId}`} />}
          {candidateIds && <DetailField label="Candidate Records" value={candidateIds.map(id => `#${id}`).join(", ")} />}
        </dl>
        <p className="text-xs text-amber-600">
          Multiple plan/price matches found. Review and resolve manually — may need to specify the correct plan.
        </p>
      </div>
    );
  }

  if (issue.code === "CLM-007") {
    return (
      <div>
        <p className="text-xs text-red-600">
          Transaction date falls outside the contract&apos;s effective period. Typically rejected unless the contract dates need correction.
        </p>
      </div>
    );
  }

  if (issue.masterRecordId) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <DetailField label="Master Record" value={`#${issue.masterRecordId}`} />
        {issue.committedRecordId && issue.committedRecordId !== issue.masterRecordId && (
          <DetailField label="Committed Record" value={`#${issue.committedRecordId}`} />
        )}
      </dl>
    );
  }

  return <p className="text-xs text-gray-400 italic">No additional context for this issue type</p>;
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-gray-400 whitespace-nowrap">{label}</dt>
      <dd className="text-gray-700 font-medium">{value || <span className="text-gray-300 font-normal">—</span>}</dd>
    </>
  );
}

function IssueContextLinks({ issue }: { issue: DbIssue }) {
  const sd = issue.suggestedData;
  const contractId = sd?.contractId as number | null | undefined;
  const contractNumber = sd?.contractNumber as string | null | undefined;

  const links: { label: string; href: string; title: string }[] = [];

  if (contractId) {
    links.push({ label: "Contract", href: `/contracts/${contractId}`, title: `View contract ${contractNumber || contractId}` });
  } else if (issue.code === "CLM-004" && contractNumber) {
    links.push({ label: "Search", href: `/contracts?search=${encodeURIComponent(contractNumber)}`, title: `Search for contract "${contractNumber}"` });
  }

  if (issue.masterRecordId) {
    links.push({ label: "Record", href: `/records/${issue.masterRecordId}`, title: `View matched record #${issue.masterRecordId}` });
  }

  if (issue.committedRecordId && issue.committedRecordId !== issue.masterRecordId) {
    links.push({ label: "Committed", href: `/records/${issue.committedRecordId}`, title: `View committed record #${issue.committedRecordId}` });
  }

  if (links.length === 0) return <span className="text-gray-300">—</span>;

  return (
    <div className="flex items-center gap-1.5">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          title={link.title}
          className="inline-flex items-center gap-0.5 rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-medium text-brennan-blue hover:bg-brennan-blue/20 transition-colors"
        >
          {link.label}
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      ))}
    </div>
  );
}

function ResolutionBadge({ resolution }: { resolution: string }) {
  const colors: Record<string, string> = {
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    adjusted: "bg-blue-100 text-blue-700",
    deferred: "bg-yellow-100 text-yellow-700",
    dismissed: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[resolution] || colors.dismissed}`}>
      {resolution}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Matched Rows Section — clean claim lines that verified OK
// ---------------------------------------------------------------------------

function MatchedRowsSection({ rows }: { rows: MatchedRow[] }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-emerald-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span className="text-sm font-semibold text-emerald-800">
            Verified — {rows.length} claim line{rows.length !== 1 ? "s" : ""} matched
          </span>
        </div>
        <svg className={`h-4 w-4 text-emerald-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-emerald-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-emerald-50 text-left text-emerald-700 uppercase tracking-wider">
                <th className="px-4 py-2">Row</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Contract</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100">
              {rows.map((row) => (
                <tr key={row.id} className="bg-white">
                  <td className="px-4 py-1.5 text-gray-400">#{row.rowNumber}</td>
                  <td className="px-3 py-1.5 font-mono font-medium text-gray-700">{row.itemNumber ?? "—"}</td>
                  <td className="px-3 py-1.5 text-gray-600">{row.contractNumber ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">
                    {row.deviatedPrice ? `$${Number(row.deviatedPrice).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-600">
                    {row.quantity ? Number(row.quantity).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">OK</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatPeriod(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00Z"));
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", timeZone: "UTC" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}
