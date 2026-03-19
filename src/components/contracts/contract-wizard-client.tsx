"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DistributorOption {
  id: number;
  code: string;
  name: string;
}

interface EndUserOption {
  id: number;
  code: string;
  name: string;
}

interface ItemOption {
  id: number;
  itemNumber: string;
  description: string | null;
  productCode: string | null;
}

interface LineItem {
  itemId: number;
  itemNumber: string;
  description: string;
  rebatePrice: string;
  startDate: string;
  endDate: string;
}

// Import preview types
interface PreviewGroup {
  distributorCode: string;
  distributorName: string;
  endUserCode: string;
  endUserName: string;
  contractNumber: string;
  planCode: string;
  discountType: string;
  description: string;
  startDate: string;
  endDate: string;
  lineItems: {
    itemNumber: string;
    deviatedPrice: number;
    startDate: string;
    endDate: string;
  }[];
}

interface ImportResult {
  success: boolean;
  contractsCreated: number;
  plansCreated: number;
  recordsCreated: number;
  errors: string[];
  warnings: string[];
  preview?: PreviewGroup[];
}

type Mode = "upload" | "manual";
type Step = 1 | 2 | 3 | 4;

const STEPS: { num: Step; label: string }[] = [
  { num: 1, label: "Distributor & End User" },
  { num: 2, label: "Contract Details" },
  { num: 3, label: "Line Items" },
  { num: 4, label: "Review & Submit" },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContractWizardClient({
  distributors,
  endUsers,
  items,
}: {
  distributors: DistributorOption[];
  endUsers: EndUserOption[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("upload");

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-brennan-text">New Contract Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create contracts with rebate plans and pricing terms. These are validated against when distributors submit claims.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        <button
          onClick={() => setMode("upload")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === "upload"
              ? "border-brennan-blue text-brennan-blue"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Upload File
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === "manual"
              ? "border-brennan-blue text-brennan-blue"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Manual Entry
        </button>
      </div>

      {mode === "upload" ? (
        <UploadMode
          distributors={distributors}
          endUsers={endUsers}
        />
      ) : (
        <ManualMode
          distributors={distributors}
          endUsers={endUsers}
          items={items}
          router={router}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UPLOAD MODE
// ---------------------------------------------------------------------------

function UploadMode({
  distributors,
  endUsers: initialEndUsers,
}: {
  distributors: DistributorOption[];
  endUsers: EndUserOption[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Context fields (set once, apply to all items)
  const [distributorId, setDistributorId] = useState<string>("");
  const [endUserId, setEndUserId] = useState<string>("");
  const [newEndUserCode, setNewEndUserCode] = useState("");
  const [newEndUserName, setNewEndUserName] = useState("");
  const [creatingEndUser, setCreatingEndUser] = useState(false);
  const [localEndUsers, setLocalEndUsers] = useState(initialEndUsers);
  const [contractType, setContractType] = useState<"fixed_term" | "evergreen">("fixed_term");
  const [noticePeriodDays, setNoticePeriodDays] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [description, setDescription] = useState("");

  // File + result state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [commitResult, setCommitResult] = useState<ImportResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Column mapping state
  const [fileHeaders, setFileHeaders] = useState<string[] | null>(null);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [fileRowCount, setFileRowCount] = useState(0);
  const [itemNumberColumn, setItemNumberColumn] = useState("");
  const [priceColumn, setPriceColumn] = useState("");
  const [readingHeaders, setReadingHeaders] = useState(false);

  const selectedDistributor = distributors.find(d => d.id === Number(distributorId));
  const selectedEndUser = localEndUsers.find(u => u.id === Number(endUserId));

  const hasColumnMapping = !!itemNumberColumn && !!priceColumn && itemNumberColumn !== priceColumn;
  const endDateRequired = contractType === "fixed_term";
  const canPreview = !!selectedFile && !!distributorId && !!endUserId && !!startDate && hasColumnMapping
    && (!endDateRequired || !!endDate);

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("file", selectedFile!);
    fd.append("distributorId", distributorId);
    fd.append("endUserId", endUserId);
    if (customerNumber.trim()) fd.append("customerNumber", customerNumber.trim());
    fd.append("contractType", contractType);
    if (contractType === "evergreen" && noticePeriodDays) {
      fd.append("noticePeriodDays", noticePeriodDays);
    }
    fd.append("startDate", startDate);
    if (endDate) fd.append("endDate", endDate);
    // Plan is auto-created behind the scenes — users don't manage plans
    fd.append("planCode", "DEFAULT");
    fd.append("discountType", "part");
    if (description.trim()) fd.append("description", description.trim());
    // Column mapping (user-confirmed)
    if (itemNumberColumn) fd.append("itemNumberColumn", itemNumberColumn);
    if (priceColumn) fd.append("priceColumn", priceColumn);
    return fd;
  }

  async function handleReadHeaders() {
    if (!selectedFile) return;
    setReadingHeaders(true);
    setError(null);
    setFileHeaders(null);
    setPreview(null);

    const fd = new FormData();
    fd.append("file", selectedFile);

    try {
      const res = await fetch("/api/contracts/import?headers=true", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to read file headers");
      } else {
        setFileHeaders(data.headers);
        setSampleRows(data.sampleRows || []);
        setFileRowCount(data.rowCount || 0);
        // Apply suggestions
        setItemNumberColumn(data.suggestedMapping?.itemNumberColumn || "");
        setPriceColumn(data.suggestedMapping?.priceColumn || "");
      }
    } catch {
      setError("Network error reading file.");
    } finally {
      setReadingHeaders(false);
    }
  }

  async function handleCreateEndUser() {
    if (!newEndUserCode.trim() || !newEndUserName.trim()) return;
    setCreatingEndUser(true);
    setError(null);
    try {
      const res = await fetch("/api/end-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newEndUserCode.trim(), name: newEndUserName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setLocalEndUsers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setEndUserId(String(data.id));
        setNewEndUserCode("");
        setNewEndUserName("");
      } else {
        setError(data.error || "Failed to create end user");
      }
    } catch {
      setError("Network error creating end user");
    } finally {
      setCreatingEndUser(false);
    }
  }

  async function handlePreview() {
    if (!canPreview) return;
    setUploading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/contracts/import?preview=true", {
        method: "POST",
        body: buildFormData(),
      });
      const data: ImportResult = await res.json();
      if (!res.ok) {
        setError(data.errors?.join("; ") || "Preview failed");
      } else if (data.errors.length > 0 && !data.preview?.length) {
        setError(data.errors.join("; "));
      } else {
        setPreview(data);
        setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleCommit() {
    if (!canPreview) return;
    setCommitting(true);
    setError(null);

    try {
      const res = await fetch("/api/contracts/import", {
        method: "POST",
        body: buildFormData(),
      });
      const data: ImportResult = await res.json();
      setCommitResult(data);
      if (!data.success && data.errors.length > 0) {
        setError(data.errors.join("; "));
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCommitting(false);
    }
  }

  function resetAll() {
    setCommitResult(null);
    setPreview(null);
    setSelectedFile(null);
    setDistributorId("");
    setEndUserId("");
    setStartDate("");
    setEndDate("");
    setCustomerNumber("");
    setDescription("");
    setError(null);
    setFileHeaders(null);
    setSampleRows([]);
    setFileRowCount(0);
    setItemNumberColumn("");
    setPriceColumn("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Success state
  if (commitResult?.success) {
    return (
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm p-8 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-brennan-text">Contract Created Successfully</h2>
        <div className="text-sm text-gray-600 space-y-1">
          <p>
            <span className="font-medium text-brennan-blue">{selectedDistributor?.code}</span>
            {" → "}
            <span className="font-medium">{selectedEndUser?.name}</span>
          </p>
          <p><span className="font-medium">{commitResult.recordsCreated}</span> line item{commitResult.recordsCreated !== 1 ? "s" : ""} created</p>
          <p className="text-xs text-gray-400">Dates: {startDate} — {endDate || "Open"}{customerNumber ? ` · Customer #${customerNumber}` : ""}</p>
        </div>
        {commitResult.warnings.length > 0 && (
          <div className="text-left max-w-md mx-auto">
            <p className="text-xs font-medium text-amber-600 mb-1">Notes:</p>
            <ul className="text-xs text-amber-600 list-disc pl-4 space-y-0.5">
              {commitResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        <div className="flex items-center justify-center gap-3 pt-4">
          <button onClick={() => router.push("/records")}
            className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90">
            View Records
          </button>
          <button onClick={() => router.push("/reconciliation")}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Go to Reconciliation
          </button>
          <button onClick={resetAll}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Create Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Context: set once, applies to all items */}
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
        <div className="border-b border-brennan-border px-5 py-3">
          <h2 className="text-base font-semibold text-brennan-text">Contract Details</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            These values apply to every line item in the uploaded file.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Row 1: Distributor + End User */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Distributor <span className="text-red-500">*</span></label>
              <select value={distributorId} onChange={e => { setDistributorId(e.target.value); setPreview(null); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue">
                <option value="">Select distributor...</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End User <span className="text-red-500">*</span></label>
              <select value={endUserId} onChange={e => { setEndUserId(e.target.value); setPreview(null); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue">
                <option value="">Select end user...</option>
                {localEndUsers.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </select>
              <div className="mt-2 flex items-end gap-2">
                <div className="flex-1">
                  <input value={newEndUserCode} onChange={e => setNewEndUserCode(e.target.value.toUpperCase())} placeholder="New code"
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                </div>
                <div className="flex-[2]">
                  <input value={newEndUserName} onChange={e => setNewEndUserName(e.target.value)} placeholder="New end user name"
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                </div>
                <button onClick={handleCreateEndUser} disabled={!newEndUserCode.trim() || !newEndUserName.trim() || creatingEndUser}
                  className="rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                  {creatingEndUser ? "..." : "Create"}
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Contract Type */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contract Type <span className="text-red-500">*</span></label>
              <select value={contractType} onChange={e => { setContractType(e.target.value as "fixed_term" | "evergreen"); setPreview(null); if (e.target.value === "evergreen") setEndDate(""); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue">
                <option value="fixed_term">Fixed Term</option>
                <option value="evergreen">Evergreen</option>
              </select>
            </div>
            {contractType === "evergreen" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notice Period (days)</label>
                <input type="number" min="0" value={noticePeriodDays} onChange={e => setNoticePeriodDays(e.target.value)} placeholder="e.g. 30"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                <p className="mt-1 text-xs text-gray-400">Termination notice requirement</p>
              </div>
            )}
          </div>

          {/* Row 3: Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contract Start Date <span className="text-red-500">*</span></label>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPreview(null); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Contract End Date {endDateRequired && <span className="text-red-500">*</span>}
              </label>
              <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPreview(null); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
              {contractType === "evergreen" ? (
                <p className="mt-1 text-xs text-teal-600">Evergreen — end date optional</p>
              ) : (
                <p className="mt-1 text-xs text-gray-400">Required for fixed-term contracts</p>
              )}
            </div>
          </div>

          {/* Row 3: Customer # + Description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Customer #</label>
              <input value={customerNumber} onChange={e => setCustomerNumber(e.target.value)} placeholder="e.g. 12345"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
              <p className="mt-1 text-xs text-gray-400">Distributor location/branch account number</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. OSW products for Link-Belt"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
            </div>
          </div>
        </div>
      </div>

      {/* File upload + column mapping */}
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-brennan-text">Upload Line Items</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload a file with part numbers and prices. You&apos;ll map the columns after uploading.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={async (e) => {
                const file = e.target.files?.[0] || null;
                setSelectedFile(file);
                setPreview(null);
                setError(null);
                setFileHeaders(null);
                setItemNumberColumn("");
                setPriceColumn("");
                // Auto-read headers on file select
                if (file) {
                  setReadingHeaders(true);
                  const fd = new FormData();
                  fd.append("file", file);
                  try {
                    const res = await fetch("/api/contracts/import?headers=true", {
                      method: "POST",
                      body: fd,
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setError(data.error || "Failed to read file headers");
                    } else {
                      setFileHeaders(data.headers);
                      setSampleRows(data.sampleRows || []);
                      setFileRowCount(data.rowCount || 0);
                      setItemNumberColumn(data.suggestedMapping?.itemNumberColumn || "");
                      setPriceColumn(data.suggestedMapping?.priceColumn || "");
                    }
                  } catch {
                    setError("Network error reading file.");
                  } finally {
                    setReadingHeaders(false);
                  }
                }
              }}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brennan-light file:px-4 file:py-2 file:text-sm file:font-medium file:text-brennan-blue hover:file:bg-brennan-light/80"
            />
            {selectedFile && !fileHeaders && readingHeaders && (
              <p className="mt-1 text-xs text-gray-400">Reading {selectedFile.name}...</p>
            )}
          </div>
          {selectedFile && (
            <button
              onClick={() => {
                setSelectedFile(null);
                setFileHeaders(null);
                setItemNumberColumn("");
                setPriceColumn("");
                setPreview(null);
                setSampleRows([]);
                setFileRowCount(0);
                setError(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>

        {/* Column mapping step */}
        {fileHeaders && fileHeaders.length > 0 && (
          <div className="rounded-lg border border-brennan-blue/20 bg-brennan-light/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-brennan-text">Map Columns</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedFile?.name} — {fileRowCount} row{fileRowCount !== 1 ? "s" : ""} found, {fileHeaders.length} column{fileHeaders.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => { setFileHeaders(null); setItemNumberColumn(""); setPriceColumn(""); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Change file
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Item / Part Number Column <span className="text-red-500">*</span>
                </label>
                <select
                  value={itemNumberColumn}
                  onChange={(e) => setItemNumberColumn(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
                >
                  <option value="">Select column...</option>
                  {fileHeaders.map((h) => (
                    <option key={h} value={h} disabled={h === priceColumn}>{h}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Price Column <span className="text-red-500">*</span>
                </label>
                <select
                  value={priceColumn}
                  onChange={(e) => setPriceColumn(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
                >
                  <option value="">Select column...</option>
                  {fileHeaders.map((h) => (
                    <option key={h} value={h} disabled={h === itemNumberColumn}>{h}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sample data preview */}
            {sampleRows.length > 0 && itemNumberColumn && priceColumn && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Preview (first {sampleRows.length} rows):</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-500 uppercase tracking-wider">
                        <th className="px-3 py-1.5">Item Number</th>
                        <th className="px-3 py-1.5 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sampleRows.map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-mono">{row[itemNumberColumn] || <span className="text-red-400">empty</span>}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{row[priceColumn] || <span className="text-red-400">empty</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {itemNumberColumn === priceColumn && itemNumberColumn !== "" && (
              <p className="text-xs text-red-600">Item number and price must be different columns.</p>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline text-red-600 text-xs">dismiss</button>
          </div>
        )}

        {hasColumnMapping && (
          <div className="flex justify-end">
            <button
              onClick={handlePreview}
              disabled={!canPreview || uploading}
              className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Parsing..." : "Parse & Preview"}
            </button>
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && preview.preview && preview.preview.length > 0 && (
        <div ref={previewRef} className="rounded-xl border border-brennan-border bg-white shadow-sm">
          <div className="border-b border-brennan-border px-5 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-brennan-text">Preview</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                1 contract, 1 plan, {preview.recordsCreated} line item{preview.recordsCreated !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={handleCommit}
              disabled={committing}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {committing ? "Creating..." : "Create Contract"}
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {preview.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Errors ({preview.errors.length}):</p>
                <ul className="text-xs text-red-600 list-disc pl-4 space-y-0.5 max-h-32 overflow-auto">
                  {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-700 mb-1">Notes:</p>
                <ul className="text-xs text-amber-600 list-disc pl-4 space-y-0.5">
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Contract summary */}
            {preview.preview.map((group, idx) => (
              <div key={idx}>
                <div className="flex items-center gap-3 mb-2 text-sm">
                  <span className="font-medium text-brennan-blue">{group.distributorCode}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-medium">{group.endUserName}</span>
                  <span className="text-gray-400 text-xs">
                    Contract #{group.contractNumber} · {group.startDate} — {group.endDate || "Open"}
                  </span>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-1.5">#</th>
                        <th className="px-4 py-1.5">Part Number</th>
                        <th className="px-4 py-1.5 text-right">List Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.lineItems.map((item, li) => (
                        <tr key={li} className="hover:bg-gray-50/50">
                          <td className="px-4 py-1.5 text-gray-400">{li + 1}</td>
                          <td className="px-4 py-1.5 font-mono font-medium">{item.itemNumber}</td>
                          <td className="px-4 py-1.5 text-right font-mono">${item.deviatedPrice.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MANUAL MODE
// ---------------------------------------------------------------------------

function ManualMode({
  distributors,
  endUsers: initialEndUsers,
  items,
  router,
}: {
  distributors: DistributorOption[];
  endUsers: EndUserOption[];
  items: ItemOption[];
  router: ReturnType<typeof useRouter>;
}) {
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdContractId, setCreatedContractId] = useState<number | null>(null);

  // Step 1
  const [distributorId, setDistributorId] = useState<string>("");
  const [endUserId, setEndUserId] = useState<string>("");
  const [newEndUserCode, setNewEndUserCode] = useState("");
  const [newEndUserName, setNewEndUserName] = useState("");
  const [creatingEndUser, setCreatingEndUser] = useState(false);
  const [localEndUsers, setLocalEndUsers] = useState<EndUserOption[]>(initialEndUsers);

  // Step 2
  const [contractNumber, setContractNumber] = useState("(auto-generated)");
  const [contractDescription, setContractDescription] = useState("");
  const [manualContractType, setManualContractType] = useState<"fixed_term" | "evergreen">("fixed_term");
  const [manualNoticePeriodDays, setManualNoticePeriodDays] = useState("");
  const [manualCustomerNumber, setManualCustomerNumber] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");

  // Step 4
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [linePrice, setLinePrice] = useState("");
  const [lineStartDate, setLineStartDate] = useState("");
  const [lineEndDate, setLineEndDate] = useState("");

  const selectedDistributor = distributors.find(d => d.id === Number(distributorId));
  const selectedEndUser = localEndUsers.find(u => u.id === Number(endUserId));
  const selectedItem = items.find(i => i.id === Number(selectedItemId));

  const filteredItems = itemSearch.trim()
    ? items.filter(i =>
        i.itemNumber.toLowerCase().includes(itemSearch.toLowerCase()) ||
        (i.description || "").toLowerCase().includes(itemSearch.toLowerCase()) ||
        (i.productCode || "").toLowerCase().includes(itemSearch.toLowerCase())
      ).slice(0, 20)
    : [];

  async function handleCreateEndUser() {
    if (!newEndUserCode.trim() || !newEndUserName.trim()) return;
    setCreatingEndUser(true);
    setError(null);
    try {
      const res = await fetch("/api/end-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newEndUserCode.trim(), name: newEndUserName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setLocalEndUsers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setEndUserId(String(data.id));
        setNewEndUserCode("");
        setNewEndUserName("");
      } else {
        setError(data.error || "Failed to create end user");
      }
    } catch {
      setError("Network error creating end user");
    } finally {
      setCreatingEndUser(false);
    }
  }

  function addLineItem() {
    if (!selectedItemId || !linePrice || !lineStartDate) return;
    const item = items.find(i => i.id === Number(selectedItemId));
    if (!item) return;
    if (lineItems.some(li => li.itemId === item.id)) {
      setError(`Item ${item.itemNumber} is already in the list`);
      return;
    }
    setLineItems(prev => [...prev, {
      itemId: item.id,
      itemNumber: item.itemNumber,
      description: item.description || "",
      rebatePrice: linePrice,
      startDate: lineStartDate,
      endDate: lineEndDate,
    }]);
    setSelectedItemId("");
    setLinePrice("");
    setItemSearch("");
    setError(null);
  }

  function removeLineItem(index: number) {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  }

  function applyDatesToAll() {
    if (!contractStartDate) return;
    setLineItems(prev => prev.map(li => ({
      ...li,
      startDate: li.startDate || contractStartDate,
      endDate: li.endDate || contractEndDate,
    })));
    setLineStartDate(contractStartDate);
    setLineEndDate(contractEndDate);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      // Create contract (no contractNumber — server will auto-generate)
      const contractRes = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distributorId: Number(distributorId),
          endUserId: Number(endUserId),
          contractNumber: "auto",
          customerNumber: manualCustomerNumber.trim() || null,
          description: contractDescription.trim() || null,
          contractType: manualContractType,
          noticePeriodDays: manualContractType === "evergreen" && manualNoticePeriodDays
            ? Number(manualNoticePeriodDays) : null,
          startDate: contractStartDate || null,
          endDate: contractEndDate || null,
        }),
      });
      const contractData = await contractRes.json();
      if (!contractRes.ok) {
        setError(contractData.error || "Failed to create contract");
        setSaving(false);
        return;
      }
      setCreatedContractId(contractData.id);
      setContractNumber(contractData.contractNumber);

      // Create plan
      const planRes = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: contractData.id, planCode: "DEFAULT", planName: null, discountType: "part" }),
      });
      const planData = await planRes.json();
      if (!planRes.ok) {
        setError(planData.error || "Failed to create plan");
        setSaving(false);
        return;
      }

      // Create records
      let failedItems = 0;
      for (const line of lineItems) {
        const recordRes = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rebatePlanId: planData.id,
            itemId: line.itemId,
            rebatePrice: line.rebatePrice,
            startDate: line.startDate,
            endDate: line.endDate || null,
            confirmWarnings: true,
          }),
        });
        if (!recordRes.ok) failedItems++;
      }

      if (failedItems > 0) {
        setError(`Contract created but ${failedItems} line items failed.`);
      }
      setStep(4);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function canProceed(): boolean {
    switch (step) {
      case 1: return !!distributorId && !!endUserId;
      case 2: return manualContractType === "evergreen" || !!contractEndDate;
      case 3: return lineItems.length > 0;
      default: return true;
    }
  }

  return (
    <div className="space-y-4">
      {/* Step Indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, idx) => (
          <div key={s.num} className="flex items-center">
            <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              step === s.num ? "bg-brennan-blue text-white"
                : step > s.num || (createdContractId && s.num <= 4) ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}>
              <span className="font-bold">{s.num}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-6 h-0.5 mx-1 ${step > s.num ? "bg-green-300" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-red-600">dismiss</button>
        </div>
      )}

      <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
        {/* STEP 1 */}
        {step === 1 && (
          <div className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-brennan-text">Select Distributor & End User</h2>
              <p className="text-sm text-gray-500 mt-1">Who is the contract between?</p>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Distributor</label>
                <select value={distributorId} onChange={e => setDistributorId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue">
                  <option value="">Select distributor...</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End User</label>
                <select value={endUserId} onChange={e => setEndUserId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue">
                  <option value="">Select end user...</option>
                  {localEndUsers.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                </select>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Or create a new end user:</p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Code</label>
                  <input value={newEndUserCode} onChange={e => setNewEndUserCode(e.target.value.toUpperCase())} placeholder="e.g. DEERE"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                </div>
                <div className="flex-[2]">
                  <label className="block text-xs text-gray-500 mb-1">Name</label>
                  <input value={newEndUserName} onChange={e => setNewEndUserName(e.target.value)} placeholder="e.g. John Deere"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                </div>
                <button onClick={handleCreateEndUser} disabled={!newEndUserCode.trim() || !newEndUserName.trim() || creatingEndUser}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                  {creatingEndUser ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-brennan-text">Contract Details</h2>
              <p className="text-sm text-gray-500 mt-1">
                Contract for <span className="font-medium text-brennan-blue">{selectedDistributor?.code}</span>
                {" → "}
                <span className="font-medium">{selectedEndUser?.name}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contract Number</label>
                <input value={contractNumber} readOnly
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-500 cursor-not-allowed" />
                <p className="mt-1 text-xs text-gray-400">Auto-generated on submit</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input value={contractDescription} onChange={e => setContractDescription(e.target.value)} placeholder="e.g. OSW products for Link-Belt"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Customer #</label>
                <input value={manualCustomerNumber} onChange={e => setManualCustomerNumber(e.target.value)} placeholder="e.g. 12345"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                <p className="mt-1 text-xs text-gray-400">Distributor location/branch account number</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contract Type <span className="text-red-500">*</span></label>
                <select value={manualContractType} onChange={e => { setManualContractType(e.target.value as "fixed_term" | "evergreen"); if (e.target.value === "evergreen") setContractEndDate(""); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue">
                  <option value="fixed_term">Fixed Term</option>
                  <option value="evergreen">Evergreen</option>
                </select>
              </div>
              {manualContractType === "evergreen" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notice Period (days)</label>
                  <input type="number" min="0" value={manualNoticePeriodDays} onChange={e => setManualNoticePeriodDays(e.target.value)} placeholder="e.g. 30"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                  <p className="mt-1 text-xs text-gray-400">Termination notice requirement</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                <input type="date" value={contractStartDate} onChange={e => setContractStartDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  End Date {manualContractType === "fixed_term" && <span className="text-red-500">*</span>}
                </label>
                <input type="date" value={contractEndDate} onChange={e => setContractEndDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                {manualContractType === "evergreen" ? (
                  <p className="mt-1 text-xs text-teal-600">Evergreen — end date optional</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Required for fixed-term contracts</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Line Items */}
        {step === 3 && (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-brennan-text">Line Items</h2>
                <p className="text-sm text-gray-500 mt-1">{lineItems.length} item{lineItems.length !== 1 ? "s" : ""} added</p>
              </div>
              {contractStartDate && (
                <button onClick={applyDatesToAll} className="text-xs text-brennan-blue hover:underline">
                  Apply contract dates to all
                </button>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-3">
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-5 relative">
                  <label className="block text-xs text-gray-500 mb-1">Item Number</label>
                  <input
                    value={selectedItemId ? (selectedItem?.itemNumber || "") : itemSearch}
                    onChange={e => { setItemSearch(e.target.value); setSelectedItemId(""); }}
                    placeholder="Search by part number..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
                  />
                  {itemSearch && !selectedItemId && filteredItems.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {filteredItems.map(item => (
                        <button key={item.id} onClick={() => { setSelectedItemId(String(item.id)); setItemSearch(""); }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-brennan-light flex items-center gap-2">
                          <span className="font-mono font-medium">{item.itemNumber}</span>
                          {item.description && <span className="text-gray-400 text-xs truncate">{item.description}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Open Net Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" step="0.01" min="0" value={linePrice} onChange={e => setLinePrice(e.target.value)} placeholder="0.00"
                      className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm font-mono focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input type="date" value={lineStartDate} onChange={e => setLineStartDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input type="date" value={lineEndDate} onChange={e => setLineEndDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue" />
                </div>
                <div className="col-span-1 flex items-end">
                  <button onClick={addLineItem} disabled={!selectedItemId || !linePrice || !lineStartDate}
                    className="w-full rounded-lg bg-brennan-blue px-2 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90 disabled:opacity-50 disabled:cursor-not-allowed">
                    Add
                  </button>
                </div>
              </div>
            </div>

            {lineItems.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Item Number</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Open Net Price</th>
                      <th className="px-3 py-2">Start</th>
                      <th className="px-3 py-2">End</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lineItems.map((line, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono font-medium">{line.itemNumber}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs truncate max-w-xs">{line.description || "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">${Number(line.rebatePrice).toFixed(2)}</td>
                        <td className="px-3 py-2 text-xs">{line.startDate}</td>
                        <td className="px-3 py-2 text-xs">{line.endDate || "Open"}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => removeLineItem(idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Review & Submit */}
        {step === 4 && (
          <div className="p-6 space-y-5">
            {createdContractId ? (
              <div className="text-center py-6 space-y-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100">
                  <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-brennan-text">Contract Created Successfully</h2>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><span className="font-medium">Contract:</span> {contractNumber} ({selectedDistributor?.code} → {selectedEndUser?.name})</p>
                  <p><span className="font-medium">Line Items:</span> {lineItems.length} records created</p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-4">
                  <button onClick={() => router.push("/records")} className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90">View Records</button>
                  <button onClick={() => router.push("/reconciliation")} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Go to Reconciliation</button>
                  <button onClick={() => window.location.reload()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Create Another</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-brennan-text">Review & Submit</h2>
                  <p className="text-sm text-gray-500 mt-1">Confirm everything looks correct.</p>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-1">Contract</h3>
                    <dl className="text-sm space-y-1">
                      <div className="flex justify-between"><dt className="text-gray-500">Distributor</dt><dd className="font-medium">{selectedDistributor?.code} — {selectedDistributor?.name}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">End User</dt><dd className="font-medium">{selectedEndUser?.code} — {selectedEndUser?.name}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">Contract #</dt><dd className="font-mono text-gray-400 italic">auto-generated</dd></div>
                      {contractDescription && <div className="flex justify-between"><dt className="text-gray-500">Description</dt><dd>{contractDescription}</dd></div>}
                      <div className="flex justify-between"><dt className="text-gray-500">Dates</dt><dd>{contractStartDate || "No start"} — {contractEndDate || "Open"}</dd></div>
                    </dl>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-1">Rebate Plan</h3>
                    <dl className="text-sm space-y-1">
                      {manualCustomerNumber && <div className="flex justify-between"><dt className="text-gray-500">Customer #</dt><dd className="font-mono">{manualCustomerNumber}</dd></div>}
                    </dl>
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-1">Line Items ({lineItems.length})</h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-500 uppercase tracking-wider">
                          <th className="px-3 py-2">Item</th>
                          <th className="px-3 py-2 text-right">Open Net Price</th>
                          <th className="px-3 py-2">Start</th>
                          <th className="px-3 py-2">End</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {lineItems.map((line, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-mono font-medium">{line.itemNumber}</td>
                            <td className="px-3 py-2 text-right font-mono">${Number(line.rebatePrice).toFixed(2)}</td>
                            <td className="px-3 py-2">{line.startDate}</td>
                            <td className="px-3 py-2">{line.endDate || "Open"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        {!createdContractId && (
          <div className="flex items-center justify-between border-t border-brennan-border px-6 py-4">
            <button onClick={() => step > 1 && setStep((step - 1) as Step)} disabled={step === 1}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
              Back
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => router.push("/records")} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              {step < 4 ? (
                <button onClick={() => setStep((step + 1) as Step)} disabled={!canProceed()}
                  className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90 disabled:opacity-50 disabled:cursor-not-allowed">
                  Next
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={saving}
                  className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                  {saving ? "Creating..." : "Create Contract"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
