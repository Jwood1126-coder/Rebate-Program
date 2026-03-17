"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface Plan {
  id: number;
  planCode: string;
  planName: string;
  contract: {
    contractNumber: string;
    distributor: { code: string; name: string };
    endUser: { name: string };
  };
}

interface Item {
  id: number;
  itemNumber: string;
  description: string | null;
}

interface RecordData {
  id?: number;
  rebatePlanId: number;
  itemId: number;
  rebatePrice: string;
  startDate: string;
  endDate: string;
  status?: string;
}

interface Warning {
  field: string;
  message: string;
  code: string;
}

interface RecordModalProps {
  open: boolean;
  onClose: () => void;
  record?: RecordData | null;
}

export function RecordModal({ open, onClose, record }: RecordModalProps) {
  const router = useRouter();
  const isEdit = !!record?.id;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    { field: string; message: string }[]
  >([]);
  const [pendingWarnings, setPendingWarnings] = useState<Warning[]>([]);

  const [formData, setFormData] = useState<RecordData>({
    rebatePlanId: 0,
    itemId: 0,
    rebatePrice: "",
    startDate: "",
    endDate: "",
  });

  // Derive selected plan context
  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === formData.rebatePlanId),
    [plans, formData.rebatePlanId]
  );

  useEffect(() => {
    if (open) {
      fetchOptions();
      if (record) {
        setFormData({
          ...record,
          startDate: record.startDate
            ? new Date(record.startDate).toISOString().split("T")[0]
            : "",
          endDate: record.endDate
            ? new Date(record.endDate).toISOString().split("T")[0]
            : "",
        });
      } else {
        setFormData({
          rebatePlanId: 0,
          itemId: 0,
          rebatePrice: "",
          startDate: "",
          endDate: "",
        });
      }
      setError(null);
      setValidationErrors([]);
      setPendingWarnings([]);
    }
  }, [open, record]);

  async function fetchOptions() {
    const [plansRes, itemsRes] = await Promise.all([
      fetch("/api/plans"),
      fetch("/api/items"),
    ]);
    if (plansRes.ok) setPlans(await plansRes.json());
    if (itemsRes.ok) setItems(await itemsRes.json());
  }

  function buildPayload(confirmWarnings: boolean) {
    return {
      rebatePlanId: Number(formData.rebatePlanId),
      itemId: Number(formData.itemId),
      rebatePrice: formData.rebatePrice,
      startDate: formData.startDate,
      endDate: formData.endDate || null,
      ...(confirmWarnings ? { confirmWarnings: true } : {}),
    };
  }

  async function submitToApi(confirmWarnings: boolean) {
    const url = isEdit ? `/api/records/${record!.id}` : "/api/records";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(confirmWarnings)),
    });

    const data = await res.json();
    return { ok: res.ok, data };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setValidationErrors([]);
    setPendingWarnings([]);

    try {
      const { ok, data } = await submitToApi(false);

      if (!ok) {
        if (data.issues) {
          setValidationErrors(
            data.issues.map((i: { field: string; message: string }) => ({
              field: i.field,
              message: i.message,
            }))
          );
          if (data.warnings?.length > 0) {
            setPendingWarnings(data.warnings);
          }
        } else {
          setError(data.error || "Failed to save record");
        }
        return;
      }

      if (data.needsConfirmation && data.warnings?.length > 0) {
        setPendingWarnings(data.warnings);
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmWarnings() {
    setLoading(true);
    setError(null);

    try {
      const { ok, data } = await submitToApi(true);

      if (!ok) {
        if (data.issues) {
          setValidationErrors(
            data.issues.map((i: { field: string; message: string }) => ({
              field: i.field,
              message: i.message,
            }))
          );
        } else {
          setError(data.error || "Failed to save record");
        }
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const showWarningConfirmation = pendingWarnings.length > 0 && validationErrors.length === 0;

  const inputClasses = "w-full rounded-lg border border-brennan-border px-3 py-2 text-sm text-brennan-text focus:border-brennan-blue focus:outline-none focus:ring-1 focus:ring-brennan-blue";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brennan-border px-5 py-3.5">
          <h2 className="text-base font-bold text-brennan-text">
            {isEdit ? "Edit Rebate Record" : "New Rebate Record"}
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

        <div className="px-5 py-4">
          {/* Error messages */}
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm font-medium text-red-700">Please fix:</p>
              <ul className="mt-1 list-inside list-disc text-sm text-red-600">
                {validationErrors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {showWarningConfirmation && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm font-medium text-amber-700">Review before saving:</p>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-600">
                {pendingWarnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmWarnings}
                  disabled={loading}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save Anyway"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingWarnings([])}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50"
                >
                  Go Back and Edit
                </button>
              </div>
            </div>
          )}

          {pendingWarnings.length > 0 && validationErrors.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm font-medium text-amber-700">Warnings:</p>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-600">
                {pendingWarnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Rebate Plan */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Rebate Plan <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={plans.map((p) => ({
                  value: String(p.id),
                  label: `${p.contract.distributor.code} / ${p.contract.contractNumber} / ${p.planCode}${p.planName ? ` — ${p.planName}` : ""}`,
                }))}
                value={formData.rebatePlanId ? String(formData.rebatePlanId) : ""}
                onChange={(v) =>
                  setFormData({ ...formData, rebatePlanId: v ? Number(v) : 0 })
                }
                placeholder="Select a plan..."
                disabled={isEdit}
              />
            </div>

            {/* Selected plan context card */}
            {selectedPlan && !isEdit && (
              <div className="rounded-lg bg-brennan-light/60 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 font-bold text-brennan-blue">
                    {selectedPlan.contract.distributor.code}
                  </span>
                  <span>{selectedPlan.contract.distributor.name}</span>
                  <span className="text-gray-400">&middot;</span>
                  <span>Contract {selectedPlan.contract.contractNumber}</span>
                  <span className="text-gray-400">&middot;</span>
                  <span>{selectedPlan.contract.endUser.name}</span>
                </div>
              </div>
            )}

            {/* Item */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Item <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={items.map((item) => ({
                  value: String(item.id),
                  label: `${item.itemNumber}${item.description ? ` — ${item.description}` : ""}`,
                }))}
                value={formData.itemId ? String(formData.itemId) : ""}
                onChange={(v) =>
                  setFormData({ ...formData, itemId: v ? Number(v) : 0 })
                }
                placeholder="Select an item..."
                disabled={isEdit}
              />
            </div>

            {/* Rebate Price */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Rebate Price ($) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={formData.rebatePrice}
                onChange={(e) =>
                  setFormData({ ...formData, rebatePrice: e.target.value })
                }
                className={inputClasses}
                placeholder="0.00"
                required
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                  className={inputClasses}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  End Date <span className="text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData({ ...formData, endDate: e.target.value })
                  }
                  className={inputClasses}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-brennan-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-brennan-border bg-white px-4 py-2 text-sm font-medium text-brennan-text transition-colors hover:bg-brennan-light"
          >
            Cancel
          </button>
          {!showWarningConfirmation && (
            <button
              type="submit"
              disabled={loading}
              onClick={handleSubmit}
              className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brennan-dark disabled:opacity-50"
            >
              {loading
                ? "Saving..."
                : isEdit
                ? "Save Changes"
                : "Create Record"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
