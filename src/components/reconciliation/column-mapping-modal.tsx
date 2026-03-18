"use client";

import { useState, useEffect, useCallback } from "react";

interface StandardFieldInfo {
  label: string;
  required: boolean;
  group: string;
}

interface MappingDetection {
  distributorId: number;
  distributorCode: string;
  distributorName: string;
  headers: string[];
  suggestedMappings: Record<string, string>;
  sampleData: Record<string, string[]>;
  standardFields: Record<string, StandardFieldInfo>;
  totalRows: number;
  fileType?: string; // "claim" or "pos"
}

interface Props {
  detection: MappingDetection;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ColumnMappingModal({ detection, onSaved, onCancel }: Props) {
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>(
    detection.suggestedMappings || {}
  );
  const [dateFormat, setDateFormat] = useState<string>("M/d/yyyy");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileType = detection.fileType || "claim";
  const fileTypeLabel = fileType === "pos" ? "POS Report" : "Claim File";
  const mappingName = `${detection.distributorName} ${fileTypeLabel}`;

  // Escape key handler
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onCancel();
    },
    [onCancel, saving]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  const standardFields = Object.keys(detection.standardFields).length > 0
    ? detection.standardFields
    : DEFAULT_STANDARD_FIELDS;

  const requiredFields = Object.entries(standardFields)
    .filter(([, info]) => info.required)
    .map(([key]) => key);
  const mappedRequiredCount = requiredFields.filter((f) => fieldMappings[f]).length;
  const allRequiredMapped = mappedRequiredCount >= requiredFields.length;

  function handleFieldChange(standardField: string, columnHeader: string) {
    setFieldMappings((prev) => {
      const next = { ...prev };
      if (columnHeader === "") {
        delete next[standardField];
      } else {
        next[standardField] = columnHeader;
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/distributors/${detection.distributorId}/mappings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileType,
            name: mappingName,
            mappings: fieldMappings,
            dateFormat,
            sampleHeaders: detection.headers,
          }),
        }
      );

      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save mapping");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function getUnmappedHeaders(): string[] {
    const mappedColumns = new Set(Object.values(fieldMappings));
    return detection.headers.filter((h) => !mappedColumns.has(h));
  }

  function renderFieldRows(group: string) {
    const fields = Object.entries(standardFields).filter(
      ([, info]) => info.group === group
    );

    return fields.map(([fieldName, info]) => {
      const selectedColumn = fieldMappings[fieldName] || "";
      const sampleValues =
        selectedColumn && detection.sampleData?.[selectedColumn];

      return (
        <tr key={fieldName} className="hover:bg-gray-50/50">
          <td className="px-3 py-2">
            <span
              className={`font-medium ${
                info.required ? "text-gray-900" : "text-gray-600"
              }`}
            >
              {info.label}
              {info.required && (
                <span className="text-red-500 ml-0.5">*</span>
              )}
            </span>
          </td>
          <td className="px-3 py-2">
            <select
              value={selectedColumn}
              onChange={(e) => handleFieldChange(fieldName, e.target.value)}
              className={`w-full rounded border px-2 py-1 text-xs focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue ${
                selectedColumn
                  ? "border-green-300 bg-green-50"
                  : info.required
                    ? "border-red-200 bg-red-50/30"
                    : "border-gray-300"
              }`}
            >
              <option value="">&mdash; not mapped &mdash;</option>
              {detection.headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </td>
          <td className="px-3 py-2 text-gray-400 font-mono truncate max-w-[200px]">
            {sampleValues && sampleValues.length > 0
              ? sampleValues.join(", ")
              : selectedColumn
                ? "\u2014"
                : ""}
          </td>
        </tr>
      );
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mapping-modal-title"
    >
      <div className="w-full max-w-3xl mx-4 mb-12 rounded-xl border border-brennan-border bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-brennan-border px-5 py-4">
          <h2
            id="mapping-modal-title"
            className="text-lg font-semibold text-brennan-text"
          >
            Configure Column Mapping
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-medium text-brennan-blue">
              {detection.distributorCode}
            </span>{" "}
            doesn&apos;t have a {fileType === "pos" ? "POS report" : "claim file"} mapping yet. Map the columns below so
            the system knows how to read their files. This only needs to be done
            once.
          </p>
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span>
              {detection.headers.length} columns detected
            </span>
            <span>{detection.totalRows} data rows</span>
            <span
              className={
                allRequiredMapped ? "text-green-600 font-medium" : "text-amber-600 font-medium"
              }
            >
              {mappedRequiredCount}/{requiredFields.length} required fields mapped
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Date format */}
          <div className="flex items-center gap-4">
            <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
              Date Format
            </label>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
            >
              <option value="M/d/yyyy">M/d/yyyy (1/15/2026)</option>
              <option value="MM/dd/yyyy">MM/dd/yyyy (01/15/2026)</option>
              <option value="yyyy-MM-dd">yyyy-MM-dd (2026-01-15)</option>
              <option value="M/d/yy">M/d/yy (1/15/26)</option>
              <option value="dd/MM/yyyy">dd/MM/yyyy (15/01/2026)</option>
            </select>
          </div>

          {/* Mapping grid */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2 w-1/3">System Field</th>
                  <th className="px-3 py-2 w-1/3">Maps To Column</th>
                  <th className="px-3 py-2 w-1/3">Sample Values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-1.5 bg-red-50 text-xs font-semibold text-red-700 uppercase tracking-wider"
                  >
                    Required Fields
                  </td>
                </tr>
                {renderFieldRows("Required")}
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-1.5 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wider"
                  >
                    Recommended Fields
                  </td>
                </tr>
                {renderFieldRows("Recommended")}
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                  >
                    Optional Fields
                  </td>
                </tr>
                {renderFieldRows("Optional")}
              </tbody>
            </table>
          </div>

          {/* Unmapped columns */}
          {getUnmappedHeaders().length > 0 && (
            <div className="text-xs text-gray-500">
              <span className="font-medium">Unmapped columns from file:</span>{" "}
              {getUnmappedHeaders().join(", ")}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-brennan-border px-5 py-3 flex items-center justify-between">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !allRequiredMapped}
            className="rounded-lg bg-brennan-blue px-5 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Mapping & Continue Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_STANDARD_FIELDS: Record<string, StandardFieldInfo> = {
  contractNumber: { label: "Contract Number", required: true, group: "Required" },
  itemNumber: { label: "Item / Part Number", required: true, group: "Required" },
  transactionDate: { label: "Transaction / Ship Date", required: true, group: "Required" },
  deviatedPrice: { label: "Deviated (Contract) Price", required: true, group: "Required" },
  quantity: { label: "Quantity", required: true, group: "Required" },
  claimedAmount: { label: "Claimed Rebate Amount", required: false, group: "Recommended" },
  standardPrice: { label: "Standard / List Price", required: false, group: "Recommended" },
  endUserCode: { label: "End User Code", required: false, group: "Recommended" },
  endUserName: { label: "End User Name", required: false, group: "Recommended" },
  planCode: { label: "Plan Code", required: false, group: "Optional" },
  distributorItemNumber: { label: "Distributor Item Number", required: false, group: "Optional" },
  distributorOrderNumber: { label: "Order / PO Number", required: false, group: "Optional" },
  itemDescription: { label: "Item Description", required: false, group: "Optional" },
  vendorName: { label: "Vendor Name", required: false, group: "Optional" },
};
