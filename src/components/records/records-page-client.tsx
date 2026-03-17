"use client";

import { useState, useCallback, useEffect, useRef, Suspense, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RecordModal } from "./record-modal";
import { StatusBadge } from "./status-badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
        <button
          onClick={handleNewRecord}
          className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brennan-dark"
        >
          + New Record
        </button>
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
              <th className="w-16 px-3 py-2.5" />
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
                  <button
                    type="button"
                    onClick={() => setEntityModal({ type: "contract", id: r.contractId })}
                    className="text-sm font-medium text-brennan-text hover:text-brennan-blue hover:underline"
                  >
                    {r.contractNumber}
                  </button>
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
                  <button
                    onClick={() => handleEdit(r)}
                    className="text-xs font-medium text-brennan-blue hover:text-brennan-dark"
                  >
                    Edit
                  </button>
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
  useState(() => {
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
  });

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

// Wrap with Suspense for useSearchParams
export function RecordsPageClient(props: RecordsPageClientProps) {
  return (
    <Suspense>
      <RecordsPageInner {...props} />
    </Suspense>
  );
}
