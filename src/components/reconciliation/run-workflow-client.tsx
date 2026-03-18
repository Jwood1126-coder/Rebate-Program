"use client";

import React, { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReviewPanel } from "./review-panel";
import ColumnMappingModal from "./column-mapping-modal";
import type {
  DbIssue,
  RunProgress,
  CommitSummaryData,
} from "@/lib/reconciliation/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunData {
  id: number;
  distributorId: number;
  status: string;
  totalClaimLines: number;
  validatedCount: number;
  exceptionCount: number;
  approvedCount: number;
  rejectedCount: number;
  claimPeriodStart: string;
  claimPeriodEnd: string;
  startedAt: string;
  completedAt: string | null;
  commitSummary: CommitSummaryData | null;
  distributor: { id: number; code: string; name: string };
  runBy: { displayName: string };
  claimBatch: {
    id: number;
    fileName: string;
    totalRows: number;
    validRows: number;
    errorRows: number;
  } | null;
  posBatch: {
    id: number;
    fileName: string;
    totalRows: number;
    validRows: number;
    errorRows: number;
  } | null;
  _count: { issues: number };
}

type Step = "upload" | "validate" | "review" | "commit" | "done";

interface Props {
  run: RunData;
  currentStep: Step;
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload Files" },
  { key: "validate", label: "Validate" },
  { key: "review", label: "Review Exceptions" },
  { key: "commit", label: "Commit" },
];

function stepIndex(step: Step): number {
  if (step === "done") return STEPS.length;
  return STEPS.findIndex((s) => s.key === step);
}

// ---------------------------------------------------------------------------
// Mapping detection interface
// ---------------------------------------------------------------------------
interface MappingDetection {
  distributorId: number;
  distributorCode: string;
  distributorName: string;
  headers: string[];
  suggestedMappings: Record<string, string>;
  sampleData: Record<string, string[]>;
  standardFields: Record<string, { label: string; required: boolean; group: string }>;
  totalRows: number;
  fileType?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RunWorkflowClient({ run: initialRun, currentStep: initialStep }: Props) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [activeStep, setActiveStep] = useState<Step>(initialStep);

  // Validate state
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Review state
  const [reviewIssues, setReviewIssues] = useState<DbIssue[]>([]);
  const [reviewProgress, setReviewProgress] = useState<RunProgress | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [resolvingIssue, setResolvingIssue] = useState<number | null>(null);
  const [expandedIssueId, setExpandedIssueId] = useState<number | null>(null);
  const [bulkResolving, setBulkResolving] = useState(false);

  // Commit state
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    success: boolean;
    summary?: CommitSummaryData;
    error?: string;
    failedIssueId?: number;
  } | null>(null);

  // POS upload state
  const [posFile, setPosFile] = useState<File | null>(null);
  const [posUploading, setPosUploading] = useState(false);
  const [posResult, setPosResult] = useState<{ success: boolean; error?: string } | null>(null);
  const posFileRef = useRef<HTMLInputElement>(null);

  // Column mapping detection
  const [mappingDetection, setMappingDetection] = useState<MappingDetection | null>(null);

  const current = stepIndex(activeStep);

  // ---------------------------------------------------------------------------
  // Refresh run data from server
  // ---------------------------------------------------------------------------
  const refreshRun = useCallback(async () => {
    const res = await fetch(`/api/reconciliation/runs/${run.id}`);
    if (res.ok) {
      const data = await res.json();
      setRun(data.run);
    }
  }, [run.id]);

  // ---------------------------------------------------------------------------
  // Step: Validate
  // ---------------------------------------------------------------------------
  async function handleValidate() {
    setValidating(true);
    setValidationError(null);
    try {
      const res = await fetch(`/api/reconciliation/runs/${run.id}/validate`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await refreshRun();
        setActiveStep("review");
        await loadReviewIssues();
      } else {
        setValidationError(data.error || "Validation failed");
      }
    } catch {
      setValidationError("Network error");
    } finally {
      setValidating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step: Review — load issues
  // ---------------------------------------------------------------------------
  const loadReviewIssues = useCallback(async () => {
    setLoadingReview(true);
    try {
      const res = await fetch(`/api/reconciliation/runs/${run.id}/issues`);
      if (res.ok) {
        const data = await res.json();
        setReviewIssues(data.issues);
        setReviewProgress(data.progress);
      }
    } finally {
      setLoadingReview(false);
    }
  }, [run.id]);

  // Auto-load issues when entering review step
  React.useEffect(() => {
    if (activeStep === "review" && reviewIssues.length === 0 && !loadingReview) {
      loadReviewIssues();
    }
  }, [activeStep, reviewIssues.length, loadingReview, loadReviewIssues]);

  // ---------------------------------------------------------------------------
  // Step: Review — resolve individual issue
  // ---------------------------------------------------------------------------
  async function handleResolve(issueId: number, resolution: string) {
    setResolvingIssue(issueId);
    try {
      const res = await fetch(`/api/reconciliation/runs/${run.id}/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      if (res.ok) {
        const data = await res.json();
        setReviewIssues((prev) =>
          prev.map((issue) =>
            issue.id === issueId
              ? { ...issue, resolution: data.issue.resolution, resolvedAt: data.issue.resolvedAt }
              : issue
          )
        );
        setReviewProgress(data.runProgress);
        if (data.runProgress?.allResolved) {
          await refreshRun();
        }
      }
    } finally {
      setResolvingIssue(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Step: Review — bulk resolve
  // ---------------------------------------------------------------------------
  async function handleBulkResolve(resolution: string, filter: "all" | "warnings" | "errors") {
    setBulkResolving(true);
    const pending = reviewIssues.filter((i) => !i.resolution);
    const filtered =
      filter === "all"
        ? pending
        : filter === "warnings"
          ? pending.filter((i) => i.severity === "warning")
          : pending.filter((i) => i.severity === "error");

    const issueIds = filtered.map((i) => i.id);
    if (issueIds.length === 0) {
      setBulkResolving(false);
      return;
    }

    try {
      const res = await fetch(`/api/reconciliation/runs/${run.id}/issues/bulk-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds, resolution }),
      });
      if (res.ok) {
        await loadReviewIssues();
        await refreshRun();
      }
    } finally {
      setBulkResolving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step: Commit
  // ---------------------------------------------------------------------------
  async function handleCommit() {
    setCommitting(true);
    setCommitResult(null);
    try {
      const res = await fetch(`/api/reconciliation/runs/${run.id}/commit`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setCommitResult(data);
        await refreshRun();
        setActiveStep("done");
      } else {
        setCommitResult({ success: false, error: data.error || "Commit failed" });
      }
    } catch {
      setCommitResult({ success: false, error: "Network error" });
    } finally {
      setCommitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // POS upload (optional, available during validate step)
  // ---------------------------------------------------------------------------
  async function handlePosUpload() {
    if (!posFile) return;
    setPosUploading(true);
    setPosResult(null);
    const fd = new FormData();
    fd.append("file", posFile);
    fd.append("runId", String(run.id));
    try {
      const res = await fetch("/api/reconciliation/pos-upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.needsMapping) {
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
        setPosResult({ success: true });
        await refreshRun();
      } else {
        setPosResult({ success: false, error: data.error || "POS upload failed" });
      }
    } catch {
      setPosResult({ success: false, error: "Network error" });
    } finally {
      setPosUploading(false);
    }
  }

  async function handleMappingSaved() {
    setMappingDetection(null);
    await handlePosUpload();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const period = run.claimPeriodStart
    ? new Date(run.claimPeriodStart + (run.claimPeriodStart.includes("T") ? "" : "T00:00:00Z"))
        .toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : "—";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Link href="/reconciliation" className="hover:text-brennan-blue hover:underline">
              Reconciliation
            </Link>
            <span>/</span>
            <span className="font-medium text-brennan-text">Run #{run.id}</span>
          </div>
          <h1 className="text-xl font-bold text-brennan-text">
            {run.distributor.code} — {period}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {run.claimBatch?.fileName || "No claim file"} — {run.totalClaimLines} rows
            {run.posBatch && <span className="ml-2 text-indigo-500">+ POS: {run.posBatch.fileName}</span>}
          </p>
        </div>
        <Link
          href="/reconciliation"
          className="rounded-lg border border-brennan-border bg-white px-3 py-1.5 text-xs font-medium text-brennan-text hover:bg-brennan-light"
        >
          Back to Checklist
        </Link>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => {
          const isActive = step.key === activeStep;
          const isComplete = i < current;
          const isDone = activeStep === "done";
          return (
            <React.Fragment key={step.key}>
              {i > 0 && (
                <div className={`flex-1 h-0.5 ${isComplete || isDone ? "bg-green-400" : "bg-gray-200"}`} />
              )}
              <button
                onClick={() => {
                  // Allow navigating back to completed steps or forward to current
                  if (isComplete || isActive) setActiveStep(step.key);
                }}
                disabled={!isComplete && !isActive}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isDone
                    ? "bg-green-50 text-green-700"
                    : isActive
                      ? "bg-brennan-blue text-white"
                      : isComplete
                        ? "bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer"
                        : "bg-gray-50 text-gray-400"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  isDone || isComplete
                    ? "bg-green-500 text-white"
                    : isActive
                      ? "bg-white text-brennan-blue"
                      : "bg-gray-200 text-gray-500"
                }`}>
                  {isDone || isComplete ? "✓" : i + 1}
                </span>
                {step.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
        {/* ---- VALIDATE ---- */}
        {activeStep === "validate" && (
          <div className="p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-brennan-text">Validate Claim Data</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Run validation against contract terms. This will match claim lines to existing records and flag exceptions.
              </p>
            </div>

            {/* Run summary */}
            <div className="grid grid-cols-4 gap-4">
              <SummaryCard label="Claim Lines" value={run.totalClaimLines} />
              <SummaryCard label="Valid Rows" value={run.claimBatch?.validRows ?? 0} color="green" />
              <SummaryCard label="Parse Errors" value={run.claimBatch?.errorRows ?? 0} color={run.claimBatch?.errorRows ? "amber" : undefined} />
              <SummaryCard label="Status" value={run.status} />
            </div>

            {/* Optional POS upload before validation */}
            {!run.posBatch && (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-4">
                <p className="text-xs font-medium text-indigo-700 mb-2">
                  Attach POS Report (optional — improves validation cross-checks)
                </p>
                <div className="flex items-center gap-3">
                  <input
                    ref={posFileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setPosFile(e.target.files?.[0] || null)}
                    className="block text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-600"
                  />
                  {posFile && (
                    <button
                      onClick={handlePosUpload}
                      disabled={posUploading}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {posUploading ? "Uploading..." : "Attach POS"}
                    </button>
                  )}
                </div>
                {posResult?.error && <p className="mt-2 text-xs text-red-600">{posResult.error}</p>}
                {posResult?.success && <p className="mt-2 text-xs text-green-600">POS report attached.</p>}
              </div>
            )}

            {validationError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {validationError}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleValidate}
                disabled={validating}
                className="rounded-lg bg-brennan-blue px-5 py-2 text-sm font-medium text-white hover:bg-brennan-dark disabled:opacity-50"
              >
                {validating ? "Validating..." : "Run Validation"}
              </button>
            </div>
          </div>
        )}

        {/* ---- REVIEW ---- */}
        {activeStep === "review" && (
          <div className="p-0">
            <ReviewPanel
              runId={run.id}
              run={{
                id: run.id,
                status: run.status,
                totalClaimLines: run.totalClaimLines,
                exceptionCount: run.exceptionCount,
                claimPeriodStart: run.claimPeriodStart,
                claimPeriodEnd: run.claimPeriodEnd,
                completedAt: run.completedAt,
                commitSummary: run.commitSummary,
                distributor: run.distributor,
              }}
              issues={reviewIssues}
              progress={reviewProgress}
              loading={loadingReview}
              expandedIssueId={expandedIssueId}
              resolvingIssue={resolvingIssue}
              bulkResolving={bulkResolving}
              committing={committing}
              commitResult={commitResult}
              onResolve={handleResolve}
              onBulkResolve={handleBulkResolve}
              onCommit={handleCommit}
              onExpandIssue={setExpandedIssueId}
              onClose={() => router.push("/reconciliation")}
            />
          </div>
        )}

        {/* ---- COMMIT ---- */}
        {activeStep === "commit" && (
          <div className="p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-brennan-text">Commit to Master Data</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                All exceptions have been resolved. Review the summary and commit approved claims.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <SummaryCard label="Total Lines" value={run.totalClaimLines} />
              <SummaryCard label="Exceptions" value={run.exceptionCount} />
              <SummaryCard label="Approved" value={run.approvedCount} color="green" />
              <SummaryCard label="Rejected" value={run.rejectedCount} color="amber" />
            </div>

            {commitResult?.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {commitResult.error}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleCommit}
                disabled={committing}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {committing ? "Committing..." : "Commit Approved Claims"}
              </button>
            </div>
          </div>
        )}

        {/* ---- DONE ---- */}
        {activeStep === "done" && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <h2 className="text-base font-semibold text-green-800">Run Committed Successfully</h2>
            </div>

            {run.commitSummary && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <SummaryCard label="Approved" value={run.commitSummary.totalApproved} color="green" />
                <SummaryCard label="Records Created" value={run.commitSummary.recordsCreated} color="green" />
                <SummaryCard label="Superseded" value={run.commitSummary.recordsSuperseded} color="amber" />
                <SummaryCard label="Rejected" value={run.commitSummary.rejected} />
              </div>
            )}

            <div className="flex items-center gap-3">
              <a
                href={`/api/export/claim-response/${run.id}`}
                download
                className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-dark"
              >
                Export Claim Response
              </a>
              <a
                href={`/api/export/reconciliation-run/${run.id}`}
                download
                className="rounded-lg border border-brennan-border px-4 py-2 text-sm font-medium text-brennan-blue hover:bg-brennan-light"
              >
                Export CSV
              </a>
              <Link
                href="/reconciliation"
                className="rounded-lg border border-brennan-border px-4 py-2 text-sm font-medium text-brennan-text hover:bg-brennan-light"
              >
                Back to Checklist
              </Link>
            </div>
          </div>
        )}

        {/* ---- UPLOAD (fallback for runs that somehow need files) ---- */}
        {activeStep === "upload" && (
          <div className="p-5">
            <div>
              <h2 className="text-base font-semibold text-brennan-text">Upload Files</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                This run needs claim file data. Please upload from the checklist page.
              </p>
            </div>
            <div className="mt-4">
              <Link
                href="/reconciliation"
                className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-dark"
              >
                Go to Checklist
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Column mapping modal */}
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
// Helper components
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const colorClass = color === "green" ? "text-green-700" : color === "amber" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}
