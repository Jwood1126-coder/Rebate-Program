"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ContractInfo {
  id: number;
  contractNumber: string;
  contractType: string;
  distributor: { code: string; name: string };
  endUser: { name: string };
  plans: { id: number; planCode: string; planName: string | null }[];
}

interface StageResult {
  success: boolean;
  runId: number | null;
  totalRows: number;
  unchangedCount: number;
  changedCount: number;
  addedCount: number;
  removedCount: number;
  errors: string[];
  warnings: string[];
  fileStorageWarning?: string;
}

interface HeadersResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: { itemNumberColumn: string | null; priceColumn: string | null };
  rowCount: number;
}

export function ContractUpdateUploadClient({ contract }: { contract: ContractInfo }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileMode, setFileMode] = useState<"snapshot" | "delta">("delta");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Column mapping
  const [fileHeaders, setFileHeaders] = useState<string[] | null>(null);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [itemNumberColumn, setItemNumberColumn] = useState("");
  const [priceColumn, setPriceColumn] = useState("");
  const [readingHeaders, setReadingHeaders] = useState(false);

  // Result
  const [staging, setStaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMapping = !!itemNumberColumn && !!priceColumn && itemNumberColumn !== priceColumn;
  const canStage = !!selectedFile && hasMapping;

  async function handleFileChange(file: File | null) {
    setSelectedFile(file);
    setFileHeaders(null);
    setSampleRows([]);
    setItemNumberColumn("");
    setPriceColumn("");
    setError(null);

    if (!file) return;

    // Read headers for column mapping
    setReadingHeaders(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/contracts/${contract.id}/update?headers=true`, {
        method: "POST",
        body: fd,
      });
      const data: HeadersResult | { error: string } = await res.json();
      if ("error" in data) {
        setError(data.error);
      } else {
        setFileHeaders(data.headers);
        setSampleRows(data.sampleRows);
        if (data.suggestedMapping.itemNumberColumn) setItemNumberColumn(data.suggestedMapping.itemNumberColumn);
        if (data.suggestedMapping.priceColumn) setPriceColumn(data.suggestedMapping.priceColumn);
      }
    } catch {
      setError("Failed to read file headers");
    } finally {
      setReadingHeaders(false);
    }
  }

  async function handleStage() {
    if (!selectedFile || !hasMapping) return;
    setStaging(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("fileMode", fileMode);
      if (effectiveDate) fd.append("effectiveDate", effectiveDate);
      if (planCode) fd.append("planCode", planCode);
      fd.append("itemNumberColumn", itemNumberColumn);
      fd.append("priceColumn", priceColumn);

      const res = await fetch(`/api/contracts/${contract.id}/update`, {
        method: "POST",
        body: fd,
      });
      const data: StageResult = await res.json();

      if (data.success && data.runId) {
        // Surface file storage warning via URL param if present
        const warningParam = data.fileStorageWarning ? `&fileWarning=${encodeURIComponent(data.fileStorageWarning)}` : '';
        router.push(`/contracts/${contract.id}/update/${data.runId}?staged=true${warningParam}`);
      } else {
        setError(data.errors?.join("; ") || "Failed to stage update");
      }
    } catch {
      setError("Network error during staging");
    } finally {
      setStaging(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Link href="/contracts" className="hover:text-brennan-blue hover:underline">Contracts</Link>
        <span>/</span>
        <Link href={`/contracts/${contract.id}`} className="hover:text-brennan-blue hover:underline">{contract.contractNumber}</Link>
        <span>/</span>
        <span className="font-medium text-brennan-text">Update</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-brennan-text">Update Contract — {contract.contractNumber}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a new parts/pricing file and the system will show you what changed.
          {" "}{contract.distributor.code} — {contract.endUser.name}
        </p>
      </div>

      {/* Settings */}
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">What does this file contain? <span className="text-red-500">*</span></label>
            <select
              value={fileMode}
              onChange={(e) => setFileMode(e.target.value as "snapshot" | "delta")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
            >
              <option value="delta">Only changes — items not in this file stay as-is</option>
              <option value="snapshot">Complete list — items missing from this file may be removed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Apply changes as of</label>
            <input
              type="date"
              value={effectiveDate}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
            />
            <p className="mt-1 text-xs text-gray-400">Leave blank for today.</p>
          </div>
        </div>

        {/* Plan selector — only shown for multi-plan contracts */}
        {contract.plans.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Which plan does this file apply to?</label>
            <select
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
            >
              <option value="">Auto-detect (match by item)</option>
              {contract.plans.map((p) => (
                <option key={p.id} value={p.planCode}>
                  {p.planCode}{p.planName ? ` — ${p.planName}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* File upload */}
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm p-5 space-y-4">
        <h2 className="text-base font-semibold text-brennan-text">Upload File</h2>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brennan-blue file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brennan-dark"
            />
          </div>
        </div>

        {readingHeaders && (
          <p className="text-sm text-gray-500 animate-pulse">Reading file headers...</p>
        )}

        {/* Column mapping */}
        {fileHeaders && (
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700">Which columns have the part number and price?</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Part Number <span className="text-red-500">*</span></label>
                <select
                  value={itemNumberColumn}
                  onChange={(e) => setItemNumberColumn(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
                >
                  <option value="">Select column...</option>
                  {fileHeaders.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Price <span className="text-red-500">*</span></label>
                <select
                  value={priceColumn}
                  onChange={(e) => setPriceColumn(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
                >
                  <option value="">Select column...</option>
                  {fileHeaders.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sample data preview */}
            {sampleRows.length > 0 && itemNumberColumn && priceColumn && (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500 uppercase">
                      <th className="px-3 py-1.5">{itemNumberColumn}</th>
                      <th className="px-3 py-1.5">{priceColumn}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sampleRows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono">{row[itemNumberColumn] || "—"}</td>
                        <td className="px-3 py-1.5 font-mono">{row[priceColumn] || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Link
          href={`/contracts/${contract.id}`}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
        <button
          onClick={handleStage}
          disabled={!canStage || staging}
          className="rounded-lg bg-brennan-blue px-6 py-2 text-sm font-medium text-white hover:bg-brennan-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {staging ? "Comparing..." : "Compare & Review"}
        </button>
      </div>
    </div>
  );
}
