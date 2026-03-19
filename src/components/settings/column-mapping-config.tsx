"use client";

import { useState, useRef } from "react";

interface Distributor {
  id: number;
  code: string;
  name: string;
}

interface StandardFieldInfo {
  label: string;
  required: boolean;
  group: string;
}

interface ExistingMapping {
  id: number;
  distributorId: number;
  fileType: string;
  name: string;
  mappings: Record<string, string>;
  dateFormat: string;
  sampleHeaders: string[] | null;
  isActive: boolean;
  distributor: { id: number; code: string; name: string };
}

interface DetectionResult {
  headers: string[];
  suggestedMappings: Record<string, string>;
  sampleData: Record<string, string[]>;
  standardFields: Record<string, StandardFieldInfo>;
  totalRows: number;
}

export default function ColumnMappingConfig({
  distributors,
  existingMappings,
}: {
  distributors: Distributor[];
  existingMappings: ExistingMapping[];
}) {
  const [selectedDistributorId, setSelectedDistributorId] = useState<string>("");
  const [fileType, setFileType] = useState<string>("claim");
  const [mappingName, setMappingName] = useState<string>("");
  const [dateFormat, setDateFormat] = useState<string>("M/d/yyyy");

  // Detection state
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mapping state: standard field → selected column header
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  // Editing existing mapping
  const [editingId, setEditingId] = useState<number | null>(null);

  const selectedDistributor = distributors.find(d => d.id === Number(selectedDistributorId));

  // Check if this distributor+fileType already has a mapping
  const existingForSelection = existingMappings.find(
    m => m.distributorId === Number(selectedDistributorId) && m.fileType === fileType
  );

  async function handleDetectHeaders() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setDetecting(true);
    setDetectionError(null);
    setDetection(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/column-mappings/detect-headers", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        setDetection(data);
        // Pre-fill with suggested mappings
        setFieldMappings(data.suggestedMappings || {});
        // Auto-generate name if empty
        if (!mappingName && selectedDistributor) {
          setMappingName(`${selectedDistributor.name} ${fileType === 'claim' ? 'Claim' : fileType === 'pos' ? 'POS' : 'Contract'} File`);
        }
      } else {
        setDetectionError(data.error || "Failed to detect headers");
      }
    } catch {
      setDetectionError("Network error");
    } finally {
      setDetecting(false);
    }
  }

  function handleFieldChange(standardField: string, columnHeader: string) {
    setFieldMappings(prev => {
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
    if (!selectedDistributorId || !mappingName) return;

    setSaving(true);
    setSaveResult(null);

    try {
      const res = await fetch(`/api/distributors/${selectedDistributorId}/mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileType,
          name: mappingName,
          mappings: fieldMappings,
          dateFormat,
          sampleHeaders: detection?.headers || null,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setSaveResult({ success: true, message: `Mapping saved for ${selectedDistributor?.code || "distributor"}` });
        // Reload page to refresh existing mappings
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setSaveResult({ success: false, message: data.error || "Failed to save" });
      }
    } catch {
      setSaveResult({ success: false, message: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  function handleEditExisting(mapping: ExistingMapping) {
    setEditingId(mapping.id);
    setSelectedDistributorId(String(mapping.distributorId));
    setFileType(mapping.fileType);
    setMappingName(mapping.name);
    setDateFormat(mapping.dateFormat);
    setFieldMappings(mapping.mappings as Record<string, string>);

    // Create a fake detection result from stored data
    if (mapping.sampleHeaders) {
      setDetection({
        headers: mapping.sampleHeaders as string[],
        suggestedMappings: mapping.mappings as Record<string, string>,
        sampleData: {},
        standardFields: {},
        totalRows: 0,
      });
    }
  }

  function handleReset() {
    setEditingId(null);
    setSelectedDistributorId("");
    setFileType("claim");
    setMappingName("");
    setDateFormat("M/d/yyyy");
    setFieldMappings({});
    setDetection(null);
    setDetectionError(null);
    setSaveResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Count mapped required fields
  const requiredFields = detection
    ? Object.entries(detection.standardFields).filter(([, info]) => info.required).map(([key]) => key)
    : ["contractNumber", "itemNumber", "transactionDate", "deviatedPrice", "quantity"];
  const mappedRequiredCount = requiredFields.filter(f => fieldMappings[f]).length;

  return (
    <div className="space-y-6">
      {/* Existing mappings table */}
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
        <div className="border-b border-brennan-border px-5 py-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-brennan-text">Configured Mappings</h2>
          <span className="text-xs text-gray-500">{existingMappings.length} mapping{existingMappings.length !== 1 ? "s" : ""}</span>
        </div>

        {existingMappings.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-500">No column mappings configured yet.</p>
            <p className="mt-1 text-xs text-gray-400">Upload a sample file below to set up a mapping for a distributor.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brennan-border bg-gray-50/50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2">Distributor</th>
                  <th className="px-4 py-2">File Type</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Mapped Fields</th>
                  <th className="px-4 py-2">Date Format</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {existingMappings.map((m) => {
                  const mappedCount = Object.keys(m.mappings as Record<string, string>).length;
                  return (
                    <tr key={m.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2">
                        <span className="font-medium">{m.distributor.code}</span>
                        <span className="ml-1 text-xs text-gray-400">{m.distributor.name}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {m.fileType}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{m.name}</td>
                      <td className="px-4 py-2 text-gray-600">{mappedCount} fields</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{m.dateFormat}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleEditExisting(m)}
                          className="text-xs text-brennan-blue hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Configure new mapping */}
      <div className="rounded-xl border border-brennan-border bg-white shadow-sm">
        <div className="border-b border-brennan-border px-5 py-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-brennan-text">
            {editingId ? "Edit Mapping" : "Configure New Mapping"}
          </h2>
          {editingId && (
            <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600">
              Cancel Edit
            </button>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Step 1: Select distributor and file type */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Distributor</label>
              <select
                value={selectedDistributorId}
                onChange={(e) => {
                  setSelectedDistributorId(e.target.value);
                  setDetection(null);
                  setFieldMappings({});
                  setMappingName("");
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
              >
                <option value="">Select distributor...</option>
                {distributors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">File Type</label>
              <select
                value={fileType}
                onChange={(e) => setFileType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
              >
                <option value="claim">Claim File</option>
                <option value="contract">Contract File</option>
                <option value="pos">POS Report</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date Format</label>
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
              >
                <option value="M/d/yyyy">M/d/yyyy (1/15/2026)</option>
                <option value="MM/dd/yyyy">MM/dd/yyyy (01/15/2026)</option>
                <option value="yyyy-MM-dd">yyyy-MM-dd (2026-01-15)</option>
                <option value="M/d/yy">M/d/yy (1/15/26)</option>
                <option value="dd/MM/yyyy">dd/MM/yyyy (15/01/2026)</option>
              </select>
            </div>
          </div>

          {existingForSelection && !editingId && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              This distributor already has a <strong>{fileType}</strong> mapping configured
              (&ldquo;{existingForSelection.name}&rdquo;). Saving will overwrite it.
            </div>
          )}

          {/* Step 2: Upload sample file */}
          {selectedDistributorId && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Upload Sample File to Detect Columns
              </label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv,.xls"
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brennan-light file:px-4 file:py-2 file:text-sm file:font-medium file:text-brennan-blue hover:file:bg-brennan-light/80"
                />
                <button
                  onClick={handleDetectHeaders}
                  disabled={detecting}
                  className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90 disabled:opacity-50 whitespace-nowrap"
                >
                  {detecting ? "Detecting..." : "Detect Columns"}
                </button>
              </div>
              {detectionError && (
                <p className="mt-1 text-xs text-red-600">{detectionError}</p>
              )}
            </div>
          )}

          {/* Step 3: Map columns */}
          {detection && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">
                    Column Mapping — {detection.headers.length} columns detected
                    {detection.totalRows > 0 && ` (${detection.totalRows} data rows)`}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Map each system field to the corresponding column in the distributor&apos;s file.
                    Required fields are marked with *.
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  {mappedRequiredCount}/{requiredFields.length} required mapped
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mapping Name</label>
                <input
                  type="text"
                  value={mappingName}
                  onChange={(e) => setMappingName(e.target.value)}
                  placeholder="e.g., Fastenal Claim File"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue"
                />
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
                    {/* Group: Required */}
                    <tr>
                      <td colSpan={3} className="px-3 py-1.5 bg-red-50 text-xs font-semibold text-red-700 uppercase tracking-wider">
                        Required Fields
                      </td>
                    </tr>
                    {renderFieldRows("Required")}

                    {/* Group: Recommended */}
                    <tr>
                      <td colSpan={3} className="px-3 py-1.5 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wider">
                        Recommended Fields
                      </td>
                    </tr>
                    {renderFieldRows("Recommended")}

                    {/* Group: Optional */}
                    <tr>
                      <td colSpan={3} className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Optional Fields
                      </td>
                    </tr>
                    {renderFieldRows("Optional")}
                  </tbody>
                </table>
              </div>

              {/* Unmapped columns from the file */}
              {getUnmappedHeaders().length > 0 && (
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Unmapped columns from file:</span>{" "}
                  {getUnmappedHeaders().join(", ")}
                </div>
              )}
            </div>
          )}

          {/* Save result */}
          {saveResult && (
            <div className={`rounded-lg border p-3 text-sm ${saveResult.success ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
              {saveResult.message}
            </div>
          )}

          {/* Actions */}
          {detection && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <button
                onClick={handleReset}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !mappingName || mappedRequiredCount < requiredFields.length}
                className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : editingId ? "Update Mapping" : "Save Mapping"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function renderFieldRows(group: string) {
    const standardFields = detection?.standardFields || getDefaultStandardFields();
    const fields = Object.entries(standardFields).filter(([, info]) => info.group === group);

    return fields.map(([fieldName, info]) => {
      const selectedColumn = fieldMappings[fieldName] || "";
      const sampleValues = selectedColumn && detection?.sampleData?.[selectedColumn];

      return (
        <tr key={fieldName} className="hover:bg-gray-50/50">
          <td className="px-3 py-2">
            <span className={`font-medium ${info.required ? "text-gray-900" : "text-gray-600"}`}>
              {info.label}
              {info.required && <span className="text-red-500 ml-0.5">*</span>}
            </span>
          </td>
          <td className="px-3 py-2">
            <select
              value={selectedColumn}
              onChange={(e) => handleFieldChange(fieldName, e.target.value)}
              className={`w-full rounded border px-2 py-1 text-xs focus:border-brennan-blue focus:ring-1 focus:ring-brennan-blue ${
                selectedColumn ? "border-green-300 bg-green-50" : info.required ? "border-red-200 bg-red-50/30" : "border-gray-300"
              }`}
            >
              <option value="">— not mapped —</option>
              {(detection?.headers || []).map((header) => (
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
                ? "—"
                : ""}
          </td>
        </tr>
      );
    });
  }

  function getUnmappedHeaders(): string[] {
    if (!detection) return [];
    const mappedColumns = new Set(Object.values(fieldMappings));
    return detection.headers.filter(h => !mappedColumns.has(h));
  }

  function getDefaultStandardFields(): Record<string, StandardFieldInfo> {
    return {
      contractNumber:         { label: "Contract Number",           required: true,  group: "Required" },
      itemNumber:             { label: "Item / Part Number",        required: true,  group: "Required" },
      transactionDate:        { label: "Transaction / Ship Date",   required: true,  group: "Required" },
      deviatedPrice:          { label: "Open Net Price",             required: true,  group: "Required" },
      quantity:               { label: "Quantity",                   required: true,  group: "Required" },
      claimedAmount:          { label: "Claimed Rebate Amount",     required: false, group: "Recommended" },
      standardPrice:          { label: "Standard / List Price",     required: false, group: "Recommended" },
      endUserCode:            { label: "End User Code",             required: false, group: "Recommended" },
      endUserName:            { label: "End User Name",             required: false, group: "Recommended" },
      planCode:               { label: "Plan Code",                 required: false, group: "Optional" },
      distributorItemNumber:  { label: "Distributor Item Number",   required: false, group: "Optional" },
      distributorOrderNumber: { label: "Order / PO Number",         required: false, group: "Optional" },
      itemDescription:        { label: "Item Description",          required: false, group: "Optional" },
      vendorName:             { label: "Vendor Name",               required: false, group: "Optional" },
    };
  }
}
