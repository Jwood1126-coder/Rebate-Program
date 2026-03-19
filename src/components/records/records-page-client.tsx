"use client";

import { useState, useCallback, useEffect, useRef, Suspense, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RecordModal } from "./record-modal";
import { SupersedeModal } from "./supersede-modal";
import { StatusBadge } from "./status-badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getAvailableActions } from "@/lib/records/record-actions";
import type { RecordStatus } from "@/lib/constants/statuses";

export interface RecordRow {
  id: number;
  distributor: string;
  distributorId: number;
  contractNumber: string;
  contractId: number;
  planCode: string;
  planId: number;
  endUser: string;
  endUserId: number;
  itemNumber: string;
  itemId: number;
  rebatePrice: string;
  startDate: string;
  endDate: string;
  status: RecordStatus;
  rebatePlanId: number;
  rawStartDate: string;
  rawEndDate: string | null;
}

export interface FilterOptions {
  distributors: string[];
  contracts: string[];
  plans: string[];
  endUsers: string[];
  statuses: string[];
}

interface RecordsPageClientProps {
  records: RecordRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: FilterOptions;
}

function RecordsPageInner({
  records,
  totalCount,
  page,
  pageSize,
  totalPages,
  filterOptions,
}: RecordsPageClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<{
    id: number;
    rebatePlanId: number;
    itemId: number;
    rebatePrice: string;
    startDate: string;
    endDate: string;
  } | null>(null);

  // Supersede modal state
  const [supersedeRecord, setSupersedeRecord] = useState<RecordRow | null>(null);

  // Confirmation dialog state (expire / cancel)
  const [confirmAction, setConfirmAction] = useState<{
    type: "expire" | "cancel" | "restore";
    record: RecordRow;
  } | null>(null);

  // Entity edit modal state
  const [entityModal, setEntityModal] = useState<{
    type: "distributor" | "contract" | "plan" | "item" | "endUser";
    id: number;
  } | null>(null);

  // Read current filter values from URL params
  const filterDistributor = searchParams.get("distributor") || "";
  const filterContract = searchParams.get("contract") || "";
  const filterPlan = searchParams.get("plan") || "";
  const filterEndUser = searchParams.get("endUser") || "";
  const filterStatus = searchParams.get("status") || "";
  const filterDateFrom = searchParams.get("dateFrom") || "";
  const filterDateTo = searchParams.get("dateTo") || "";
  const searchText = searchParams.get("search") || "";

  const hasFilters =
    filterDistributor ||
    filterContract ||
    filterPlan ||
    filterEndUser ||
    filterStatus ||
    filterDateFrom ||
    filterDateTo ||
    searchText;

  /**
   * Update URL search params — triggers server re-render with new WHERE clause.
   * Resets to page 1 when filters change.
   */
  const updateParams = useCallback(
    (updates: Record<string, string>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      if (resetPage) {
        params.delete("page");
      }
      startTransition(() => {
        router.replace(`/records?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router]
  );

  const setFilter = useCallback(
    (key: string, value: string) => updateParams({ [key]: value }),
    [updateParams]
  );

  const setPage = useCallback(
    (p: number) => updateParams({ page: p > 1 ? String(p) : "" }, false),
    [updateParams]
  );

  const clearFilters = useCallback(() => {
    startTransition(() => {
      router.replace("/records", { scroll: false });
    });
  }, [router]);

  // --- Auto-clear stale selections ---
  // When cascading options narrow and the currently selected value is no longer
  // available, clear that filter so the user isn't stuck with an invisible selection.
  useEffect(() => {
    const stale: Record<string, string> = {};
    if (filterDistributor && !filterOptions.distributors.includes(filterDistributor)) {
      stale.distributor = "";
    }
    if (filterContract && !filterOptions.contracts.includes(filterContract)) {
      stale.contract = "";
    }
    if (filterPlan && !filterOptions.plans.includes(filterPlan)) {
      stale.plan = "";
    }
    if (filterEndUser && !filterOptions.endUsers.includes(filterEndUser)) {
      stale.endUser = "";
    }
    if (Object.keys(stale).length > 0) {
      updateParams(stale);
    }
  // Only run when filter options change (server re-rendered with narrowed options)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOptions]);

  function handleEdit(record: RecordRow) {
    setEditRecord({
      id: record.id,
      rebatePlanId: record.rebatePlanId,
      itemId: record.itemId,
      rebatePrice: record.rebatePrice,
      startDate: record.rawStartDate,
      endDate: record.rawEndDate ?? "",
    });
    setModalOpen(true);
  }

  function handleNewRecord() {
    setEditRecord(null);
    setModalOpen(true);
  }

  async function handleConfirmAction() {
    if (!confirmAction) return;
    const { type, record } = confirmAction;

    const url = type === "expire"
      ? `/api/records/${record.id}/expire`
      : type === "restore"
        ? `/api/records/${record.id}/restore`
        : `/api/records/${record.id}`;
    const method = type === "cancel" ? "DELETE" : "POST";

    try {
      const res = await fetch(url, { method });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || `Failed to ${type} record`);
        return;
      }
      router.refresh();
    } catch {
      alert("Network error");
    } finally {
      setConfirmAction(null);
    }
  }

  // Export current filtered view as CSV
  const [exporting, setExporting] = useState(false);
  async function handleExport() {
    setExporting(true);
    try {
      // Pass current filters to the CSV endpoint
      const exportParams = new URLSearchParams();
      if (filterDistributor) exportParams.set("distributor", filterDistributor);
      if (filterContract) exportParams.set("contract", filterContract);
      if (filterPlan) exportParams.set("plan", filterPlan);
      if (filterEndUser) exportParams.set("endUser", filterEndUser);
      if (filterStatus) exportParams.set("status", filterStatus);
      if (filterDateFrom) exportParams.set("dateFrom", filterDateFrom);
      if (filterDateTo) exportParams.set("dateTo", filterDateTo);
      if (searchText) exportParams.set("search", searchText);

      const qs = exportParams.toString();
      const url = `/api/export/records-csv${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        alert("Export failed");
        return;
      }
      const blob = await res.blob();
      const filename = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1]
        || "rms-records-export.csv";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      alert("Export failed");
    } finally {
      setExporting(false);
    }
  }

  // Audit history panel state
  const [historyRecordId, setHistoryRecordId] = useState<number | null>(null);

  // Which actions are available for a record based on its status
  // Uses shared helper so detail page and table stay in sync
  function getRowActions(r: RecordRow) {
    const avail = getAvailableActions(r.status);
    const actions: { label: string; onClick: () => void; danger?: boolean }[] = [];
    // View detail is always available — canonical record inspection surface
    actions.push({ label: "View", onClick: () => router.push(`/records/${r.id}`) });
    if (avail.canEdit) actions.push({ label: "Edit", onClick: () => handleEdit(r) });
    if (avail.canSupersede) actions.push({ label: "Supersede", onClick: () => setSupersedeRecord(r) });
    if (avail.canExpire) actions.push({ label: "Expire", onClick: () => setConfirmAction({ type: "expire", record: r }), danger: true });
    if (avail.canCancel) actions.push({ label: "Cancel", onClick: () => setConfirmAction({ type: "cancel", record: r }), danger: true });
    if (avail.canRestore) actions.push({ label: "Restore", onClick: () => setConfirmAction({ type: "restore", record: r }) });
    // History is always available regardless of status
    actions.push({ label: "History", onClick: () => setHistoryRecordId(r.id) });
    return actions;
  }

  // Convert to SearchableSelect options
  const distributorOptions = filterOptions.distributors.map((d) => ({ value: d, label: d }));
  const contractOptions = filterOptions.contracts.map((c) => ({ value: c, label: c }));
  const planOptions = filterOptions.plans.map((p) => ({ value: p, label: p }));
  const endUserOptions = filterOptions.endUsers.map((u) => ({ value: u, label: u }));
  const statusOptions = filterOptions.statuses.map((s) => ({
    value: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
  }));

  // Pagination info
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brennan-text">Rebate Records</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {totalCount === 0
              ? "No records"
              : hasFilters
                ? `${totalCount} matching records`
                : `${totalCount} total records`}
            {isPending && (
              <span className="ml-2 text-brennan-blue">Loading...</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || totalCount === 0}
            className="rounded-lg border border-brennan-border bg-white px-3 py-2 text-sm font-medium text-brennan-text shadow-sm transition-colors hover:bg-brennan-light disabled:opacity-50"
          >
            {exporting ? "Exporting..." : hasFilters ? "Export Filtered" : "Export CSV"}
          </button>
          <button
            onClick={handleNewRecord}
            className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brennan-dark"
          >
            + New Record
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-brennan-border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <SearchableSelect
            options={distributorOptions}
            value={filterDistributor}
            onChange={(v) => setFilter("distributor", v)}
            placeholder="All Distributors"
            className="w-36"
          />
          <SearchableSelect
            options={contractOptions}
            value={filterContract}
            onChange={(v) => setFilter("contract", v)}
            placeholder="All Contracts"
            className="w-36"
          />
          <SearchableSelect
            options={planOptions}
            value={filterPlan}
            onChange={(v) => setFilter("plan", v)}
            placeholder="All Plans"
            className="w-32"
          />
          <SearchableSelect
            options={endUserOptions}
            value={filterEndUser}
            onChange={(v) => setFilter("endUser", v)}
            placeholder="All End Users"
            className="w-40"
          />
          <SearchableSelect
            options={statusOptions}
            value={filterStatus}
            onChange={(v) => setFilter("status", v)}
            placeholder="All Statuses"
            className="w-32"
          />

          <div className="mx-1 h-5 w-px bg-brennan-border" />

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-400">From</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilter("dateFrom", e.target.value)}
              className="h-8 rounded border border-brennan-border bg-white px-2 text-xs text-brennan-text focus:border-brennan-blue focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-400">To</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilter("dateTo", e.target.value)}
              className="h-8 rounded border border-brennan-border bg-white px-2 text-xs text-brennan-text focus:border-brennan-blue focus:outline-none"
            />
          </div>

          <div className="mx-1 h-5 w-px bg-brennan-border" />

          <SearchInput
            value={searchText}
            onChange={(v) => setFilter("search", v)}
          />
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="h-8 rounded border border-brennan-border bg-white px-2.5 text-xs text-gray-500 transition-colors hover:bg-brennan-light hover:text-brennan-text"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Records table */}
      <div className="overflow-hidden rounded-lg border border-brennan-border bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-brennan-border bg-gray-50">
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Distributor</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Contract</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Plan</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">End User</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Item #</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Price</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Start</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">End</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
              <th className="w-12 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brennan-border">
            {records.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-brennan-light/40">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setEntityModal({ type: "distributor", id: r.distributorId })}
                    className="rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-bold text-brennan-blue hover:bg-brennan-blue/20 transition-colors"
                  >
                    {r.distributor}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <a
                    href={`/contracts/${r.contractId}`}
                    className="text-sm font-medium text-brennan-blue hover:underline"
                  >
                    {r.contractNumber}
                  </a>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setEntityModal({ type: "plan", id: r.planId })}
                    className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    {r.planCode}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setEntityModal({ type: "endUser", id: r.endUserId })}
                    className="text-sm text-brennan-text hover:text-brennan-blue hover:underline"
                  >
                    {r.endUser}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setEntityModal({ type: "item", id: r.itemId })}
                    className="font-mono text-sm text-brennan-text hover:text-brennan-blue hover:underline"
                  >
                    {r.itemNumber}
                  </button>
                </td>
                <td className="px-3 py-2 text-right text-sm font-medium text-brennan-text">${r.rebatePrice}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.startDate}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.endDate || <span className="text-amber-500">Open</span>}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-right">
                  <RowActions actions={getRowActions(r)} />
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">
                  {hasFilters
                    ? "No records match your filters."
                    : "No rebate records yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between border-t border-brennan-border bg-gray-50 px-4 py-2.5">
            <p className="text-xs text-gray-500">
              Showing {rangeStart}–{rangeEnd} of {totalCount.toLocaleString()} records
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="rounded border border-brennan-border bg-white px-2 py-1 text-xs text-gray-600 hover:bg-brennan-light disabled:opacity-40 disabled:cursor-not-allowed"
              >
                First
              </button>
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="rounded border border-brennan-border bg-white px-2 py-1 text-xs text-gray-600 hover:bg-brennan-light disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-2 text-xs text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="rounded border border-brennan-border bg-white px-2 py-1 text-xs text-gray-600 hover:bg-brennan-light disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="rounded border border-brennan-border bg-white px-2 py-1 text-xs text-gray-600 hover:bg-brennan-light disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      <RecordModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        record={editRecord}
      />

      {/* Supersede modal */}
      {supersedeRecord && (
        <SupersedeModal
          open
          onClose={() => setSupersedeRecord(null)}
          record={supersedeRecord}
        />
      )}

      {/* Expire / Cancel / Restore confirmation */}
      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction.type === "expire" ? "Expire Record"
              : confirmAction.type === "restore" ? "Restore Record"
              : "Cancel Record"
          }
          message={
            confirmAction.type === "expire"
              ? `This will set the end date of Record #${confirmAction.record.id} to today, making it expire immediately. This action can be undone by editing the end date.`
              : confirmAction.type === "restore"
                ? `This will restore Record #${confirmAction.record.id}. Its status will be re-derived from its dates.`
                : `This will cancel Record #${confirmAction.record.id}. Cancelled records are preserved for audit but can be restored later.`
          }
          confirmLabel={
            confirmAction.type === "expire" ? "Expire"
              : confirmAction.type === "restore" ? "Restore"
              : "Cancel Record"
          }
          danger={confirmAction.type === "cancel"}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Entity edit modals */}
      {entityModal?.type === "distributor" && (
        <EntityEditModal
          type="distributor"
          id={entityModal.id}
          onClose={() => setEntityModal(null)}
        />
      )}
      {entityModal?.type === "contract" && (
        <EntityEditModal
          type="contract"
          id={entityModal.id}
          onClose={() => setEntityModal(null)}
        />
      )}
      {entityModal?.type === "plan" && (
        <EntityEditModal
          type="plan"
          id={entityModal.id}
          onClose={() => setEntityModal(null)}
        />
      )}
      {entityModal?.type === "item" && (
        <EntityEditModal
          type="item"
          id={entityModal.id}
          onClose={() => setEntityModal(null)}
        />
      )}
      {entityModal?.type === "endUser" && (
        <EntityEditModal
          type="endUser"
          id={entityModal.id}
          onClose={() => setEntityModal(null)}
        />
      )}

      {/* Audit history panel */}
      {historyRecordId && (
        <AuditHistoryPanel
          recordId={historyRecordId}
          onClose={() => setHistoryRecordId(null)}
        />
      )}
    </>
  );
}

/**
 * Debounced search input — waits 400ms after typing stops before updating URL params.
 * Prevents a server round-trip on every keystroke.
 */
function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync local state when the URL value changes externally
  // (e.g., Clear button, back/forward navigation, deep links).
  // Cancel any pending debounce so a stale onChange doesn't re-apply the old value.
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional prop-to-state sync
    setLocal(value);
  }, [value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChange(v: string) {
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onChange(v);
    }, 400);
  }

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="Search..."
      className="h-8 min-w-[160px] flex-1 rounded border border-brennan-border px-2 text-xs focus:border-brennan-blue focus:outline-none"
    />
  );
}

// Generic entity edit modal — fetches entity data and provides edit form
function EntityEditModal({
  type,
  id,
  onClose,
}: {
  type: "distributor" | "contract" | "plan" | "item" | "endUser";
  id: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const apiPath = type === "endUser" ? "end-users" : type === "plan" ? "plans" : `${type}s`;

  // Fetch entity on mount
  useEffect(() => {
    fetch(`/api/${apiPath}/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject("Not found")))
      .then((d) => {
        setData(d);
        setFormData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load");
        setLoading(false);
      });
  }, [apiPath, id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/${apiPath}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to save");
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function updateField(key: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  const inputCls = "w-full rounded-lg border border-brennan-border px-3 py-2 text-sm text-brennan-text focus:border-brennan-blue focus:outline-none focus:ring-1 focus:ring-brennan-blue";
  const readOnlyCls = "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500";

  const titles: Record<string, string> = {
    distributor: "Edit Distributor",
    contract: "Edit Contract",
    plan: "Edit Rebate Plan",
    item: "Edit Item",
    endUser: "Edit End User",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brennan-border px-5 py-3.5">
          <h2 className="text-base font-bold text-brennan-text">{titles[type]}</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-brennan-light hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {loading && <p className="text-sm text-gray-400">Loading...</p>}
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {data && !loading && (
            <div className="space-y-3">
              {type === "distributor" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Code</label>
                    <input className={readOnlyCls} value={String(formData.code || "")} readOnly />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
                    <input className={inputCls} value={String(formData.name || "")} onChange={(e) => updateField("name", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(formData.isActive)} onChange={(e) => updateField("isActive", e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                    <label className="text-sm text-brennan-text">Active</label>
                  </div>
                </>
              )}

              {type === "contract" && (
                <>
                  {formData.distributor && (
                    <div className="rounded-lg bg-brennan-light/60 px-3 py-2 text-xs text-gray-600">
                      <span className="font-bold text-brennan-blue">{(formData.distributor as Record<string, string>).code}</span>
                      {" "}{(formData.distributor as Record<string, string>).name}
                      {formData.endUser ? (
                        <> &middot; {(formData.endUser as Record<string, string>).name}</>
                      ) : null}
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Contract Number</label>
                    <input className={inputCls} value={String(formData.contractNumber || "")} onChange={(e) => updateField("contractNumber", e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
                    <input className={inputCls} value={String(formData.description || "")} onChange={(e) => updateField("description", e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
                    <select className={inputCls} value={String(formData.status || "active")} onChange={(e) => updateField("status", e.target.value)}>
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </>
              )}

              {type === "plan" && (
                <>
                  {formData.contract && (
                    <div className="rounded-lg bg-brennan-light/60 px-3 py-2 text-xs text-gray-600">
                      <span className="font-bold text-brennan-blue">
                        {((formData.contract as Record<string, Record<string, string>>).distributor)?.code}
                      </span>
                      {" / Contract "}
                      {(formData.contract as Record<string, string>).contractNumber}
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Plan Code</label>
                    <input className={readOnlyCls} value={String(formData.planCode || "")} readOnly />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Plan Name</label>
                    <input className={inputCls} value={String(formData.planName || "")} onChange={(e) => updateField("planName", e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Discount Type</label>
                    <select className={inputCls} value={String(formData.discountType || "part")} onChange={(e) => updateField("discountType", e.target.value)}>
                      <option value="part">Part</option>
                      <option value="product_code">Product Code</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
                    <select className={inputCls} value={String(formData.status || "active")} onChange={(e) => updateField("status", e.target.value)}>
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </>
              )}

              {type === "item" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Item Number</label>
                    <input className={readOnlyCls} value={String(formData.itemNumber || "")} readOnly />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
                    <input className={inputCls} value={String(formData.description || "")} onChange={(e) => updateField("description", e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Product Code</label>
                    <input className={inputCls} value={String(formData.productCode || "")} onChange={(e) => updateField("productCode", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(formData.isActive)} onChange={(e) => updateField("isActive", e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                    <label className="text-sm text-brennan-text">Active</label>
                  </div>
                </>
              )}

              {type === "endUser" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Code</label>
                    <input className={readOnlyCls} value={String(formData.code || "")} readOnly />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
                    <input className={inputCls} value={String(formData.name || "")} onChange={(e) => updateField("name", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(formData.isActive)} onChange={(e) => updateField("isActive", e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                    <label className="text-sm text-brennan-text">Active</label>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {data && !loading && (
          <div className="flex justify-end gap-2 border-t border-brennan-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-brennan-border bg-white px-4 py-2 text-sm font-medium text-brennan-text transition-colors hover:bg-brennan-light"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brennan-dark disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Record detail panel — tabbed modal showing History + Notes for a single record.
 */
function AuditHistoryPanel({
  recordId,
  onClose,
}: {
  recordId: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"history" | "notes">("history");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl bg-white shadow-2xl">
        {/* Header with tabs */}
        <div className="border-b border-brennan-border px-5 py-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-brennan-text">
              Record #{recordId}
            </h2>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-brennan-light hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-2 flex gap-1">
            {(["history", "notes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  tab === t
                    ? "bg-brennan-blue text-white"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                }`}
              >
                {t === "history" ? "History" : "Notes"}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "history" && <HistoryTab recordId={recordId} />}
          {tab === "notes" && <NotesTab recordId={recordId} />}
        </div>

        {/* Footer */}
        <div className="border-t border-brennan-border px-5 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-lg border border-brennan-border bg-white px-4 py-2 text-sm font-medium text-brennan-text transition-colors hover:bg-brennan-light"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ recordId }: { recordId: number }) {
  const [entries, setEntries] = useState<{
    id: number;
    action: string;
    changedFields: Record<string, { old: unknown; new: unknown }> | null;
    user: { displayName: string } | null;
    createdAt: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/audit?table=rebate_records&recordId=${recordId}&limit=50`)
      .then((res) => res.ok ? res.json() : Promise.reject("Failed"))
      .then((data) => {
        setEntries(data.entries ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [recordId]);

  const actionColors: Record<string, string> = {
    INSERT: "bg-green-100 text-green-700",
    UPDATE: "bg-blue-100 text-blue-700",
    DELETE: "bg-red-100 text-red-700",
  };

  function formatValue(v: unknown): string {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  }

  if (loading) return <p className="text-sm text-gray-400">Loading history...</p>;
  if (entries.length === 0) return <p className="text-sm text-gray-400">No audit entries found for this record.</p>;

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-brennan-border p-3">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${actionColors[entry.action] || "bg-gray-100 text-gray-600"}`}>
              {entry.action}
            </span>
            <span className="text-xs text-gray-500">
              {entry.user?.displayName ?? "System"}
            </span>
            <span className="ml-auto text-xs text-gray-400">
              {new Date(entry.createdAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>

          {entry.changedFields && Object.keys(entry.changedFields).length > 0 && (
            <div className="mt-2 space-y-1">
              {Object.entries(entry.changedFields).map(([field, diff]) => (
                <div key={field} className="flex items-start gap-2 text-xs">
                  <span className="min-w-[80px] shrink-0 font-medium text-gray-600">
                    {field}
                  </span>
                  {entry.action === "INSERT" ? (
                    <span className="text-green-700">
                      {formatValue(typeof diff === "object" && diff && "new" in diff ? diff.new : diff)}
                    </span>
                  ) : (
                    <span className="text-gray-500">
                      <span className="line-through text-red-400">
                        {formatValue(typeof diff === "object" && diff && "old" in diff ? diff.old : null)}
                      </span>
                      {" → "}
                      <span className="font-medium text-brennan-text">
                        {formatValue(typeof diff === "object" && diff && "new" in diff ? diff.new : diff)}
                      </span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NotesTab({ recordId }: { recordId: number }) {
  const [notes, setNotes] = useState<{
    id: number;
    noteText: string;
    noteType: string;
    createdBy: { displayName: string; username: string };
    createdAt: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(() => {
    fetch(`/api/records/${recordId}/notes`)
      .then((res) => res.ok ? res.json() : Promise.reject("Failed"))
      .then((data) => {
        setNotes(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [recordId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/records/${recordId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText: newNote.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add note");
        return;
      }
      setNewNote("");
      fetchNotes();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const noteTypeColors: Record<string, string> = {
    general: "bg-gray-100 text-gray-600",
    pricing: "bg-blue-100 text-blue-600",
    contract: "bg-purple-100 text-purple-600",
  };

  return (
    <div className="space-y-4">
      {/* Add note form */}
      <div className="space-y-2">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note about this record..."
          rows={2}
          className="w-full rounded-lg border border-brennan-border px-3 py-2 text-sm text-brennan-text placeholder:text-gray-400 focus:border-brennan-blue focus:outline-none focus:ring-1 focus:ring-brennan-blue"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            onClick={handleAddNote}
            disabled={saving || !newNote.trim()}
            className="rounded-lg bg-brennan-blue px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brennan-dark disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add Note"}
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loading && <p className="text-sm text-gray-400">Loading notes...</p>}

      {!loading && notes.length === 0 && (
        <p className="text-sm text-gray-400">No notes yet for this record.</p>
      )}

      {!loading && notes.length > 0 && (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-brennan-border p-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${noteTypeColors[note.noteType] || "bg-gray-100 text-gray-600"}`}>
                  {note.noteType}
                </span>
                <span className="text-xs text-gray-500">
                  {note.createdBy.displayName}
                </span>
                <span className="ml-auto text-xs text-gray-400">
                  {new Date(note.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-brennan-text whitespace-pre-wrap">
                {note.noteText}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Row action dropdown — shows available actions for a record based on its status.
 */
function RowActions({
  actions,
}: {
  actions: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (actions.length === 0) return null;

  // Single action: show as direct button
  if (actions.length === 1) {
    return (
      <button
        onClick={actions[0].onClick}
        className={`text-xs font-medium ${
          actions[0].danger
            ? "text-red-500 hover:text-red-700"
            : "text-brennan-blue hover:text-brennan-dark"
        }`}
      >
        {actions[0].label}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="rounded p-1 text-gray-400 hover:bg-brennan-light hover:text-gray-600"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-brennan-border bg-white py-1 shadow-lg">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className={`block w-full px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                action.danger
                  ? "text-red-600 hover:bg-red-50"
                  : "text-brennan-text hover:bg-brennan-light"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Generic confirmation dialog for dangerous actions (expire, cancel).
 */
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl">
        <div className="px-5 py-4">
          <h3 className="text-base font-bold text-brennan-text">{title}</h3>
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-brennan-border px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-brennan-border bg-white px-4 py-2 text-sm font-medium text-brennan-text transition-colors hover:bg-brennan-light"
          >
            Go Back
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-brennan-blue hover:bg-brennan-dark"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Wrap with Suspense for useSearchParams
export function RecordsPageClient(props: RecordsPageClientProps) {
  return (
    <Suspense>
      <RecordsPageInner {...props} />
    </Suspense>
  );
}
