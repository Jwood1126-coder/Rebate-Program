"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Warning {
  field: string;
  message: string;
  code: string;
}

interface SupersedeModalProps {
  open: boolean;
  onClose: () => void;
  record: {
    id: number;
    distributor: string;
    contractNumber: string;
    planCode: string;
    endUser: string;
    itemNumber: string;
    rebatePrice: string;
    startDate: string;
    endDate: string;
  };
}

/**
 * Guided supersede workflow: creates a replacement record and end-dates the original.
 * Pre-fills from the old record so the user only adjusts what changed (usually price).
 */
export function SupersedeModal({ open, onClose, record }: SupersedeModalProps) {
  const router = useRouter();

  const todayStr = new Date().toISOString().split("T")[0];

  const [newPrice, setNewPrice] = useState(record.rebatePrice);
  const [newStartDate, setNewStartDate] = useState(todayStr);
  const [newEndDate, setNewEndDate] = useState(record.endDate || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ field: string; message: string }[]>([]);
  const [pendingWarnings, setPendingWarnings] = useState<Warning[]>([]);

  if (!open) return null;

  async function submitSupersede(confirmWarnings: boolean) {
    setLoading(true);
    setError(null);
    setValidationErrors([]);

    try {
      const res = await fetch(`/api/records/${record.id}/supersede`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rebatePrice: newPrice,
          startDate: newStartDate,
          endDate: newEndDate || null,
          ...(confirmWarnings ? { confirmWarnings: true } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.issues) {
          setValidationErrors(data.issues.map((i: { field: string; message: string }) => ({
            field: i.field,
            message: i.message,
          })));
          if (data.warnings?.length > 0) {
            setPendingWarnings(data.warnings);
          }
        } else {
          setError(data.error || "Failed to supersede record");
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

  const showWarningConfirmation = pendingWarnings.length > 0 && validationErrors.length === 0;

  const inputCls = "w-full rounded-lg border border-brennan-border px-3 py-2 text-sm text-brennan-text focus:border-brennan-blue focus:outline-none focus:ring-1 focus:ring-brennan-blue";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brennan-border px-5 py-3.5">
          <h2 className="text-base font-bold text-brennan-text">Supersede Record</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-brennan-light hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Context: what record is being superseded */}
          <div className="rounded-lg bg-brennan-light/60 px-3 py-2">
            <p className="text-xs font-medium text-gray-500 mb-1">Replacing Record #{record.id}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 font-bold text-brennan-blue">{record.distributor}</span>
              <span>{record.contractNumber}</span>
              <span className="text-gray-400">/</span>
              <span>{record.planCode}</span>
              <span className="text-gray-400">/</span>
              <span className="font-mono">{record.itemNumber}</span>
              <span className="text-gray-400">@</span>
              <span className="font-medium">${record.rebatePrice}</span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Old record will be end-dated to the day before the new start date.
            </p>
          </div>

          {/* Errors */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm font-medium text-red-700">Please fix:</p>
              <ul className="mt-1 list-inside list-disc text-sm text-red-600">
                {validationErrors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {showWarningConfirmation && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm font-medium text-amber-700">Review before saving:</p>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-600">
                {pendingWarnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => submitSupersede(true)}
                  disabled={loading}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Supersede Anyway"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingWarnings([])}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50"
                >
                  Go Back
                </button>
              </div>
            </div>
          )}

          {/* New record fields */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              New Rebate Price ($) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className={inputCls}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                New Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                New End Date <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
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
              type="button"
              disabled={loading}
              onClick={() => submitSupersede(false)}
              className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brennan-dark disabled:opacity-50"
            >
              {loading ? "Saving..." : "Supersede Record"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
