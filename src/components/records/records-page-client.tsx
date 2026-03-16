"use client";

import { useState, useMemo, useEffect, useCallback, Suspense } from "react";
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

interface RecordsPageClientProps {
  records: RecordRow[];
  totalCount: number;
}

// Helper: filter records by all filters except the excluded key
function filterExcluding(
  records: RecordRow[],
  filters: Record<string, string>,
  excludeKey: string,
  searchText: string
): RecordRow[] {
  return records.filter((r) => {
    for (const [key, val] of Object.entries(filters)) {
      if (key === excludeKey || !val) continue;
      switch (key) {
        case "distributor":
          if (r.distributor !== val) return false;
          break;
        case "contract":
          if (r.contractNumber !== val) return false;
          break;
        case "plan":
          if (r.planCode !== val) return false;
          break;
        case "endUser":
          if (r.endUser !== val) return false;
          break;
        case "status":
          if (r.status !== val) return false;
          break;
        case "dateFrom":
          if (r.rawStartDate < val) return false;
          break;
        case "dateTo": {
          const endDate = r.rawEndDate ?? "9999-12-31";
          if (endDate > val) return false;
          break;
        }
      }
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      if (
        !r.distributor.toLowerCase().includes(q) &&
        !r.itemNumber.toLowerCase().includes(q) &&
        !r.contractNumber.toLowerCase().includes(q) &&
        !r.planCode.toLowerCase().includes(q) &&
        !r.endUser.toLowerCase().includes(q) &&
        !r.rebatePrice.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)].sort();
}

function RecordsPageInner({ records, totalCount }: RecordsPageClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

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

  // Filter state
  const [filterDistributor, setFilterDistributor] = useState(searchParams.get("distributor") || "");
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") || "");
  const [filterContract, setFilterContract] = useState("");
  const [filterPlan, setFilterPlan] = useState("");
  const [filterEndUser, setFilterEndUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchText, setSearchText] = useState("");

  // Aggregate filter object for cascading computation
  const filters = useMemo(
    () => ({
      distributor: filterDistributor,
      contract: filterContract,
      plan: filterPlan,
      endUser: filterEndUser,
      status: filterStatus,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
    }),
    [filterDistributor, filterContract, filterPlan, filterEndUser, filterStatus, filterDateFrom, filterDateTo]
  );

  const hasFilters = filterDistributor || filterStatus || filterContract || filterPlan || filterEndUser || filterDateFrom || filterDateTo || searchText;

  // Cascading: available options for each dropdown = unique values from records filtered by everything EXCEPT that dropdown
  const availableDistributors = useMemo(
    () => unique(filterExcluding(records, filters, "distributor", searchText).map((r) => r.distributor)),
    [records, filters, searchText]
  );
  const availableContracts = useMemo(
    () => unique(filterExcluding(records, filters, "contract", searchText).map((r) => r.contractNumber)),
    [records, filters, searchText]
  );
  const availablePlans = useMemo(
    () => unique(filterExcluding(records, filters, "plan", searchText).map((r) => r.planCode)),
    [records, filters, searchText]
  );
  const availableEndUsers = useMemo(
    () => unique(filterExcluding(records, filters, "endUser", searchText).map((r) => r.endUser)),
    [records, filters, searchText]
  );
  const availableStatuses = useMemo(
    () => unique(filterExcluding(records, filters, "status", searchText).map((r) => r.status)),
    [records, filters, searchText]
  );

  // Auto-clear stale selections synchronously during render
  if (filterContract && !availableContracts.includes(filterContract)) {
    setFilterContract("");
  }
  if (filterPlan && !availablePlans.includes(filterPlan)) {
    setFilterPlan("");
  }
  if (filterEndUser && !availableEndUsers.includes(filterEndUser)) {
    setFilterEndUser("");
  }
  if (filterStatus && !availableStatuses.includes(filterStatus)) {
    setFilterStatus("");
  }

  // Final filtered records (all filters applied)
  const filteredRecords = useMemo(() => {
    return filterExcluding(records, filters, "", searchText);
  }, [records, filters, searchText]);

  const clearFilters = useCallback(() => {
    setFilterDistributor("");
    setFilterStatus("");
    setFilterContract("");
    setFilterPlan("");
    setFilterEndUser("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSearchText("");
    router.replace("/records", { scroll: false });
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
  const distributorOptions = availableDistributors.map((d) => ({ value: d, label: d }));
  const contractOptions = availableContracts.map((c) => ({ value: c, label: c }));
  const planOptions = availablePlans.map((p) => ({ value: p, label: p }));
  const endUserOptions = availableEndUsers.map((u) => ({ value: u, label: u }));
  const statusOptions = availableStatuses.map((s) => ({
    value: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
  }));

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brennan-text">Rebate Records</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {hasFilters
              ? `${filteredRecords.length} of ${totalCount} records`
              : `${totalCount} records`}
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
            onChange={setFilterDistributor}
            placeholder="All Distributors"
            className="w-36"
          />
          <SearchableSelect
            options={contractOptions}
            value={filterContract}
            onChange={setFilterContract}
            placeholder="All Contracts"
            className="w-36"
          />
          <SearchableSelect
            options={planOptions}
            value={filterPlan}
            onChange={setFilterPlan}
            placeholder="All Plans"
            className="w-32"
          />
          <SearchableSelect
            options={endUserOptions}
            value={filterEndUser}
            onChange={setFilterEndUser}
            placeholder="All End Users"
            className="w-40"
          />
          <SearchableSelect
            options={statusOptions}
            value={filterStatus}
            onChange={setFilterStatus}
            placeholder="All Statuses"
            className="w-32"
          />

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
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search..."
            className="h-8 min-w-[160px] flex-1 rounded border border-brennan-border px-2 text-xs focus:border-brennan-blue focus:outline-none"
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
            {filteredRecords.map((r) => (
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
            {filteredRecords.length === 0 && (
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

// Wrap with Suspense for useSearchParams
export function RecordsPageClient(props: RecordsPageClientProps) {
  return (
    <Suspense>
      <RecordsPageInner {...props} />
    </Suspense>
  );
}
