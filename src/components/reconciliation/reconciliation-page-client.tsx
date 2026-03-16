"use client";

import { useState, useRef } from "react";
import { getConfiguredDistributors } from "@/lib/reconciliation/column-mappings";

interface Distributor {
  id: number;
  code: string;
  name: string;
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
  distributor: { code: string; name: string };
  runBy: { displayName: string };
  claimBatch: { fileName: string; totalRows: number; validRows: number; errorRows: number } | null;
  _count: { issues: number };
}

interface ParseResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warnings: string[];
  errors?: string[];
}

const configuredDistributors = getConfiguredDistributors();

export default function ReconciliationPageClient({
  distributors,
  initialRuns,
}: {
  distributors: Distributor[];
  initialRuns: ReconciliationRun[];
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

  const selectedDistributor = distributors.find(d => d.id === Number(selectedDistributorId));
  const hasMapping = selectedDistributor ? configuredDistributors.includes(selectedDistributor.code) : false;

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
        // Refresh runs list
        const runsRes = await fetch("/api/reconciliation/runs");
        if (runsRes.ok) {
          setRuns(await runsRes.json());
        }
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
                    No column mapping configured for {selectedDistributor.code}. Contact an administrator.
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

      {/* Reconciliation Runs Table */}
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
        <div className="border-b border-brennan-border px-5 py-3">
          <h2 className="text-base font-semibold text-brennan-text">Reconciliation Runs</h2>
        </div>

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
                  <th className="px-4 py-2">Valid / Errors</th>
                  <th className="px-4 py-2">Exceptions</th>
                  <th className="px-4 py-2">Started</th>
                  <th className="px-4 py-2">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((run) => (
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
                      {run.claimBatch ? (
                        <span>
                          <span className="text-green-700">{run.claimBatch.validRows}</span>
                          {run.claimBatch.errorRows > 0 && (
                            <span className="text-red-600"> / {run.claimBatch.errorRows}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {run._count.issues > 0 ? (
                        <span className="text-amber-600 font-medium">{run._count.issues}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{formatDate(run.startedAt)}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{run.runBy.displayName}</td>
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
  // Default to previous month
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriod(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    staged: "bg-blue-100 text-blue-700",
    running: "bg-yellow-100 text-yellow-700",
    review: "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || colors.draft}`}>
      {status}
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
