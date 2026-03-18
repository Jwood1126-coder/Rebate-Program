"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DqData {
  summary: {
    totalRecords: number;
    totalContracts: number;
    totalItems: number;
    openEndedRecords: number;
    expiredNotSuperseded: number;
    orphanedItems: number;
    issueCount: number;
    scanTimestamp: string;
  };
  duplicates: {
    planCode: string;
    distributor: string;
    contractNumber: string;
    itemNumber: string;
    startDate: string;
    count: number;
    recordIds: number[];
  }[];
  overlaps: {
    planCode: string;
    distributor: string;
    contractNumber: string;
    itemNumber: string;
    recordA: { id: number; start: string; end: string | null; price: number };
    recordB: { id: number; start: string; end: string | null; price: number };
  }[];
  priceAnomalies: {
    itemNumber: string;
    minPrice: number;
    maxPrice: number;
    variancePct: number;
    minContext: string;
    maxContext: string;
    recordCount: number;
  }[];
  contractOverlaps: {
    distributor: string;
    endUser: string;
    contractA: { id: number; number: string; start: string; end: string | null };
    contractB: { id: number; number: string; start: string; end: string | null };
  }[];
  orphanedItems: { id: number; itemNumber: string }[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return "open-ended";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Compute the overlap window between two date ranges */
function getOverlapWindow(
  aStart: string, aEnd: string | null,
  bStart: string, bEnd: string | null
): { start: string; end: string | null; days: number } {
  const start = new Date(aStart) > new Date(bStart) ? aStart : bStart;
  const aEndMs = aEnd ? new Date(aEnd).getTime() : Infinity;
  const bEndMs = bEnd ? new Date(bEnd).getTime() : Infinity;
  const endMs = Math.min(aEndMs, bEndMs);
  const end = endMs === Infinity ? null : new Date(endMs).toISOString();
  const startMs = new Date(start).getTime();
  const days = endMs === Infinity ? -1 : Math.max(1, Math.round((endMs - startMs) / 86400000));
  return { start, end, days };
}

export default function DataQualityPage() {
  const [data, setData] = useState<DqData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/data-quality");
      if (!res.ok) throw new Error("Failed to run scan");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runScan(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brennan-blue border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500">Scanning data for quality issues...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto py-10 text-center">
        <p className="text-red-600 font-medium">Error: {error}</p>
        <button onClick={runScan} className="mt-3 text-sm text-brennan-blue hover:underline">Retry</button>
      </div>
    );
  }

  const { summary, duplicates, overlaps, priceAnomalies, contractOverlaps, orphanedItems } = data;
  const hasIssues = summary.issueCount > 0;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brennan-text">Data Quality</h1>
          <p className="text-sm text-gray-500">
            Scanned {summary.totalRecords} records, {summary.totalContracts} contracts, {summary.totalItems} items
          </p>
        </div>
        <button
          onClick={runScan}
          className="rounded-lg border border-brennan-border px-4 py-2 text-sm font-medium text-brennan-text hover:bg-brennan-light transition-colors"
        >
          Re-scan
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard
          label="Duplicates"
          count={duplicates.length}
          severity={duplicates.length > 0 ? "error" : "ok"}
        />
        <SummaryCard
          label="Overlaps"
          count={overlaps.length}
          severity={overlaps.length > 0 ? "error" : "ok"}
        />
        <SummaryCard
          label="Price Anomalies"
          count={priceAnomalies.length}
          severity={priceAnomalies.length > 0 ? "warn" : "ok"}
        />
        <SummaryCard
          label="Contract Overlaps"
          count={contractOverlaps.length}
          severity={contractOverlaps.length > 0 ? "warn" : "ok"}
        />
        <SummaryCard
          label="Orphaned Items"
          count={orphanedItems.length}
          severity={orphanedItems.length > 5 ? "warn" : "info"}
        />
      </div>

      {/* Additional stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-brennan-border bg-white p-4">
          <p className="text-xs uppercase text-gray-500 font-medium">Open-ended records</p>
          <p className="text-lg font-bold text-brennan-text">{summary.openEndedRecords}</p>
          <p className="text-xs text-gray-400">No end date — may need review</p>
        </div>
        <div className="rounded-lg border border-brennan-border bg-white p-4">
          <p className="text-xs uppercase text-gray-500 font-medium">Expired (not superseded)</p>
          <p className="text-lg font-bold text-brennan-text">{summary.expiredNotSuperseded}</p>
          <p className="text-xs text-gray-400">Ended naturally — potential cleanup</p>
        </div>
        <div className="rounded-lg border border-brennan-border bg-white p-4">
          <p className="text-xs uppercase text-gray-500 font-medium">Orphaned items</p>
          <p className="text-lg font-bold text-brennan-text">{summary.orphanedItems}</p>
          <p className="text-xs text-gray-400">Items with no active records</p>
        </div>
      </div>

      {!hasIssues && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-4 text-center">
          <p className="text-sm font-medium text-green-800">No duplicate or overlap issues found.</p>
          <p className="text-xs text-green-600 mt-1">Your data looks clean. Run this scan again after importing legacy data.</p>
        </div>
      )}

      {/* Duplicates */}
      {duplicates.length > 0 && (
        <Section
          title="Duplicate Records"
          subtitle="Same plan + item + start date appearing more than once. Click a row to see details and fix."
          severity="error"
          count={duplicates.length}
        >
          <DuplicateList duplicates={duplicates} />
        </Section>
      )}

      {/* Overlapping date ranges */}
      {overlaps.length > 0 && (
        <Section
          title="Overlapping Date Ranges"
          subtitle="Same plan + item with date ranges that overlap — two prices in effect simultaneously. Click a row to see details."
          severity="error"
          count={overlaps.length}
        >
          <OverlapList overlaps={overlaps} />
        </Section>
      )}

      {/* Price anomalies */}
      {priceAnomalies.length > 0 && (
        <Section
          title="Price Anomalies"
          subtitle="Items with >50% price variance across contracts. Click a row to see details."
          severity="warn"
          count={priceAnomalies.length}
        >
          <PriceAnomalyList anomalies={priceAnomalies} />
        </Section>
      )}

      {/* Contract overlaps */}
      {contractOverlaps.length > 0 && (
        <Section
          title="Overlapping Contracts"
          subtitle="Same distributor + end user with overlapping contract date ranges. Click a row to see details."
          severity="warn"
          count={contractOverlaps.length}
        >
          <ContractOverlapList contractOverlaps={contractOverlaps} />
        </Section>
      )}

      {/* Orphaned items */}
      {orphanedItems.length > 0 && (
        <Section
          title="Orphaned Items"
          subtitle="Items with no active, future, or expired records. These may have been created during imports but never linked to a contract."
          severity="info"
          count={orphanedItems.length}
        >
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {orphanedItems.map((item) => (
              <span key={item.id} className="rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs text-gray-600">
                {item.itemNumber}
              </span>
            ))}
          </div>
        </Section>
      )}

      <p className="text-xs text-gray-400 text-center">
        <Link href="/" className="hover:underline">← Back to Dashboard</Link>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable overlap rows
// ---------------------------------------------------------------------------
function OverlapList({ overlaps }: { overlaps: DqData["overlaps"] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="divide-y divide-brennan-border">
      {overlaps.map((o, i) => {
        const isOpen = expanded.has(i);
        const priceDiff = Math.abs(o.recordB.price - o.recordA.price);
        const window = getOverlapWindow(o.recordA.start, o.recordA.end, o.recordB.start, o.recordB.end);
        const olderRecord = new Date(o.recordA.start) <= new Date(o.recordB.start) ? o.recordA : o.recordB;
        const newerRecord = olderRecord === o.recordA ? o.recordB : o.recordA;

        return (
          <div key={i}>
            {/* Summary row */}
            <button
              onClick={() => toggle(i)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-red-50/50 transition-colors ${isOpen ? "bg-red-50/30" : ""}`}
            >
              <svg
                className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <DistBadge code={o.distributor} />
              <span className="font-mono text-sm text-gray-900">{o.itemNumber}</span>
              <span className="text-xs text-gray-400">|</span>
              <span className="text-xs text-gray-500">Contract {o.contractNumber}</span>
              <span className="ml-auto flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">#{olderRecord.id}</span>
                  {" "}${olderRecord.price.toFixed(2)}
                  <span className="mx-1 text-gray-300">/</span>
                  <span className="font-medium text-gray-700">#{newerRecord.id}</span>
                  {" "}${newerRecord.price.toFixed(2)}
                </span>
                {priceDiff > 0 && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
                    ${priceDiff.toFixed(2)} diff
                  </span>
                )}
              </span>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="bg-gray-50/80 border-t border-gray-100 px-4 py-4 space-y-4">
                {/* Side-by-side comparison */}
                <div className="grid grid-cols-2 gap-4">
                  <RecordCard
                    label="Record A (older)"
                    record={olderRecord}
                    itemNumber={o.itemNumber}
                    distributor={o.distributor}
                    accent="blue"
                  />
                  <RecordCard
                    label="Record B (newer)"
                    record={newerRecord}
                    itemNumber={o.itemNumber}
                    distributor={o.distributor}
                    accent="amber"
                  />
                </div>

                {/* Overlap window */}
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-red-800">
                      Overlap: {fmtDate(window.start)} – {fmtDate(window.end)}
                    </span>
                    {window.days > 0 && (
                      <span className="text-red-600">({window.days} day{window.days !== 1 ? "s" : ""})</span>
                    )}
                    {window.days === -1 && (
                      <span className="text-red-600">(indefinite — no end date)</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-red-700">
                    During this period, both records claim to set the price for <span className="font-mono font-medium">{o.itemNumber}</span>.
                    {priceDiff > 0
                      ? ` The prices differ by $${priceDiff.toFixed(2)}.`
                      : " The prices are identical — likely a duplicate entry."
                    }
                  </p>
                </div>

                {/* Recommended action */}
                <div className="rounded-lg border border-brennan-border bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Recommended action</p>
                  {priceDiff > 0 ? (
                    <div className="space-y-1.5 text-xs text-gray-700">
                      <p>This looks like a <span className="font-medium">price change</span>. The newer record (#{ newerRecord.id}) likely replaces the older one.</p>
                      <p>
                        <span className="font-medium">To fix:</span> Open Record #{olderRecord.id} and either{" "}
                        <span className="font-medium">supersede</span> it (creates a proper chain) or{" "}
                        <span className="font-medium">set its end date</span> to {fmtDate(newerRecord.start)} so the ranges don&apos;t overlap.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-xs text-gray-700">
                      <p>Both records have the <span className="font-medium">same price</span> — this is likely a <span className="font-medium">duplicate</span>.</p>
                      <p>
                        <span className="font-medium">To fix:</span> Open Record #{newerRecord.id} and <span className="font-medium">cancel</span> it, keeping Record #{olderRecord.id} as the authoritative version.
                      </p>
                    </div>
                  )}
                  <Link
                    href={`/records?search=${encodeURIComponent(o.itemNumber)}&distributor=${encodeURIComponent(o.distributor)}`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brennan-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-brennan-blue/90 transition-colors"
                  >
                    View in Records
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecordCard({ label, record, itemNumber, distributor, accent }: {
  label: string;
  record: { id: number; start: string; end: string | null; price: number };
  itemNumber: string;
  distributor: string;
  accent: "blue" | "amber";
}) {
  const borderColor = accent === "blue" ? "border-l-brennan-blue" : "border-l-amber-400";
  return (
    <div className={`rounded-lg border border-gray-200 border-l-4 ${borderColor} bg-white px-4 py-3`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase text-gray-500">{label}</span>
        <Link
          href={`/records?search=${encodeURIComponent(itemNumber)}&distributor=${encodeURIComponent(distributor)}`}
          className="text-xs font-medium text-brennan-blue hover:underline"
        >
          #{record.id}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-y-1 text-xs">
        <span className="text-gray-500">Price</span>
        <span className="font-mono font-medium text-gray-900">${record.price.toFixed(2)}</span>
        <span className="text-gray-500">Start</span>
        <span className="text-gray-900">{fmtDate(record.start)}</span>
        <span className="text-gray-500">End</span>
        <span className="text-gray-900">{fmtDate(record.end)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable duplicate rows
// ---------------------------------------------------------------------------
function DuplicateList({ duplicates }: { duplicates: DqData["duplicates"] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="divide-y divide-brennan-border">
      {duplicates.map((d, i) => {
        const isOpen = expanded.has(i);
        return (
          <div key={i}>
            <button
              onClick={() => toggle(i)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-red-50/50 transition-colors ${isOpen ? "bg-red-50/30" : ""}`}
            >
              <svg
                className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <DistBadge code={d.distributor} />
              <span className="font-mono text-sm text-gray-900">{d.itemNumber}</span>
              <span className="text-xs text-gray-400">|</span>
              <span className="text-xs text-gray-500">Contract {d.contractNumber}, Plan {d.planCode}</span>
              <span className="text-xs text-gray-400">|</span>
              <span className="text-xs text-gray-500">{fmtDate(d.startDate)}</span>
              <span className="ml-auto shrink-0">
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                  {d.count} copies
                </span>
              </span>
            </button>

            {isOpen && (
              <div className="bg-gray-50/80 border-t border-gray-100 px-4 py-4 space-y-3">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-red-800">
                      {d.count} records with identical plan + item + start date
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-red-700">
                    Records {d.recordIds.map(id => `#${id}`).join(", ")} all share the same plan (<span className="font-medium">{d.planCode}</span>),
                    item (<span className="font-mono font-medium">{d.itemNumber}</span>), and
                    start date (<span className="font-medium">{fmtDate(d.startDate)}</span>).
                    Only one should exist.
                  </p>
                </div>

                <div className="rounded-lg border border-brennan-border bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Recommended action</p>
                  <div className="space-y-1.5 text-xs text-gray-700">
                    <p>Open the records in the Records page and compare them. Keep the correct one and <span className="font-medium">cancel</span> the others.</p>
                    <p>If the prices differ, the most recently created record is usually the intended one.</p>
                  </div>
                  <Link
                    href={`/records?search=${encodeURIComponent(d.itemNumber)}&distributor=${encodeURIComponent(d.distributor)}`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brennan-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-brennan-blue/90 transition-colors"
                  >
                    View in Records
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable price anomaly rows
// ---------------------------------------------------------------------------
function PriceAnomalyList({ anomalies }: { anomalies: DqData["priceAnomalies"] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="divide-y divide-brennan-border">
      {anomalies.map((a, i) => {
        const isOpen = expanded.has(i);
        return (
          <div key={i}>
            <button
              onClick={() => toggle(i)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-amber-50/50 transition-colors ${isOpen ? "bg-amber-50/30" : ""}`}
            >
              <svg
                className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-mono text-sm text-gray-900">{a.itemNumber}</span>
              <span className="text-xs text-gray-400">|</span>
              <span className="text-xs text-gray-500">{a.recordCount} records</span>
              <span className="ml-auto flex items-center gap-3 shrink-0">
                <span className="text-xs">
                  <span className="font-medium text-green-700">${a.minPrice.toFixed(2)}</span>
                  <span className="mx-1.5 text-gray-300">→</span>
                  <span className="font-medium text-red-600">${a.maxPrice.toFixed(2)}</span>
                </span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${a.variancePct > 100 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {a.variancePct}% variance
                </span>
              </span>
            </button>

            {isOpen && (
              <div className="bg-gray-50/80 border-t border-gray-100 px-4 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 border-l-4 border-l-green-500 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Lowest Price</p>
                    <p className="font-mono text-lg font-bold text-green-700">${a.minPrice.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">{a.minContext}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 border-l-4 border-l-red-500 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Highest Price</p>
                    <p className="font-mono text-lg font-bold text-red-600">${a.maxPrice.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">{a.maxContext}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-amber-800">
                      {a.variancePct}% price variance across {a.recordCount} records
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-amber-700">
                    {a.variancePct > 100
                      ? "This is a very large variance. Check for data entry errors (decimal point, wrong unit)."
                      : "This may be legitimate (different contract tiers, volume pricing) or a data entry error."
                    }
                  </p>
                </div>

                <Link
                  href={`/records?search=${encodeURIComponent(a.itemNumber)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brennan-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-brennan-blue/90 transition-colors"
                >
                  View all records for {a.itemNumber}
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable contract overlap rows
// ---------------------------------------------------------------------------
function ContractOverlapList({ contractOverlaps }: { contractOverlaps: DqData["contractOverlaps"] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="divide-y divide-brennan-border">
      {contractOverlaps.map((c, i) => {
        const isOpen = expanded.has(i);
        const window = getOverlapWindow(c.contractA.start, c.contractA.end, c.contractB.start, c.contractB.end);

        return (
          <div key={i}>
            <button
              onClick={() => toggle(i)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-amber-50/50 transition-colors ${isOpen ? "bg-amber-50/30" : ""}`}
            >
              <svg
                className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <DistBadge code={c.distributor} />
              <span className="text-sm text-gray-900">{c.endUser}</span>
              <span className="text-xs text-gray-400">|</span>
              <span className="text-xs text-gray-500">
                {c.contractA.number} / {c.contractB.number}
              </span>
              <span className="ml-auto shrink-0">
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">
                  {window.days > 0 ? `${window.days} day overlap` : "indefinite overlap"}
                </span>
              </span>
            </button>

            {isOpen && (
              <div className="bg-gray-50/80 border-t border-gray-100 px-4 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 border-l-4 border-l-brennan-blue bg-white px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase text-gray-500">Contract A</span>
                      <Link
                        href={`/contracts?search=${encodeURIComponent(c.contractA.number)}`}
                        className="text-xs font-medium text-brennan-blue hover:underline"
                      >
                        {c.contractA.number}
                      </Link>
                    </div>
                    <div className="text-xs">
                      <span className="text-gray-500">Period: </span>
                      <span className="text-gray-900">{fmtDate(c.contractA.start)} – {fmtDate(c.contractA.end)}</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 border-l-4 border-l-amber-400 bg-white px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase text-gray-500">Contract B</span>
                      <Link
                        href={`/contracts?search=${encodeURIComponent(c.contractB.number)}`}
                        className="text-xs font-medium text-brennan-blue hover:underline"
                      >
                        {c.contractB.number}
                      </Link>
                    </div>
                    <div className="text-xs">
                      <span className="text-gray-500">Period: </span>
                      <span className="text-gray-900">{fmtDate(c.contractB.start)} – {fmtDate(c.contractB.end)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-amber-800">
                      Overlap: {fmtDate(window.start)} – {fmtDate(window.end)}
                      {window.days > 0 && <span className="font-normal text-amber-600"> ({window.days} days)</span>}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-amber-700">
                    Two contracts for {c.endUser} under {c.distributor} are active at the same time.
                    This may be a legitimate renewal/transition or a duplicate contract entry.
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryCard({ label, count, severity }: { label: string; count: number; severity: "ok" | "info" | "warn" | "error" }) {
  const border = {
    ok: "border-l-green-500",
    info: "border-l-gray-400",
    warn: "border-l-amber-500",
    error: "border-l-red-500",
  }[severity];

  const textColor = {
    ok: "text-green-700",
    info: "text-gray-500",
    warn: "text-amber-600",
    error: "text-red-600",
  }[severity];

  return (
    <div className={`rounded-lg border border-brennan-border border-l-4 ${border} bg-white p-4`}>
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${count > 0 ? textColor : "text-brennan-text"}`}>
        {count}
      </p>
    </div>
  );
}

function Section({ title, subtitle, severity, count, children }: {
  title: string;
  subtitle: string;
  severity: "error" | "warn" | "info";
  count: number;
  children: React.ReactNode;
}) {
  const badgeStyle = {
    error: "bg-red-100 text-red-700",
    warn: "bg-amber-100 text-amber-700",
    info: "bg-gray-100 text-gray-600",
  }[severity];

  return (
    <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-brennan-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-brennan-text">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeStyle}`}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function DistBadge({ code }: { code: string }) {
  return (
    <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-bold text-brennan-blue">
      {code}
    </span>
  );
}
