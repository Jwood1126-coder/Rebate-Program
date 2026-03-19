"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ContractData {
  id: number;
  contractNumber: string;
  customerNumber: string | null;
  description: string | null;
  contractType: string;
  startDate: string;
  endDate: string;
  noticePeriodDays: number | null;
  lastReviewedAt: string | null;
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

interface ReconHistory {
  runId: number;
  status: string;
  claimPeriod: string;
  completedAt: string;
}

interface UpdateHistory {
  runId: number;
  committedAt: string | null;
  fileName: string;
  changedCount: number;
  addedCount: number;
  removedCount: number;
}

interface Props {
  contract: ContractData;
  plans: PlanData[];
  totalRecords: number;
  statusCounts: Record<string, number>;
  lastReconciliation: ReconHistory | null;
  lastUpdate: UpdateHistory | null;
}

const statusColors: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-gray-100 text-gray-600",
  future: "bg-blue-100 text-blue-700",
  superseded: "bg-purple-100 text-purple-600",
  draft: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  pending_review: "Pending Review",
  active: "Active",
  expired: "Expired",
  future: "Future",
  superseded: "Superseded",
  draft: "Draft",
  cancelled: "Cancelled",
};

const contractTypeLabels: Record<string, string> = {
  fixed_term: "Fixed Term",
  evergreen: "Evergreen",
};

const contractTypeBadgeColors: Record<string, string> = {
  fixed_term: "bg-blue-100 text-blue-700",
  evergreen: "bg-teal-100 text-teal-700",
};

export function ContractDetailClient({ contract, plans, totalRecords, statusCounts, lastReconciliation, lastUpdate }: Props) {
  const router = useRouter();
  const [reviewLoading, setReviewLoading] = useState(false);
  const [lastReviewed, setLastReviewed] = useState(contract.lastReviewedAt);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Approval state
  const [contractStatus, setContractStatus] = useState(contract.status);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Update dropdown state
  const [updateDropdownOpen, setUpdateDropdownOpen] = useState(false);
  const updateDropdownRef = useRef<HTMLDivElement>(null);

  // Add items modal state
  const [showAddItems, setShowAddItems] = useState(false);
  const [addItemRows, setAddItemRows] = useState<{ itemNumber: string; price: string; description: string }[]>([
    { itemNumber: "", price: "", description: "" },
  ]);
  const [addItemSaving, setAddItemSaving] = useState(false);
  const [addItemError, setAddItemError] = useState<string | null>(null);
  const [addItemSuccess, setAddItemSuccess] = useState<string | null>(null);
  const [addItemWarnings, setAddItemWarnings] = useState<string[]>([]);
  const [addItemPendingConfirm, setAddItemPendingConfirm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const isMultiPlan = plans.length > 1;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (updateDropdownRef.current && !updateDropdownRef.current.contains(e.target as Node)) {
        setUpdateDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get the target plan ID for adding items
  const defaultPlanId = plans.length === 1 ? plans[0].id : null;

  async function handleAddItems(forceConfirm = false) {
    const targetPlanId = isMultiPlan ? selectedPlanId : defaultPlanId;
    if (!targetPlanId) {
      setAddItemError(isMultiPlan ? "Please select a plan first." : "No plan exists for this contract.");
      return;
    }
    const validRows = addItemRows.filter((r) => r.itemNumber.trim() && r.price.trim());
    if (validRows.length === 0) {
      setAddItemError("Enter at least one item with a part number and price.");
      return;
    }
    setAddItemSaving(true);
    setAddItemError(null);
    setAddItemSuccess(null);
    if (!forceConfirm) {
      setAddItemWarnings([]);
      setAddItemPendingConfirm(false);
    }

    let created = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const row of validRows) {
      // Find or create item
      const itemRes = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemNumber: row.itemNumber.trim(), description: row.description.trim() || null }),
      });
      const itemData = await itemRes.json();
      const itemId = itemData.id || itemData.existing?.id;
      if (!itemId) {
        errors.push(`${row.itemNumber}: failed to create item`);
        continue;
      }

      // Create record — first pass without confirmWarnings to surface warnings
      const recRes = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rebatePlanId: targetPlanId,
          itemId,
          rebatePrice: row.price,
          startDate: new Date().toISOString().split("T")[0],
          endDate: null,
          ...(forceConfirm ? { confirmWarnings: true } : {}),
        }),
      });
      const recData = await recRes.json();

      if (recRes.ok && recData.needsConfirmation) {
        // Record API returned warnings — collect them
        const warnMsgs = (recData.warnings || []).map((w: { message: string }) => `${row.itemNumber}: ${w.message}`);
        warnings.push(...warnMsgs);
      } else if (recRes.ok) {
        created++;
      } else {
        errors.push(`${row.itemNumber}: ${recData.error || "failed"}`);
      }
    }

    setAddItemSaving(false);

    // If we got warnings on first pass, show them and ask for confirmation
    if (warnings.length > 0 && !forceConfirm) {
      setAddItemWarnings(warnings);
      setAddItemPendingConfirm(true);
      if (created > 0) {
        setAddItemSuccess(`${created} item${created > 1 ? "s" : ""} added. ${warnings.length} item${warnings.length > 1 ? "s" : ""} need${warnings.length === 1 ? "s" : ""} confirmation.`);
      }
      if (errors.length > 0) {
        setAddItemError(`${errors.length} failed: ${errors.join("; ")}`);
      }
      return;
    }

    if (errors.length > 0 && created === 0) {
      setAddItemError(`All items failed: ${errors.join("; ")}`);
    } else if (errors.length > 0 && created > 0) {
      setAddItemSuccess(`${created} item${created > 1 ? "s" : ""} added.`);
      setAddItemError(`${errors.length} failed: ${errors.join("; ")}`);
    } else if (created > 0) {
      setAddItemSuccess(`${created} item${created > 1 ? "s" : ""} added successfully.`);
      setAddItemRows([{ itemNumber: "", price: "", description: "" }]);
      setAddItemWarnings([]);
      setAddItemPendingConfirm(false);
      setTimeout(() => router.refresh(), 500);
    }
  }

  async function handleApproval(action: "approve" | "reject" | "revert") {
    setApproving(true);
    setApprovalError(null);
    try {
      const res = await fetch(`/api/contracts/${contract.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setContractStatus(data.status);
        if (data.lastReviewedAt) setLastReviewed(data.lastReviewedAt);
      } else {
        const err = await res.json();
        setApprovalError(err.error || `Failed to ${action}`);
      }
    } catch {
      setApprovalError("Network error");
    } finally {
      setApproving(false);
    }
  }

  async function markAsReviewed() {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const res = await fetch(`/api/contracts/${contract.id}/review`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLastReviewed(data.lastReviewedAt);
      } else {
        setReviewError("Failed to mark as reviewed");
      }
    } catch {
      setReviewError("Network error");
    } finally {
      setReviewLoading(false);
    }
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
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[contractStatus] || "bg-gray-100 text-gray-600"}`}>
                {statusLabels[contractStatus] || contractStatus}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${contractTypeBadgeColors[contract.contractType] || "bg-gray-100 text-gray-600"}`}>
                {contractTypeLabels[contract.contractType] || contract.contractType}
              </span>
            </div>
            {contract.description && (
              <p className="mt-1 text-sm text-gray-500">{contract.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={updateDropdownRef}>
              <button
                onClick={() => setUpdateDropdownOpen(!updateDropdownOpen)}
                className="rounded-lg bg-brennan-blue px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brennan-dark flex items-center gap-1"
              >
                Update Contract
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {updateDropdownOpen && (
                <div className="absolute right-0 mt-1 w-48 rounded-lg border border-brennan-border bg-white shadow-lg z-20">
                  <Link
                    href={`/contracts/${contract.id}/update`}
                    className="block px-4 py-2.5 text-xs text-gray-700 hover:bg-brennan-light rounded-t-lg"
                    onClick={() => setUpdateDropdownOpen(false)}
                  >
                    <span className="font-medium">Upload File</span>
                    <br />
                    <span className="text-gray-400">Compare a spreadsheet against current records</span>
                  </Link>
                  <button
                    onClick={() => { setShowAddItems(true); setUpdateDropdownOpen(false); }}
                    className="block w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-brennan-light rounded-b-lg border-t border-gray-100"
                  >
                    <span className="font-medium">Add Items Manually</span>
                    <br />
                    <span className="text-gray-400">Add a few parts or change prices directly</span>
                  </button>
                </div>
              )}
            </div>
            <Link
              href={`/records?contract=${contract.contractNumber}&distributor=${contract.distributor.code}&endUser=${encodeURIComponent(contract.endUser.name)}`}
              className="rounded-lg border border-brennan-border bg-white px-3 py-1.5 text-xs font-medium text-brennan-blue transition-colors hover:bg-brennan-light"
            >
              View all records →
            </Link>
            <button
              onClick={async () => {
                if (!confirm(`Delete contract ${contract.contractNumber} and all its records? This cannot be undone.`)) return;
                const res = await fetch(`/api/contracts/${contract.id}`, { method: "DELETE" });
                if (res.ok) router.push("/contracts");
                else alert("Failed to delete contract");
              }}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Approval banner — pending review */}
        {contractStatus === "pending_review" && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-800">This contract is pending review</p>
              <p className="text-xs text-amber-600 mt-0.5">Review the contract details and line items, then approve or reject.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { if (confirm("Reject this contract? You can revert this later if needed.")) handleApproval("reject"); }}
                disabled={approving}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => handleApproval("approve")}
                disabled={approving}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {approving ? "Processing..." : "Approve Contract"}
              </button>
            </div>
          </div>
        )}
        {/* Revert banner — active (undo approval) */}
        {contractStatus === "active" && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => { if (confirm("Revert this contract to pending review? It will need to be re-approved.")) handleApproval("revert"); }}
              disabled={approving}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              {approving ? "Processing..." : "Revert to Pending Review"}
            </button>
          </div>
        )}
        {/* Revert banner — cancelled (undo rejection) */}
        {contractStatus === "cancelled" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-800">This contract was rejected</p>
              <p className="text-xs text-red-600 mt-0.5">You can revert it to pending review if this was a mistake.</p>
            </div>
            <button
              onClick={() => handleApproval("revert")}
              disabled={approving}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {approving ? "Processing..." : "Revert to Pending Review"}
            </button>
          </div>
        )}
        {approvalError && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            {approvalError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
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
          {contract.customerNumber && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase">Customer #</p>
              <p className="mt-0.5 text-sm font-mono font-medium text-brennan-text">{contract.customerNumber}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Effective Dates</p>
            <p className="mt-0.5 text-sm text-brennan-text">
              {contract.startDate || "—"} → {contract.endDate || <span className="text-amber-500">Open</span>}
            </p>
            {contract.contractType === "evergreen" && contract.noticePeriodDays && (
              <p className="text-xs text-teal-600 mt-0.5">
                {contract.noticePeriodDays}-day notice period
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Last Reviewed</p>
            {lastReviewed ? (
              <p className="mt-0.5 text-sm text-gray-600">
                {new Date(lastReviewed).toLocaleDateString()}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-gray-400 italic">Never</p>
            )}
            <button
              onClick={markAsReviewed}
              disabled={reviewLoading}
              className="mt-1 rounded border border-brennan-border bg-white px-2 py-0.5 text-xs font-medium text-brennan-blue hover:bg-brennan-light disabled:opacity-50"
            >
              {reviewLoading ? "Saving..." : "Mark as Reviewed"}
            </button>
            {reviewError && <p className="mt-0.5 text-[10px] text-red-500">{reviewError}</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Last Updated</p>
            <p className="mt-0.5 text-sm text-gray-600">
              {new Date(contract.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Reconciliation & Update status bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Reconciliation status */}
        <div className={`rounded-lg border px-4 py-3 ${lastReconciliation ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${lastReconciliation ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="text-xs font-semibold text-gray-700">Reconciliation</span>
            </div>
            {lastReconciliation ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Reconciled</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Not Reconciled</span>
            )}
          </div>
          {lastReconciliation ? (
            <div className="mt-1.5 flex items-center justify-between">
              <p className="text-xs text-gray-600">
                Last reconciled <span className="font-medium">{lastReconciliation.claimPeriod}</span>
                {" "}on {new Date(lastReconciliation.completedAt).toLocaleDateString()}
              </p>
              <Link href="/reconciliation" className="text-xs font-medium text-emerald-700 hover:underline">
                View →
              </Link>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center justify-between">
              <p className="text-xs text-amber-700">No claims have been reconciled against this contract yet.</p>
              <Link
                href="/reconciliation"
                className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
              >
                Reconcile
              </Link>
            </div>
          )}
        </div>

        {/* Last update status */}
        <div className={`rounded-lg border px-4 py-3 ${lastUpdate ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${lastUpdate ? "bg-blue-500" : "bg-gray-400"}`} />
              <span className="text-xs font-semibold text-gray-700">Contract Updates</span>
            </div>
            {lastUpdate ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                {lastUpdate.changedCount + lastUpdate.addedCount + lastUpdate.removedCount} changes
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Original</span>
            )}
          </div>
          {lastUpdate ? (
            <p className="mt-1.5 text-xs text-gray-600">
              Last updated {lastUpdate.committedAt ? new Date(lastUpdate.committedAt).toLocaleDateString() : "—"}
              {" "}— {lastUpdate.changedCount} price change{lastUpdate.changedCount !== 1 ? "s" : ""}, {lastUpdate.addedCount} added, {lastUpdate.removedCount} removed
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-gray-500">No updates have been applied to this contract.</p>
          )}
        </div>
      </div>

      {/* Summary stats bar */}
      <div className="flex items-center gap-4 text-xs">
        <span className="font-medium text-gray-500">
          {totalRecords} record{totalRecords !== 1 ? "s" : ""}
        </span>
        {Object.entries(statusCounts).map(([status, count]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${(statusColors[status] || "bg-gray-300").split(" ")[0]}`} />
            <span className="text-gray-600">{count} {status}</span>
          </span>
        ))}
      </div>

      {/* Manual Add Items Panel */}
      {showAddItems && (
        <div className="rounded-lg border-2 border-brennan-blue bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-brennan-border bg-brennan-light px-4 py-3">
            <h3 className="text-sm font-semibold text-brennan-blue">Add Items to Contract</h3>
            <button
              onClick={() => { setShowAddItems(false); setAddItemError(null); setAddItemSuccess(null); }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          <div className="p-4 space-y-3">
            {isMultiPlan && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Target Plan <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedPlanId ?? ""}
                  onChange={(e) => setSelectedPlanId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-brennan-blue focus:outline-none"
                >
                  <option value="">Select plan...</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.planCode}{p.planName ? ` — ${p.planName}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 uppercase tracking-wider">
                  <th className="px-2 py-1">Part Number *</th>
                  <th className="px-2 py-1">Price *</th>
                  <th className="px-2 py-1">Description</th>
                  <th className="px-2 py-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {addItemRows.map((row, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={row.itemNumber}
                        onChange={(e) => {
                          const updated = [...addItemRows];
                          updated[i].itemNumber = e.target.value;
                          setAddItemRows(updated);
                        }}
                        placeholder="e.g. 7000-12"
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-brennan-blue focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={row.price}
                        onChange={(e) => {
                          const updated = [...addItemRows];
                          updated[i].price = e.target.value;
                          setAddItemRows(updated);
                        }}
                        placeholder="0.00"
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-brennan-blue focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => {
                          const updated = [...addItemRows];
                          updated[i].description = e.target.value;
                          setAddItemRows(updated);
                        }}
                        placeholder="Optional"
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-brennan-blue focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1">
                      {addItemRows.length > 1 && (
                        <button
                          onClick={() => setAddItemRows(addItemRows.filter((_, j) => j !== i))}
                          className="text-red-400 hover:text-red-600"
                          title="Remove row"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setAddItemRows([...addItemRows, { itemNumber: "", price: "", description: "" }])}
                className="text-xs text-brennan-blue hover:underline"
              >
                + Add another row
              </button>
              <div className="space-y-2">
                {addItemWarnings.length > 0 && (
                  <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-medium text-amber-700 mb-1">Warnings — review before proceeding:</p>
                    <ul className="text-xs text-amber-600 space-y-0.5">
                      {addItemWarnings.map((w, i) => <li key={i}>• {w}</li>)}
                    </ul>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  {addItemError && <span className="text-xs text-red-500">{addItemError}</span>}
                  {addItemSuccess && <span className="text-xs text-emerald-600">{addItemSuccess}</span>}
                  {addItemPendingConfirm ? (
                    <button
                      onClick={() => handleAddItems(true)}
                      disabled={addItemSaving}
                      className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                    >
                      {addItemSaving ? "Saving..." : "Save Anyway (Accept Warnings)"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAddItems()}
                      disabled={addItemSaving}
                      className="rounded-lg bg-brennan-blue px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brennan-dark disabled:opacity-50"
                    >
                      {addItemSaving ? "Saving..." : "Save Items"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Records table — shows plan column only for multi-plan contracts */}
      {(() => {
        const isMultiPlan = plans.length > 1;
        return totalRecords === 0 ? (
          <div className="rounded-lg border border-brennan-border bg-white py-8 text-center text-sm text-gray-400">
            No records under this contract.
          </div>
        ) : (
          <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500 uppercase tracking-wider border-b border-brennan-border">
                  <th className="px-4 py-2">Item #</th>
                  <th className="px-3 py-2">Description</th>
                  {isMultiPlan && <th className="px-3 py-2">Plan</th>}
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2">Start</th>
                  <th className="px-3 py-2">End</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {plans.flatMap((plan) =>
                  plan.records.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-1.5 font-mono font-medium">
                        <Link
                          href={`/records/${r.id}`}
                          className="text-brennan-blue hover:underline"
                          title={`View record #${r.id}`}
                        >
                          {r.itemNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">
                        {r.itemDescription || "—"}
                      </td>
                      {isMultiPlan && (
                        <td className="px-3 py-1.5 text-gray-500 font-mono text-[10px]">
                          {plan.planCode}
                        </td>
                      )}
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
                  ))
                )}
              </tbody>
            </table>
            <div className="border-t border-gray-100 px-4 py-2 flex items-center justify-between">
              <Link
                href={`/records?contract=${contract.contractNumber}&distributor=${contract.distributor.code}&endUser=${encodeURIComponent(contract.endUser.name)}`}
                className="text-xs text-brennan-blue hover:underline"
              >
                View in Records workspace →
              </Link>
              <div className="flex items-center gap-2">
                {contract.distributor.code === "FAS" && (
                  <a
                    href={`/api/export/fastenal-spa/${contract.id}`}
                    className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    Export Fastenal SPA
                  </a>
                )}
                <a
                  href={`/api/export/records-csv?contract=${contract.contractNumber}&distributor=${contract.distributor.code}${contract.endUser.code ? `&endUserCode=${encodeURIComponent(contract.endUser.code)}` : `&endUser=${encodeURIComponent(contract.endUser.name)}`}&columns=item,price`}
                  className="rounded border border-brennan-border bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-brennan-light transition-colors"
                >
                  Export CSV
                </a>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Activity & Dispute History panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityPanel contractId={contract.id} />
        <DisputePanel contractId={contract.id} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Panel (lazy-loaded)
// ---------------------------------------------------------------------------

interface TimelineEvent {
  type: string;
  timestamp: string;
  user: string;
  summary: string;
  detail?: Record<string, unknown>;
}

function ActivityPanel({ contractId }: { contractId: number }) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (events) { setExpanded(!expanded); return; }
    setExpanded(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${contractId}/activity?limit=30`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events);
      } else {
        setError("Failed to load activity");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const eventTypeIcon: Record<string, string> = {
    contract_update: "text-blue-500",
    contract_update_committed: "text-emerald-500",
    contract_update_cancelled: "text-red-500",
    contract_update_staged: "text-amber-500",
    record_change: "text-gray-500",
    reconciliation_committed: "text-purple-500",
    reconciliation_review: "text-purple-400",
  };

  return (
    <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
      <button
        onClick={load}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-brennan-light/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-sm font-semibold text-brennan-text">Activity History</span>
        </div>
        {events && <span className="text-xs text-gray-400">{events.length} events</span>}
      </button>

      {expanded && (
        <div className="border-t border-brennan-border max-h-80 overflow-y-auto">
          {loading && <p className="px-4 py-3 text-xs text-gray-400 animate-pulse">Loading...</p>}
          {error && <p className="px-4 py-3 text-xs text-red-500">{error}</p>}
          {events && events.length === 0 && (
            <p className="px-4 py-4 text-xs text-gray-400">No activity recorded yet.</p>
          )}
          {events && events.length > 0 && (
            <div className="divide-y divide-gray-50">
              {events.map((ev, i) => (
                <div key={i} className="px-4 py-2 flex items-start gap-3">
                  <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${eventTypeIcon[ev.type] || "text-gray-400"} bg-current`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-brennan-text">{ev.summary}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {ev.user} · {new Date(ev.timestamp).toLocaleDateString()} {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispute Panel (lazy-loaded)
// ---------------------------------------------------------------------------

interface DisputeRun {
  runId: number;
  claimPeriod: string;
  runStatus: string;
  runDate: string;
  issues: { id: number; code: string; severity: string; category: string; description: string; resolution: string | null }[];
}

function DisputePanel({ contractId }: { contractId: number }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<{ runs: DisputeRun[]; totalIssues: number; bySeverity: Record<string, number>; byCode: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (data) { setExpanded(!expanded); return; }
    setExpanded(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${contractId}/disputes?limit=100`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Failed to load disputes");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const severityColor: Record<string, string> = {
    error: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
  };

  return (
    <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
      <button
        onClick={load}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-brennan-light/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-sm font-semibold text-brennan-text">Dispute History</span>
        </div>
        {data && <span className="text-xs text-gray-400">{data.totalIssues} issues across {data.runs.length} runs</span>}
      </button>

      {expanded && (
        <div className="border-t border-brennan-border max-h-80 overflow-y-auto">
          {loading && <p className="px-4 py-3 text-xs text-gray-400 animate-pulse">Loading...</p>}
          {error && <p className="px-4 py-3 text-xs text-red-500">{error}</p>}
          {data && data.runs.length === 0 && (
            <p className="px-4 py-4 text-xs text-gray-400">No disputes or errors found for this contract.</p>
          )}
          {data && data.runs.length > 0 && (
            <div>
              {/* Summary bar */}
              {data.totalIssues > 0 && (
                <div className="px-4 py-2 bg-gray-50 flex items-center gap-3 text-xs border-b border-gray-100">
                  {Object.entries(data.bySeverity).map(([sev, count]) => (
                    <span key={sev} className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityColor[sev] || "bg-gray-100 text-gray-600"}`}>
                      {count} {sev}
                    </span>
                  ))}
                </div>
              )}
              {/* Runs */}
              <div className="divide-y divide-gray-100">
                {data.runs.map((run) => (
                  <div key={run.runId} className="px-4 py-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-brennan-text">{run.claimPeriod}</p>
                      <span className="text-[10px] text-gray-400">{run.issues.length} issues</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {run.issues.slice(0, 5).map((issue) => (
                        <span key={issue.id} className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${severityColor[issue.severity] || "bg-gray-100"}`}>
                          {issue.code}
                        </span>
                      ))}
                      {run.issues.length > 5 && (
                        <span className="text-[10px] text-gray-400">+{run.issues.length - 5} more</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
