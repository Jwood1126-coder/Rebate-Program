"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";

interface Distributor {
  id: number;
  code: string;
  name: string;
}

interface CommitSummaryData {
  totalApproved: number;
  recordsCreated: number;
  recordsSuperseded: number;
  recordsUpdated: number;
  itemsCreated: number;
  confirmed: number;
  rejected: number;
  dismissed: number;
  deferred: number;
}

interface ReconciliationRun {
  id: number;
  distributorId: number;
  claimPeriodStart: string;
  claimPeriodEnd: string;
  status: string;
  totalClaimLines: number;
  validatedCount: number;
  exceptionCount: number;
  approvedCount: number;
  rejectedCount: number;
  startedAt: string;
  completedAt: string | null;
  commitSummary: CommitSummaryData | null;
  distributor: { code: string; name: string };
  runBy: { displayName: string };
  claimBatch: { fileName: string; totalRows: number; validRows: number; errorRows: number } | null;
  posBatch: { id: number; fileName: string; totalRows: number; validRows: number; errorRows: number } | null;
  _count: { issues: number };
}

interface ParseResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warnings: string[];
  errors?: string[];
}

interface ValidationIssue {
  code: string;
  severity: string;
  category: string;
  description: string;
  rowNumber: number;
  suggestedAction: string;
}

interface ValidationResult {
  success: boolean;
  runId: number;
  totalRows: number;
  validatedCount: number;
  exceptionCount: number;
  matchedCount: number;
  issues: ValidationIssue[];
}

// Issue from the database (with id and resolution fields)
interface ClaimRowData {
  rowNumber: number;
  contractNumber: string | null;
  planCode: string | null;
  itemNumber: string | null;
  deviatedPrice: number | null;
  quantity: number | null;
  claimedAmount: number | null;
  transactionDate: string | null;
  endUserCode: string | null;
  endUserName: string | null;
  distributorOrderNumber: string | null;
  matchedRecordId: number | null;
}

interface DbIssue {
  id: number;
  reconciliationRunId: number;
  code: string;
  severity: string;
  category: string;
  description: string;
  claimRowId: number | null;
  masterRecordId: number | null;
  committedRecordId: number | null;
  suggestedAction: string;
  suggestedData: Record<string, unknown> | null;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedById: number | null;
  resolvedAt: string | null;
  resolvedBy: { displayName: string } | null;
  claimRow: ClaimRowData | null;
}

interface RunProgress {
  totalIssues: number;
  resolvedCount: number;
  pendingCount: number;
  allResolved: boolean;
  breakdown: Record<string, number>;
}

interface QueueItem {
  distributorId: number;
  distributorCode: string;
  distributorName: string;
  hasContracts: boolean;
  status: "not_submitted" | "staged" | "needs_validation" | "in_review" | "reviewed" | "committed";
  run: {
    id: number;
    status: string;
    fileName: string | null;
    totalRows: number;
    validatedCount: number;
    exceptionCount: number;
    unresolvedCount: number;
    startedAt: string;
    runBy: string;
  } | null;
}

interface QueueSummary {
  period: string;
  periodLabel: string;
  totalDistributors: number;
  notSubmitted: number;
  needsValidation: number;
  inReview: number;
  completed: number;
}

export default function ReconciliationPageClient({
  distributors,
  initialRuns,
  configuredDistributors,
}: {
  distributors: Distributor[];
  initialRuns: ReconciliationRun[];
  configuredDistributors: string[];
}) {
  const [runs, setRuns] = useState<ReconciliationRun[]>(initialRuns);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; parseResult?: ParseResult; error?: string } | null>(null);

  // Upload form state
  const [selectedDistributorId, setSelectedDistributorId] = useState<string>("");
  const [claimPeriod, setClaimPeriod] = useState<string>(getDefaultPeriod());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation state
  const [validating, setValidating] = useState<number | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // Review state (Phase R3)
  const [reviewRunId, setReviewRunId] = useState<number | null>(null);
  const [reviewIssues, setReviewIssues] = useState<DbIssue[]>([]);
  const [reviewProgress, setReviewProgress] = useState<RunProgress | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [resolvingIssue, setResolvingIssue] = useState<number | null>(null);
  const [expandedIssueId, setExpandedIssueId] = useState<number | null>(null);
  const [bulkResolving, setBulkResolving] = useState(false);

  // Commit state (Phase R4)
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    success: boolean;
    summary?: { totalApproved: number; recordsCreated: number; recordsSuperseded: number; recordsUpdated: number; itemsCreated: number; confirmed: number; rejected: number; dismissed: number; deferred: number };
    error?: string;
    failedIssueId?: number;
  } | null>(null);

  // Reopen state
  const [reopening, setReopening] = useState<number | null>(null);

  // POS upload state
  const [posUploadRunId, setPosUploadRunId] = useState<number | null>(null);
  const [posFile, setPosFile] = useState<File | null>(null);
  const [posUploading, setPosUploading] = useState(false);
  const [posUploadResult, setPosUploadResult] = useState<{ success: boolean; parseResult?: ParseResult; error?: string } | null>(null);
  const posFileInputRef = useRef<HTMLInputElement>(null);

  // Queue state
  const [queuePeriod, setQueuePeriod] = useState<string>(getDefaultPeriod());
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);

  const fetchQueue = useCallback(async (period: string) => {
    setQueueLoading(true);
    try {
      const res = await fetch(`/api/reconciliation/queue?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setQueueItems(data.queue);
        setQueueSummary(data.summary);
      }
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(queuePeriod); }, [queuePeriod, fetchQueue]);

  // Refresh queue when runs change (after upload, validation, or review completion)
  const refreshQueue = useCallback(() => fetchQueue(queuePeriod), [fetchQueue, queuePeriod]);

  // Filter state for runs table
  const [filterDistributor, setFilterDistributor] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");

  const selectedDistributor = distributors.find(d => d.id === Number(selectedDistributorId));
  const hasMapping = selectedDistributor ? configuredDistributors.includes(selectedDistributor.code) : false;

  // The run currently being reviewed (for durable commit summary)
  const reviewRun = useMemo(
    () => reviewRunId ? runs.find(r => r.id === reviewRunId) ?? null : null,
    [reviewRunId, runs]
  );

  // Filtered runs
  const filteredRuns = useMemo(() => {
    return runs.filter(run => {
      if (filterDistributor && run.distributor.code !== filterDistributor) return false;
      if (filterStatus && run.status !== filterStatus) return false;
      if (filterDateFrom) {
        const periodStart = run.claimPeriodStart.slice(0, 10);
        if (periodStart < filterDateFrom) return false;
      }
      if (filterDateTo) {
        const periodEnd = run.claimPeriodEnd.slice(0, 10);
        if (periodEnd > filterDateTo) return false;
      }
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const matchId = `#${run.id}`.includes(q);
        const matchDistributor = run.distributor.code.toLowerCase().includes(q) || run.distributor.name.toLowerCase().includes(q);
        const matchFile = run.claimBatch?.fileName?.toLowerCase().includes(q);
        const matchBy = run.runBy.displayName.toLowerCase().includes(q);
        if (!matchId && !matchDistributor && !matchFile && !matchBy) return false;
      }
      return true;
    });
  }, [runs, filterDistributor, filterStatus, filterDateFrom, filterDateTo, filterSearch]);

  // Unique statuses from current runs for filter dropdown
  const availableStatuses = useMemo(() => {
    return [...new Set(runs.map(r => r.status))].sort();
  }, [runs]);

  // Unique distributors from current runs for filter dropdown
  const availableDistributors = useMemo(() => {
    const codes = [...new Set(runs.map(r => r.distributor.code))].sort();
    return codes.map(code => {
      const run = runs.find(r => r.distributor.code === code)!;
      return { code, name: run.distributor.name };
    });
  }, [runs]);

  const hasActiveFilters = filterDistributor || filterStatus || filterDateFrom || filterDateTo || filterSearch;

  async function handleUpload() {
    if (!selectedFile || !selectedDistributorId || !claimPeriod) return;

    setUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("distributorId", selectedDistributorId);
    formData.append("claimPeriod", claimPeriod);

    try {
      const res = await fetch("/api/reconciliation/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setUploadResult({ success: true, parseResult: data.parseResult });
        await refreshRuns();
      } else {
        setUploadResult({
          success: false,
          error: data.error || "Upload failed",
          parseResult: data.parseResult,
        });
      }
    } catch {
      setUploadResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setUploading(false);
    }
  }

  async function handleValidate(runId: number) {
    setValidating(runId);
    setValidationResult(null);

    try {
      const res = await fetch(`/api/reconciliation/runs/${runId}/validate`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok) {
        setValidationResult(data);
        await refreshRuns();
      }
    } catch {
      // ignore
    } finally {
      setValidating(null);
    }
  }

  const loadReviewIssues = useCallback(async (runId: number) => {
    setLoadingReview(true);
    try {
      const res = await fetch(`/api/reconciliation/runs/${runId}/issues`);
      if (res.ok) {
        const data = await res.json();
        setReviewIssues(data.issues);
        setReviewProgress(data.progress);
        setReviewRunId(runId);
      }
    } catch {
      // ignore
    } finally {
      setLoadingReview(false);
    }
  }, []);

  async function handleReview(runId: number) {
    // Clear validation result panel, show review panel instead
    setValidationResult(null);
    await loadReviewIssues(runId);
  }

  async function handleResolve(issueId: number, resolution: string, note?: string) {
    setResolvingIssue(issueId);
    try {
      const res = await fetch(`/api/reconciliation/runs/${reviewRunId}/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, resolutionNote: note }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update local state
        setReviewIssues(prev =>
          prev.map(issue =>
            issue.id === issueId
              ? { ...issue, resolution: data.issue.resolution, resolvedAt: data.issue.resolvedAt }
              : issue
          )
        );
        setReviewProgress(data.runProgress);
        // If all resolved, refresh runs to update status
        if (data.runProgress?.allResolved) {
          await refreshRuns();
        }
      }
    } catch {
      // ignore
    } finally {
      setResolvingIssue(null);
    }
  }

  async function handleBulkResolve(resolution: string, filter: 'all' | 'warnings' | 'errors') {
    if (!reviewRunId) return;
    setBulkResolving(true);

    const pendingIssues = reviewIssues.filter(i => !i.resolution);
    const filtered = filter === 'all'
      ? pendingIssues
      : filter === 'warnings'
        ? pendingIssues.filter(i => i.severity === 'warning')
        : pendingIssues.filter(i => i.severity === 'error');

    const issueIds = filtered.map(i => i.id);
    if (issueIds.length === 0) {
      setBulkResolving(false);
      return;
    }

    try {
      const res = await fetch(`/api/reconciliation/runs/${reviewRunId}/issues/bulk-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds, resolution }),
      });
      if (res.ok) {
        // Reload issues to get fresh state
        await loadReviewIssues(reviewRunId);
        await refreshRuns();
      }
    } catch {
      // ignore
    } finally {
      setBulkResolving(false);
    }
  }

  async function handlePosUpload() {
    if (!posFile || !posUploadRunId) return;
    setPosUploading(true);
    setPosUploadResult(null);

    const formData = new FormData();
    formData.append("file", posFile);
    formData.append("runId", String(posUploadRunId));

    try {
      const res = await fetch("/api/reconciliation/pos-upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setPosUploadResult({ success: true, parseResult: data.parseResult });
        await refreshRuns();
      } else {
        setPosUploadResult({ success: false, error: data.error || "POS upload failed", parseResult: data.parseResult });
      }
    } catch {
      setPosUploadResult({ success: false, error: "Network error." });
    } finally {
      setPosUploading(false);
    }
  }

  function closePosUpload() {
    setPosUploadRunId(null);
    setPosFile(null);
    setPosUploadResult(null);
    if (posFileInputRef.current) posFileInputRef.current.value = "";
  }

  async function refreshRuns() {
    const runsRes = await fetch("/api/reconciliation/runs");
    if (runsRes.ok) {
      setRuns(await runsRes.json());
    }
    refreshQueue();
  }

  async function handleCommit(runId: number) {
    setCommitting(true);
    setCommitResult(null);
    try {
      const res = await fetch(`/api/reconciliation/runs/${runId}/commit`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setCommitResult(data);
        await refreshRuns();
      } else {
        setCommitResult({ success: false, error: data.error || "Commit failed" });
      }
    } catch {
      setCommitResult({ success: false, error: "Network error" });
    } finally {
      setCommitting(false);
    }
  }

  async function handleReopen(runId: number) {
    if (!confirm("Reopen this run? All resolutions will be cleared and the run will return to review status.")) return;
    setReopening(runId);
    try {
      const res = await fetch(`/api/reconciliation/runs/${runId}/reopen`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        await refreshRuns();
      } else {
        alert(data.error || "Failed to reopen run");
      }
    } catch {
      alert("Network error");
    } finally {
      setReopening(null);
    }
  }

  function resetUpload() {
    setShowUpload(false);
    setUploadResult(null);
    setSelectedFile(null);
    setSelectedDistributorId("");
    setClaimPeriod(getDefaultPeriod());
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brennan-text">Reconciliation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload monthly claim files and validate against contract terms
          </p>
        </div>
        {!showUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90 transition-colors"
          >
            New Reconciliation
          </button>
        )}
      </div>

      {/* Monthly Reconciliation Checklist */}
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
        <div className="border-b border-brennan-border px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-brennan-text">Monthly Checklist</h2>
              <input
                type="month"
                value={queuePeriod}
                onChange={(e) => setQueuePeriod(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
              />
            </div>
            {queueSummary && (
              <div className="flex items-center gap-4 text-xs">
                <span className="text-green-700 font-medium">{queueSummary.completed} done</span>
                <span className="text-amber-600 font-medium">{queueSummary.inReview + queueSummary.needsValidation} in progress</span>
                <span className="text-gray-500">{queueSummary.notSubmitted} pending</span>
              </div>
            )}
          </div>
        </div>

        {queueLoading ? (
          <div className="px-5 py-6 text-center text-sm text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Progress bar */}
            {queueSummary && queueSummary.totalDistributors > 0 && (
              <div className="px-5 pt-3 pb-1">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="bg-green-500 transition-all"
                    style={{ width: `${(queueSummary.completed / queueSummary.totalDistributors) * 100}%` }}
                  />
                  <div
                    className="bg-amber-400 transition-all"
                    style={{ width: `${((queueSummary.inReview + queueSummary.needsValidation) / queueSummary.totalDistributors) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400 text-right">
                  {queueSummary.completed}/{queueSummary.totalDistributors} distributors reconciled for {queueSummary.periodLabel}
                </p>
              </div>
            )}

            {/* Distributor checklist */}
            <div className="divide-y divide-brennan-border">
              {queueItems.filter(q => q.hasContracts).map((item) => (
                <div key={item.distributorCode} className="flex items-center justify-between px-5 py-3 hover:bg-brennan-light/40 transition-colors">
                  <div className="flex items-center gap-3">
                    {/* Status icon */}
                    <QueueStatusIcon status={item.status} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-bold text-brennan-blue">
                          {item.distributorCode}
                        </span>
                        <span className="text-sm font-medium text-brennan-text">{item.distributorName}</span>
                      </div>
                      {item.run && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {item.run.fileName ?? "Claim file"} — {item.run.totalRows} rows
                          {item.run.exceptionCount > 0 && (
                            <span className="text-amber-600 ml-1">
                              ({item.run.unresolvedCount} unresolved of {item.run.exceptionCount} exceptions)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <QueueStatusBadge status={item.status} />
                    {item.status === "not_submitted" && (
                      <button
                        onClick={() => {
                          const dist = distributors.find(d => d.id === item.distributorId);
                          if (dist) {
                            setSelectedDistributorId(String(dist.id));
                            setClaimPeriod(queuePeriod);
                            setShowUpload(true);
                          }
                        }}
                        className="rounded bg-brennan-blue px-3 py-1 text-xs font-medium text-white hover:bg-brennan-blue/90"
                      >
                        Upload
                      </button>
                    )}
                    {item.status === "needs_validation" && item.run && (
                      <button
                        onClick={() => handleValidate(item.run!.id)}
                        disabled={validating !== null}
                        className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        {validating === item.run.id ? "Validating..." : "Validate"}
                      </button>
                    )}
                    {item.status === "in_review" && item.run && (
                      <button
                        onClick={() => handleReview(item.run!.id)}
                        className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
                      >
                        Review ({item.run.unresolvedCount})
                      </button>
                    )}
                    {item.status === "reviewed" && item.run && (
                      <button
                        onClick={() => handleCommit(item.run!.id)}
                        disabled={committing}
                        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {committing ? "Committing..." : "Commit"}
                      </button>
                    )}
                    {item.status === "committed" && (
                      <span className="text-xs text-green-600 font-medium">Committed</span>
                    )}
                  </div>
                </div>
              ))}

              {queueItems.filter(q => q.hasContracts).length === 0 && (
                <div className="px-5 py-6 text-center text-sm text-gray-400">
                  No distributors with active contracts.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Upload Panel */}
      {showUpload && (
        <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
          <div className="border-b border-brennan-border px-5 py-3">
            <h2 className="text-base font-semibold text-brennan-text">Upload Claim File</h2>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Step 1: Distributor and Period */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Distributor</label>
                <select
                  value={selectedDistributorId}
                  onChange={(e) => setSelectedDistributorId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
                >
                  <option value="">Select distributor...</option>
                  {distributors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                      {!configuredDistributors.includes(d.code) ? " (no mapping)" : ""}
                    </option>
                  ))}
                </select>
                {selectedDistributor && !hasMapping && (
                  <p className="mt-1 text-xs text-amber-600">
                    No column mapping configured for {selectedDistributor.code}.{" "}
                    <a href="/settings" className="underline text-brennan-blue hover:text-brennan-blue/80">
                      Configure in Settings
                    </a>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Claim Period</label>
                <input
                  type="month"
                  value={claimPeriod}
                  onChange={(e) => setClaimPeriod(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
                />
              </div>
            </div>

            {/* Step 2: File upload */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Claim File (.xlsx or .csv)</label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brennan-light file:px-4 file:py-2 file:text-sm file:font-medium file:text-brennan-blue hover:file:bg-brennan-light/80"
                />
              </div>
              {selectedFile && (
                <p className="mt-1 text-xs text-gray-500">
                  {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {/* Upload result */}
            {uploadResult && (
              <div className={`rounded-lg border p-4 ${uploadResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                {uploadResult.success ? (
                  <div>
                    <p className="text-sm font-medium text-green-800">Claim file staged successfully</p>
                    {uploadResult.parseResult && (
                      <div className="mt-2 flex gap-4 text-xs text-green-700">
                        <span>{uploadResult.parseResult.totalRows} rows parsed</span>
                        <span>{uploadResult.parseResult.validRows} valid</span>
                        {uploadResult.parseResult.errorRows > 0 && (
                          <span className="text-amber-700">{uploadResult.parseResult.errorRows} with errors</span>
                        )}
                      </div>
                    )}
                    {uploadResult.parseResult?.warnings && uploadResult.parseResult.warnings.length > 0 && (
                      <ul className="mt-2 text-xs text-amber-700 list-disc pl-4">
                        {uploadResult.parseResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-red-800">{uploadResult.error}</p>
                    {uploadResult.parseResult?.errors && uploadResult.parseResult.errors.length > 0 && (
                      <ul className="mt-2 text-xs text-red-700 list-disc pl-4">
                        {uploadResult.parseResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={resetUpload}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || !selectedDistributorId || !claimPeriod || !hasMapping || uploading}
                className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? "Uploading..." : "Upload & Parse"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Results Panel (shown right after validation, before review) */}
      {validationResult && (
        <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
          <div className="border-b border-brennan-border px-5 py-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-brennan-text">
              Validation Results — Run #{validationResult.runId}
            </h2>
            <div className="flex items-center gap-3">
              {validationResult.issues.length > 0 && (
                <button
                  onClick={() => handleReview(validationResult.runId)}
                  className="rounded bg-brennan-blue px-3 py-1 text-xs font-medium text-white hover:bg-brennan-blue/90"
                >
                  Review Exceptions
                </button>
              )}
              <button
                onClick={() => setValidationResult(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Dismiss
              </button>
            </div>
          </div>

          <div className="px-5 py-4">
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <SummaryCard label="Total Rows" value={validationResult.totalRows} />
              <SummaryCard label="Matched" value={validationResult.matchedCount} color="green" />
              <SummaryCard label="Exceptions" value={validationResult.exceptionCount} color={validationResult.exceptionCount > 0 ? "amber" : "green"} />
              <SummaryCard
                label="Clean Rate"
                value={validationResult.totalRows > 0
                  ? `${Math.round((validationResult.matchedCount / validationResult.totalRows) * 100)}%`
                  : "—"}
                color={validationResult.matchedCount === validationResult.totalRows ? "green" : "amber"}
              />
            </div>

            {/* Exception list */}
            {validationResult.issues.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Exceptions ({validationResult.issues.length})
                </h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-500 uppercase tracking-wider">
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Severity</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {validationResult.issues.map((issue, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="px-3 py-2 font-mono">{issue.rowNumber}</td>
                          <td className="px-3 py-2 font-mono font-medium">{issue.code}</td>
                          <td className="px-3 py-2">
                            <SeverityBadge severity={issue.severity} />
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-700">{issue.category}</td>
                          <td className="px-3 py-2 text-gray-600 max-w-md">{issue.description}</td>
                          <td className="px-3 py-2 text-gray-500">{issue.suggestedAction}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {validationResult.issues.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm font-medium text-green-700">All claim lines validated successfully — no exceptions found.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Exception Review Panel (Phase R3) */}
      {reviewRunId && !validationResult && (
        <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
          <div className="border-b border-brennan-border px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-brennan-text">
                Exception Review — Run #{reviewRunId}
              </h2>
              {reviewProgress && (
                <span className="text-xs text-gray-500">
                  {reviewProgress.resolvedCount}/{reviewProgress.totalIssues} resolved
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {reviewRun && ["review", "reviewed", "committed"].includes(reviewRun.status) && (
                <a
                  href={`/api/export/reconciliation-run/${reviewRunId}`}
                  download
                  className="rounded border border-brennan-border px-2.5 py-1 text-xs font-medium text-brennan-blue hover:bg-brennan-light transition-colors"
                >
                  Export CSV
                </a>
              )}
              <button
                onClick={() => { setReviewRunId(null); setReviewIssues([]); setReviewProgress(null); setCommitResult(null); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
            </div>
          </div>

          <div className="px-5 py-4">
            {loadingReview ? (
              <div className="text-center py-6 text-sm text-gray-500">Loading issues...</div>
            ) : (
              <>
                {/* Progress bar */}
                {reviewProgress && reviewProgress.totalIssues > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">Resolution Progress</span>
                      <span className="text-xs font-medium text-gray-700">
                        {Math.round((reviewProgress.resolvedCount / reviewProgress.totalIssues) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${reviewProgress.allResolved ? 'bg-green-500' : 'bg-brennan-blue'}`}
                        style={{ width: `${(reviewProgress.resolvedCount / reviewProgress.totalIssues) * 100}%` }}
                      />
                    </div>
                    {reviewProgress.allResolved && (
                      <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
                        <p className="text-sm font-medium text-green-800">All exceptions resolved</p>
                        <p className="mt-1 text-xs text-green-700">
                          {reviewProgress.breakdown.approved ?? 0} approved, {reviewProgress.breakdown.rejected ?? 0} rejected, {reviewProgress.breakdown.dismissed ?? 0} dismissed
                        </p>

                        {commitResult?.error ? (
                          <div className="mt-2 rounded border border-red-200 bg-red-50 p-2">
                            <p className="text-xs text-red-700">{commitResult.error}</p>
                            {commitResult.failedIssueId && (
                              <p className="text-xs text-red-500 mt-0.5">Issue ID: {commitResult.failedIssueId}</p>
                            )}
                          </div>
                        ) : reviewRun?.status === "committed" ? null : (
                          <button
                            onClick={() => handleCommit(reviewRunId!)}
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
                {reviewRun?.status === "committed" && (
                  <RunOutcomePanel run={reviewRun} />
                )}

                {/* Bulk actions */}
                {reviewProgress && reviewProgress.pendingCount > 0 && (
                  <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-xs font-medium text-gray-600 mr-2">Bulk actions:</span>
                    <button
                      onClick={() => handleBulkResolve('dismissed', 'warnings')}
                      disabled={bulkResolving}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-white disabled:opacity-50"
                    >
                      Dismiss all warnings
                    </button>
                    <button
                      onClick={() => handleBulkResolve('rejected', 'errors')}
                      disabled={bulkResolving}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject all errors
                    </button>
                    <button
                      onClick={() => handleBulkResolve('approved', 'all')}
                      disabled={bulkResolving}
                      className="rounded border border-green-200 px-2 py-1 text-xs text-green-600 hover:bg-green-50 disabled:opacity-50"
                    >
                      Approve all pending
                    </button>
                    {bulkResolving && <span className="text-xs text-gray-400 ml-2">Processing...</span>}
                  </div>
                )}

                {/* Issues table */}
                {reviewIssues.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-500 uppercase tracking-wider">
                          <th className="w-5 px-1 py-2"></th>
                          <th className="px-3 py-2">Code</th>
                          <th className="px-3 py-2">Severity</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">If Approved</th>
                          <th className="px-3 py-2">Context</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {reviewIssues.map((issue) => {
                          const isExpanded = expandedIssueId === issue.id;
                          return (
                          <React.Fragment key={issue.id}>
                          <tr
                            className={`hover:bg-gray-50/50 cursor-pointer ${issue.resolution ? 'opacity-60' : ''} ${isExpanded ? 'bg-brennan-light/30' : ''}`}
                            onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                          >
                            <td className="px-1 py-2 text-center text-gray-400">
                              <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                              </svg>
                            </td>
                            <td className="px-3 py-2 font-mono font-medium">{issue.code}</td>
                            <td className="px-3 py-2">
                              <SeverityBadge severity={issue.severity} />
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-700">{issue.category}</td>
                            <td className="px-3 py-2 text-gray-500">
                              <CommitConsequenceLabel issue={issue} />
                            </td>
                            <td className="px-3 py-2">
                              <IssueContextLinks issue={issue} />
                            </td>
                            <td className="px-3 py-2">
                              {issue.resolution ? (
                                <ResolutionBadge resolution={issue.resolution} />
                              ) : (
                                <span className="text-gray-400 italic">pending</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                              {issue.resolution ? (
                                <span className="text-xs text-gray-400">
                                  {issue.resolvedBy?.displayName || ''}
                                </span>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleResolve(issue.id, 'approved')}
                                    disabled={resolvingIssue === issue.id}
                                    className="rounded bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                                    title="Approve this claim line"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleResolve(issue.id, 'rejected')}
                                    disabled={resolvingIssue === issue.id}
                                    className="rounded bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                                    title="Reject this claim line"
                                  >
                                    Reject
                                  </button>
                                  <button
                                    onClick={() => handleResolve(issue.id, 'dismissed')}
                                    disabled={resolvingIssue === issue.id}
                                    className="rounded bg-gray-50 border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                                    title="Dismiss — no action needed"
                                  >
                                    Dismiss
                                  </button>
                                  {resolvingIssue === issue.id && (
                                    <span className="text-gray-400 ml-1">...</span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="bg-gray-50/80 px-0 py-0">
                                <IssueDetailPanel issue={issue} />
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {reviewIssues.length === 0 && !loadingReview && (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500">No exceptions for this run.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Reconciliation Runs Table */}
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
        <div className="border-b border-brennan-border px-5 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-brennan-text">Reconciliation Runs</h2>
            {runs.length > 0 && (
              <span className="text-xs text-gray-400">
                {filteredRuns.length === runs.length
                  ? `${runs.length} runs`
                  : `${filteredRuns.length} of ${runs.length} runs`}
              </span>
            )}
          </div>
        </div>

        {/* Filter bar — matches Records page pattern */}
        {runs.length > 0 && (
          <div className="border-b border-brennan-border bg-white px-5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterDistributor}
                onChange={(e) => setFilterDistributor(e.target.value)}
                className="h-8 rounded border border-brennan-border bg-white px-2 text-xs text-brennan-text focus:border-brennan-blue focus:outline-none"
              >
                <option value="">All Distributors</option>
                {availableDistributors.map((d) => (
                  <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-8 rounded border border-brennan-border bg-white px-2 text-xs text-brennan-text focus:border-brennan-blue focus:outline-none"
              >
                <option value="">All Statuses</option>
                {availableStatuses.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>

              <div className="mx-1 h-5 w-px bg-brennan-border" />

              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-400">From</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="h-8 rounded border border-brennan-border bg-white px-2 text-xs text-brennan-text focus:border-brennan-blue focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-400">To</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="h-8 rounded border border-brennan-border bg-white px-2 text-xs text-brennan-text focus:border-brennan-blue focus:outline-none"
                />
              </div>

              <div className="mx-1 h-5 w-px bg-brennan-border" />

              <input
                type="text"
                placeholder="Search..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="h-8 min-w-[160px] flex-1 rounded border border-brennan-border px-2 text-xs focus:border-brennan-blue focus:outline-none"
              />
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterDistributor(""); setFilterStatus(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterSearch(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* POS Upload Panel */}
        {posUploadRunId && (
          <div className="mx-5 mb-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-indigo-900">
                Attach POS Report to Run #{posUploadRunId}
              </h3>
              <button onClick={closePosUpload} className="text-gray-400 hover:text-gray-600 text-xs">
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Upload the distributor&apos;s POS (Point of Sale) report for cross-referencing against claim data.
              POS data is supplementary — differences are flagged as warnings for review.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">POS File (.xlsx, .csv)</label>
                <input
                  ref={posFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setPosFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-gray-500 file:mr-3 file:rounded file:border-0 file:bg-indigo-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-700 hover:file:bg-indigo-200"
                />
              </div>
              <button
                onClick={handlePosUpload}
                disabled={!posFile || posUploading}
                className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {posUploading ? "Uploading..." : "Upload POS"}
              </button>
            </div>
            {posUploadResult && (
              <div className={`mt-3 rounded p-3 text-xs ${posUploadResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                {posUploadResult.success ? (
                  <div>
                    <p className="font-medium text-green-800">POS file attached successfully.</p>
                    {posUploadResult.parseResult && (
                      <p className="text-green-700 mt-1">
                        {posUploadResult.parseResult.totalRows} rows parsed
                        ({posUploadResult.parseResult.validRows} valid, {posUploadResult.parseResult.errorRows} errors)
                      </p>
                    )}
                    <button onClick={closePosUpload} className="mt-2 text-green-700 hover:underline font-medium">
                      Done
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-red-800">{posUploadResult.error}</p>
                    {posUploadResult.parseResult && (
                      <p className="text-red-700 mt-1">
                        {posUploadResult.parseResult.totalRows} rows found, {posUploadResult.parseResult.errorRows} had errors.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {runs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <ShieldCheckIcon className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-500">No reconciliation runs yet</p>
            <p className="mt-1 text-xs text-gray-400">
              Upload a distributor claim file to start your first reconciliation.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brennan-border bg-gray-50/50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2">Run</th>
                  <th className="px-4 py-2">Distributor</th>
                  <th className="px-4 py-2">Period</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Claim Lines</th>
                  <th className="px-4 py-2">Matched</th>
                  <th className="px-4 py-2">Exceptions</th>
                  <th className="px-4 py-2">POS</th>
                  <th className="px-4 py-2">Started</th>
                  <th className="px-4 py-2">By</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRuns.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-400">
                      No runs match your filters.{" "}
                      <button
                        onClick={() => { setFilterDistributor(""); setFilterStatus(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterSearch(""); }}
                        className="text-brennan-blue hover:underline"
                      >
                        Clear filters
                      </button>
                    </td>
                  </tr>
                )}
                {filteredRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2 font-medium text-brennan-blue">#{run.id}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{run.distributor.code}</span>
                      <span className="ml-1 text-xs text-gray-400">{run.distributor.name}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{formatPeriod(run.claimPeriodStart)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-2 text-gray-600">{run.totalClaimLines}</td>
                    <td className="px-4 py-2">
                      {run.approvedCount > 0 ? (
                        <span className="text-green-700 font-medium">{run.approvedCount}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {run._count.issues > 0 ? (
                        <span className="text-amber-600 font-medium">{run._count.issues}</span>
                      ) : run.status === "reviewed" || run.status === "review" ? (
                        <span className="text-green-600">0</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {run.posBatch ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                          <span className="text-green-700 font-medium">{run.posBatch.validRows}</span>
                          <span className="text-gray-400">rows</span>
                        </span>
                      ) : run.status !== "committed" ? (
                        <button
                          onClick={() => setPosUploadRunId(run.id)}
                          className="text-xs text-brennan-blue hover:underline"
                        >
                          + Add POS
                        </button>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{formatDate(run.startedAt)}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{run.runBy.displayName}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        {run.status === "staged" && (
                          <button
                            onClick={() => handleValidate(run.id)}
                            disabled={validating === run.id}
                            className="rounded bg-brennan-blue px-3 py-1 text-xs font-medium text-white hover:bg-brennan-blue/90 disabled:opacity-50"
                          >
                            {validating === run.id ? "Validating..." : "Validate"}
                          </button>
                        )}
                        {run.status === "review" && (
                          <>
                            <button
                              onClick={() => handleReview(run.id)}
                              disabled={loadingReview}
                              className="rounded bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                            >
                              Review
                            </button>
                            <button
                              onClick={() => handleValidate(run.id)}
                              disabled={validating === run.id}
                              className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {validating === run.id ? "..." : "Re-validate"}
                            </button>
                          </>
                        )}
                        {run.status === "reviewed" && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleCommit(run.id)}
                              disabled={committing}
                              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {committing ? "..." : "Commit"}
                            </button>
                            <button
                              onClick={() => handleReopen(run.id)}
                              disabled={reopening === run.id}
                              className="rounded border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {reopening === run.id ? "..." : "Reopen"}
                            </button>
                            <button
                              onClick={() => handleReview(run.id)}
                              disabled={loadingReview}
                              className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            >
                              View
                            </button>
                          </div>
                        )}
                        {run.status === "committed" && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleReview(run.id)}
                              disabled={loadingReview}
                              className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            >
                              View
                            </button>
                            <a
                              href={`/api/export/reconciliation-run/${run.id}`}
                              download
                              className="rounded border border-brennan-border px-3 py-1 text-xs font-medium text-brennan-blue hover:bg-brennan-light transition-colors"
                            >
                              Export
                            </a>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultPeriod(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
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
  });
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const colorClass = color === "green" ? "text-green-700" : color === "amber" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    staged: "bg-blue-100 text-blue-700",
    running: "bg-yellow-100 text-yellow-700",
    review: "bg-amber-100 text-amber-700",
    reviewed: "bg-indigo-100 text-indigo-700",
    committed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  const labels: Record<string, string> = {
    reviewed: "ready to commit",
    committed: "committed",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || colors.draft}`}>
      {labels[status] ?? status}
    </span>
  );
}

/**
 * Durable run outcome panel — shown when viewing a committed run.
 * Reads from the persisted commitSummary field, not ephemeral state.
 */
function RunOutcomePanel({ run }: { run: ReconciliationRun }) {
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

      {/* Run context */}
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

      {/* Resolution breakdown */}
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

      {/* Master data changes */}
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

      {/* No monetary totals — approvedAmount/rejectedAmount are not yet populated */}
    </div>
  );
}

/**
 * Renders contextual deep links for a reconciliation issue.
 * Links to the relevant contract detail page and/or records workspace.
 */
// ---------------------------------------------------------------------------
// Commit consequence label — tells the reviewer what approving will do
// ---------------------------------------------------------------------------
function CommitConsequenceLabel({ issue }: { issue: DbIssue }) {
  const sd = issue.suggestedData;
  const code = issue.code;

  if (code === "CLM-001") {
    const oldPrice = sd?.oldPrice as number | undefined;
    const newPrice = sd?.newPrice as number | undefined;
    if (oldPrice != null && newPrice != null) {
      return (
        <span className="text-amber-700">
          Update price ${oldPrice.toFixed(2)} → ${newPrice.toFixed(2)}
        </span>
      );
    }
    return <span className="text-amber-700">Update master record price</span>;
  }

  if (code === "CLM-003") {
    return <span className="text-blue-700">Add item to contract plan</span>;
  }

  if (code === "CLM-004") {
    return <span className="text-red-700">Contract not found — manual review</span>;
  }

  if (code === "CLM-006") {
    return <span className="text-blue-700">Create new item + record</span>;
  }

  if (code === "CLM-005") {
    return <span className="text-amber-700">Ambiguous match — pick plan</span>;
  }

  if (code === "CLM-007") {
    return <span className="text-red-700">Contract date issue — reject likely</span>;
  }

  if (code === "CLM-009") {
    return <span className="text-gray-500">Possible duplicate — dismiss or reject</span>;
  }

  // CLM-002, CLM-008, CLM-010, CLM-011, CLM-012 — informational
  if (issue.severity === "warning") {
    return <span className="text-gray-500">Informational — no master data change</span>;
  }

  return <span className="text-gray-400">—</span>;
}

// ---------------------------------------------------------------------------
// Expandable issue detail panel — shows claim row + master data context
// ---------------------------------------------------------------------------
function IssueDetailPanel({ issue }: { issue: DbIssue }) {
  const sd = issue.suggestedData;
  const cr = issue.claimRow;

  return (
    <div className="px-8 py-3 space-y-3 border-t border-gray-200">
      {/* Description */}
      <p className="text-xs text-gray-600">{issue.description}</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Left: Claim row data */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Claim Data</h4>
          {cr ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <DetailField label="Row" value={`#${cr.rowNumber}`} />
              <DetailField label="Contract" value={cr.contractNumber} />
              <DetailField label="Plan Code" value={cr.planCode} />
              <DetailField label="Item" value={cr.itemNumber} />
              <DetailField label="Claimed Price" value={cr.deviatedPrice != null ? `$${cr.deviatedPrice.toFixed(2)}` : null} />
              <DetailField label="Quantity" value={cr.quantity != null ? String(cr.quantity) : null} />
              {cr.claimedAmount != null && (
                <DetailField label="Line Amount" value={`$${cr.claimedAmount.toFixed(2)}`} />
              )}
              {cr.transactionDate && (
                <DetailField label="Trans. Date" value={new Date(cr.transactionDate).toLocaleDateString()} />
              )}
              {cr.endUserCode && (
                <DetailField label="End User" value={`${cr.endUserCode}${cr.endUserName ? ` — ${cr.endUserName}` : ''}`} />
              )}
              {cr.distributorOrderNumber && (
                <DetailField label="Order #" value={cr.distributorOrderNumber} />
              )}
            </dl>
          ) : (
            <p className="text-xs text-gray-400 italic">No claim row data available</p>
          )}
        </div>

        {/* Right: Master data / comparison context (varies by issue type) */}
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

      {/* Resolution note if present */}
      {issue.resolutionNote && (
        <div className="text-xs">
          <span className="font-medium text-gray-500">Note: </span>
          <span className="text-gray-600">{issue.resolutionNote}</span>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-gray-400 whitespace-nowrap">{label}</dt>
      <dd className="text-gray-700 font-medium">{value || <span className="text-gray-300 font-normal">—</span>}</dd>
    </>
  );
}

// Issue-type-specific detail for the right column of the expanded panel
function IssueTypeDetail({ issue }: { issue: DbIssue }) {
  const sd = issue.suggestedData;

  if (issue.code === "CLM-001" && sd) {
    // Price mismatch: show side-by-side comparison
    const oldPrice = sd.oldPrice as number | undefined;
    const newPrice = sd.newPrice as number | undefined;
    return (
      <div className="space-y-2">
        {oldPrice != null && newPrice != null && (
          <div className="flex items-center gap-3">
            <div className="rounded border border-gray-200 bg-white px-3 py-1.5 text-center">
              <div className="text-[10px] text-gray-400 uppercase">Contract</div>
              <div className="text-sm font-semibold text-gray-700">${oldPrice.toFixed(4)}</div>
            </div>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-center">
              <div className="text-[10px] text-amber-600 uppercase">Claimed</div>
              <div className="text-sm font-semibold text-amber-700">${newPrice.toFixed(4)}</div>
            </div>
            <div className="text-xs text-gray-400">
              diff ${Math.abs(newPrice - oldPrice).toFixed(4)}
            </div>
          </div>
        )}
        {issue.masterRecordId && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <DetailField label="Master Record" value={`#${issue.masterRecordId}`} />
            {sd.planId != null && <DetailField label="Plan ID" value={`#${sd.planId}`} />}
          </dl>
        )}
        <p className="text-xs text-amber-600">
          If approved: {issue.masterRecordId ? 'supersede or update existing record at claimed price' : 'update contract price'}
        </p>
      </div>
    );
  }

  if (issue.code === "CLM-003" && sd) {
    // Item not in contract
    const candidatePlanIds = sd.candidatePlanIds as number[] | undefined;
    return (
      <div className="space-y-1.5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {sd.contractId != null && <DetailField label="Contract ID" value={`#${sd.contractId}`} />}
          {sd.itemId != null && <DetailField label="Item ID" value={`#${sd.itemId}`} />}
          {sd.planId != null && <DetailField label="Target Plan" value={`#${sd.planId}`} />}
          {sd.claimedPrice != null && <DetailField label="Claimed Price" value={`$${(sd.claimedPrice as number).toFixed(4)}`} />}
          {candidatePlanIds && candidatePlanIds.length > 1 && (
            <DetailField label="Available Plans" value={candidatePlanIds.map(id => `#${id}`).join(', ')} />
          )}
        </dl>
        <p className="text-xs text-blue-600">
          If approved: create new rebate record under {sd.planId != null ? `plan #${sd.planId}` : 'contract plan'} at claimed price
        </p>
      </div>
    );
  }

  if (issue.code === "CLM-006" && sd) {
    // Unknown item
    return (
      <div className="space-y-1.5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <DetailField label="Item Number" value={sd.itemNumber as string | undefined} />
          {sd.contractNumber != null && <DetailField label="Contract" value={String(sd.contractNumber)} />}
          {sd.claimedPrice != null && <DetailField label="Claimed Price" value={`$${(sd.claimedPrice as number).toFixed(4)}`} />}
        </dl>
        <p className="text-xs text-blue-600">
          If approved: create new item &quot;{String(sd.itemNumber)}&quot; + rebate record at claimed price
        </p>
      </div>
    );
  }

  if (issue.code === "CLM-004" && sd) {
    // Contract not found
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
    // Ambiguous plan match
    const candidateIds = sd.candidateRecordIds as number[] | undefined;
    return (
      <div className="space-y-1.5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {sd.contractId != null && <DetailField label="Contract ID" value={`#${sd.contractId}`} />}
          {candidateIds && <DetailField label="Candidate Records" value={candidateIds.map(id => `#${id}`).join(', ')} />}
        </dl>
        <p className="text-xs text-amber-600">
          Multiple plan/price matches found. Review and resolve manually — may need to specify the correct plan.
        </p>
      </div>
    );
  }

  if (issue.code === "CLM-007") {
    // Contract expired / not yet effective
    return (
      <div>
        <p className="text-xs text-red-600">
          Transaction date falls outside the contract&apos;s effective period. Typically rejected unless the contract dates need correction.
        </p>
      </div>
    );
  }

  // Default for informational issues (CLM-002, CLM-008, CLM-009, CLM-010-012)
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

function IssueContextLinks({ issue }: { issue: DbIssue }) {
  const sd = issue.suggestedData;
  const contractId = sd?.contractId as number | null | undefined;
  const contractNumber = sd?.contractNumber as string | null | undefined;

  const links: { label: string; href: string; title: string }[] = [];

  // Link to contract detail page
  if (contractId) {
    links.push({
      label: "Contract",
      href: `/contracts/${contractId}`,
      title: `View contract ${contractNumber || contractId}`,
    });
  } else if (issue.code === "CLM-004" && contractNumber) {
    // Contract not found — link to contracts search
    links.push({
      label: "Search",
      href: `/contracts?search=${encodeURIComponent(contractNumber)}`,
      title: `Search for contract "${contractNumber}"`,
    });
  }

  // Link to the matched master record (existing record found during validation)
  if (issue.masterRecordId) {
    links.push({
      label: "Record",
      href: `/records/${issue.masterRecordId}`,
      title: `View matched record #${issue.masterRecordId}`,
    });
  }

  // Link to the committed record (created/updated during commit)
  if (issue.committedRecordId && issue.committedRecordId !== issue.masterRecordId) {
    links.push({
      label: "Committed",
      href: `/records/${issue.committedRecordId}`,
      title: `View committed record #${issue.committedRecordId}`,
    });
  }

  if (links.length === 0) {
    return <span className="text-gray-300">—</span>;
  }

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

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    error: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[severity] || colors.info}`}>
      {severity}
    </span>
  );
}

function QueueStatusIcon({ status }: { status: string }) {
  if (status === "committed") {
    return (
      <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    );
  }
  if (status === "reviewed") {
    return (
      <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    );
  }
  if (status === "in_review") {
    return (
      <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
    );
  }
  if (status === "needs_validation" || status === "staged") {
    return (
      <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    );
  }
  // not_submitted
  return (
    <svg className="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeDasharray="4 3" />
    </svg>
  );
}

function QueueStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    not_submitted: "bg-gray-100 text-gray-500",
    staged: "bg-blue-100 text-blue-700",
    needs_validation: "bg-blue-100 text-blue-700",
    in_review: "bg-amber-100 text-amber-700",
    reviewed: "bg-indigo-100 text-indigo-700",
    committed: "bg-green-100 text-green-700",
  };
  const labels: Record<string, string> = {
    not_submitted: "Not submitted",
    staged: "Staged",
    needs_validation: "Needs validation",
    in_review: "In review",
    reviewed: "Ready to commit",
    committed: "Committed",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.not_submitted}`}>
      {labels[status] ?? status}
    </span>
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

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}
