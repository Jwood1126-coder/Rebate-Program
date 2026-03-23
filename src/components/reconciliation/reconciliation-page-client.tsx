"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import ColumnMappingModal from "./column-mapping-modal";

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

// Validation/review types now used on /reconciliation/run/[id] only

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
  const router = useRouter();
  const [runs, setRuns] = useState<ReconciliationRun[]>(initialRuns);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; parseResult?: ParseResult; error?: string } | null>(null);

  // Upload form state
  const [selectedDistributorId, setSelectedDistributorId] = useState<string>("");
  const [claimPeriod, setClaimPeriod] = useState<string>(getDefaultPeriod());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Optional POS file in the same upload form
  const [inlinePosFile, setInlinePosFile] = useState<File | null>(null);
  const inlinePosFileInputRef = useRef<HTMLInputElement>(null);
  const [inlinePosResult, setInlinePosResult] = useState<{ success: boolean; parseResult?: ParseResult; error?: string } | null>(null);

  // Validation/review/commit now happen on /reconciliation/run/[id]

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

  // Refs for auto-scrolling to the active workflow step
  const uploadPanelRef = useRef<HTMLDivElement>(null);

  // Scroll a ref into view after React re-renders
  const scrollTo = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // Inline column mapping state (shown when upload detects no mapping)
  interface MappingDetection {
    distributorId: number;
    distributorCode: string;
    distributorName: string;
    headers: string[];
    suggestedMappings: Record<string, string>;
    sampleData: Record<string, string[]>;
    standardFields: Record<string, { label: string; required: boolean; group: string }>;
    totalRows: number;
    fileType?: string; // "claim" or "pos"
  }
  const [mappingDetection, setMappingDetection] = useState<MappingDetection | null>(null);
  const [knownConfigured, setKnownConfigured] = useState<string[]>(configuredDistributors);

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
  const hasMapping = selectedDistributor ? knownConfigured.includes(selectedDistributor.code) : false;

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

  async function handleUpload(confirmed = false) {
    if (!selectedFile || !selectedDistributorId || !claimPeriod) return;

    setUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("distributorId", selectedDistributorId);
    formData.append("claimPeriod", claimPeriod);
    if (confirmed) {
      formData.append("confirmMapping", "true");
    }

    try {
      const res = await fetch("/api/reconciliation/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.needsMapping) {
        // No mapping configured — show inline mapping modal
        setMappingDetection({
          distributorId: data.distributorId,
          distributorCode: data.distributorCode,
          distributorName: data.distributorName,
          headers: data.headers,
          suggestedMappings: data.suggestedMappings,
          sampleData: data.sampleData,
          standardFields: data.standardFields,
          totalRows: data.totalRows,
          fileType: "claim",
        });
      } else if (res.ok) {
        // Auto-upload POS file if provided alongside the claim
        if (inlinePosFile && data.runId) {
          await uploadPosForRun(data.runId, inlinePosFile);
        }
        // Redirect to the dedicated run workflow page
        if (data.runId) {
          router.push(`/reconciliation/run/${data.runId}`);
          return;
        }
        setUploadResult({ success: true, parseResult: data.parseResult });
        await refreshRuns();
      } else {
        setUploadResult({
          success: false,
          error: data.error || "Upload failed",
          parseResult: data.parseResult,
        });
        scrollTo(uploadPanelRef);
      }
    } catch {
      setUploadResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setUploading(false);
    }
  }

  /** Upload a POS file for a given run (used by both inline upload form and standalone POS panel) */
  async function uploadPosForRun(runId: number, file: File) {
    setPosUploading(true);
    setInlinePosResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("runId", String(runId));

    try {
      const res = await fetch("/api/reconciliation/pos-upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.needsMapping) {
        // No POS mapping — show inline mapping modal
        setMappingDetection({
          distributorId: data.distributorId,
          distributorCode: data.distributorCode,
          distributorName: data.distributorName,
          headers: data.headers,
          suggestedMappings: data.suggestedMappings,
          sampleData: data.sampleData,
          standardFields: data.standardFields,
          totalRows: data.totalRows,
          fileType: "pos",
        });
        // Store runId so we can retry after mapping is saved
        setPosUploadRunId(runId);
        setPosFile(file);
      } else if (res.ok) {
        setInlinePosResult({ success: true, parseResult: data.parseResult });
        await refreshRuns();
      } else {
        setInlinePosResult({ success: false, error: data.error || "POS upload failed", parseResult: data.parseResult });
      }
    } catch {
      setInlinePosResult({ success: false, error: "POS upload failed — network error" });
    } finally {
      setPosUploading(false);
    }
  }

  async function handleMappingSaved() {
    // Mapping was saved — update known configured list and auto-retry the upload
    const wasPos = mappingDetection?.fileType === "pos";
    if (mappingDetection) {
      setKnownConfigured(prev =>
        prev.includes(mappingDetection.distributorCode)
          ? prev
          : [...prev, mappingDetection.distributorCode]
      );
    }
    setMappingDetection(null);
    // Auto-retry the correct upload now that mapping is configured
    if (wasPos) {
      await handlePosUpload();
    } else {
      await handleUpload(true);
    }
  }

  // Validate/review/resolve/bulk-resolve now happen on /reconciliation/run/[id]

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

      if (res.ok && data.needsMapping) {
        // No POS mapping configured — show inline mapping modal
        setMappingDetection({
          distributorId: data.distributorId,
          distributorCode: data.distributorCode,
          distributorName: data.distributorName,
          headers: data.headers,
          suggestedMappings: data.suggestedMappings,
          sampleData: data.sampleData,
          standardFields: data.standardFields,
          totalRows: data.totalRows,
          fileType: "pos",
        });
      } else if (res.ok) {
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
    setInlinePosFile(null);
    setInlinePosResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (inlinePosFileInputRef.current) inlinePosFileInputRef.current.value = "";
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
            onClick={() => { setShowUpload(true); scrollTo(uploadPanelRef); }}
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
                            scrollTo(uploadPanelRef);
                          }
                        }}
                        className="rounded border border-brennan-blue px-3 py-1 text-xs font-medium text-brennan-blue hover:bg-brennan-light"
                      >
                        Start →
                      </button>
                    )}
                    {item.status === "needs_validation" && item.run && (
                      <a
                        href={`/reconciliation/run/${item.run.id}`}
                        className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
                      >
                        Validate
                      </a>
                    )}
                    {item.status === "in_review" && item.run && (
                      <a
                        href={`/reconciliation/run/${item.run.id}`}
                        className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
                      >
                        Review ({item.run.unresolvedCount})
                      </a>
                    )}
                    {item.status === "reviewed" && item.run && (
                      <a
                        href={`/reconciliation/run/${item.run.id}`}
                        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                      >
                        Commit
                      </a>
                    )}
                    {item.status === "committed" && item.run && (
                      <a
                        href={`/reconciliation/run/${item.run.id}`}
                        className="text-xs text-green-600 font-medium hover:underline"
                      >
                        View
                      </a>
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
        <div ref={uploadPanelRef} className="rounded-xl border border-brennan-border bg-white shadow-sm">
          <div className="border-b border-brennan-border px-5 py-3">
            <h2 className="text-base font-semibold text-brennan-text">New Reconciliation Run</h2>
            <p className="text-xs text-gray-400 mt-0.5">Upload the claim/debit file and optionally attach the POS report in one step</p>
            <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-3 py-2">
              <p className="text-xs font-medium text-blue-700 mb-1">Required fields in claim file:</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-blue-600">
                <span>• Contract #</span>
                <span>• Part Number / Item #</span>
                <span>• Open Net Price</span>
                <span>• Quantity</span>
                <span>• Transaction Date</span>
              </div>
              <p className="mt-1 text-[10px] text-blue-500">Column names are matched via the distributor&apos;s column mapping configuration.</p>
            </div>
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
                      {!knownConfigured.includes(d.code) ? " (no mapping)" : ""}
                    </option>
                  ))}
                </select>
                {selectedDistributor && !hasMapping && (
                  <p className="mt-1 text-xs text-amber-600">
                    No column mapping configured for {selectedDistributor.code} yet &mdash; you&apos;ll be prompted to set one up when you upload.
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

            {/* Step 2: File uploads — Claim (required) + POS (optional) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Claim / Debit File <span className="text-red-400">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brennan-light file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brennan-blue hover:file:bg-brennan-light/80"
                />
                {selectedFile && (
                  <p className="mt-1 text-xs text-gray-500">
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  POS Report <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  ref={inlinePosFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setInlinePosFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-600 hover:file:bg-indigo-100"
                />
                {inlinePosFile && (
                  <p className="mt-1 text-xs text-gray-500">
                    {inlinePosFile.name} ({(inlinePosFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
            </div>

            {/* Upload results */}
            {uploadResult && (
              <div className="space-y-2">
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
                      {/* POS upload status when submitted alongside claim */}
                      {inlinePosFile && posUploading && (
                        <p className="mt-2 text-xs text-indigo-600">Uploading POS report...</p>
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

                {/* Inline POS result */}
                {inlinePosResult && (
                  <div className={`rounded-lg border p-3 ${inlinePosResult.success ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                    {inlinePosResult.success ? (
                      <div>
                        <p className="text-sm font-medium text-green-800">POS report attached</p>
                        {inlinePosResult.parseResult && (
                          <p className="mt-1 text-xs text-green-700">
                            {inlinePosResult.parseResult.totalRows} rows parsed
                            ({inlinePosResult.parseResult.validRows} valid{inlinePosResult.parseResult.errorRows > 0 ? `, ${inlinePosResult.parseResult.errorRows} errors` : ""})
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-amber-800">POS upload issue: {inlinePosResult.error}</p>
                        <p className="mt-1 text-xs text-amber-600">You can attach the POS report later from the runs table.</p>
                      </div>
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
                onClick={() => handleUpload()}
                disabled={!selectedFile || !selectedDistributorId || !claimPeriod || uploading}
                className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (posUploading ? "Uploading POS..." : "Uploading...") : inlinePosFile ? "Upload Both Files" : "Upload & Parse"}
              </button>
            </div>
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
                          <a
                            href={`/reconciliation/run/${run.id}`}
                            className="rounded bg-brennan-blue px-3 py-1 text-xs font-medium text-white hover:bg-brennan-blue/90"
                          >
                            Validate
                          </a>
                        )}
                        {run.status === "review" && (
                          <a
                            href={`/reconciliation/run/${run.id}`}
                            className="rounded bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                          >
                            Review
                          </a>
                        )}
                        {run.status === "reviewed" && (
                          <a
                            href={`/reconciliation/run/${run.id}`}
                            className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                          >
                            Commit
                          </a>
                        )}
                        {run.status === "committed" && (
                          <div className="flex items-center gap-1">
                            <a
                              href={`/reconciliation/run/${run.id}`}
                              className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                            >
                              View
                            </a>
                            <a
                              href={`/api/export/reconciliation-run/${run.id}`}
                              download
                              className="rounded border border-brennan-border px-3 py-1 text-xs font-medium text-brennan-blue hover:bg-brennan-light transition-colors"
                            >
                              Export
                            </a>
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete Run #${run.id}? This removes the reconciliation record but does NOT undo any committed changes to master data.`)) return;
                                const res = await fetch(`/api/reconciliation/runs/${run.id}`, { method: "DELETE" });
                                if (res.ok) {
                                  setRuns((prev) => prev.filter((r) => r.id !== run.id));
                                  fetchQueue(queuePeriod);
                                } else {
                                  alert("Failed to delete run");
                                }
                              }}
                              className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                            >
                              Delete
                            </button>
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

      {/* Inline Column Mapping Modal — shown when upload detects no mapping */}
      {mappingDetection && (
        <ColumnMappingModal
          detection={mappingDetection}
          onSaved={handleMappingSaved}
          onCancel={() => setMappingDetection(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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


function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}
