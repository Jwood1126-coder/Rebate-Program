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
          subtitle="Same plan + item + start date appearing more than once. These should be reviewed and consolidated."
          severity="error"
          count={duplicates.length}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-brennan-border bg-gray-50">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Distributor</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Contract</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Plan</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Item</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Start Date</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Copies</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Record IDs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brennan-border">
              {duplicates.map((d, i) => (
                <tr key={i} className="hover:bg-red-50/50">
                  <td className="px-3 py-2">
                    <DistBadge code={d.distributor} />
                  </td>
                  <td className="px-3 py-2 text-sm">{d.contractNumber}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{d.planCode}</td>
                  <td className="px-3 py-2 font-mono text-sm">{d.itemNumber}</td>
                  <td className="px-3 py-2 text-sm">{fmtDate(d.startDate)}</td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-red-600">{d.count}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{d.recordIds.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Overlapping date ranges */}
      {overlaps.length > 0 && (
        <Section
          title="Overlapping Date Ranges"
          subtitle="Same plan + item with date ranges that overlap. One record should be end-dated or superseded."
          severity="error"
          count={overlaps.length}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-brennan-border bg-gray-50">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Distributor</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Contract</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Item</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Record A</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Record B</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brennan-border">
              {overlaps.map((o, i) => (
                <tr key={i} className="hover:bg-red-50/50">
                  <td className="px-3 py-2">
                    <DistBadge code={o.distributor} />
                  </td>
                  <td className="px-3 py-2 text-sm">{o.contractNumber}</td>
                  <td className="px-3 py-2 font-mono text-sm">{o.itemNumber}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-medium text-brennan-text">#{o.recordA.id}</span>{" "}
                    ${o.recordA.price.toFixed(2)}<br />
                    <span className="text-gray-400">{fmtDate(o.recordA.start)} – {fmtDate(o.recordA.end)}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-medium text-brennan-text">#{o.recordB.id}</span>{" "}
                    ${o.recordB.price.toFixed(2)}<br />
                    <span className="text-gray-400">{fmtDate(o.recordB.start)} – {fmtDate(o.recordB.end)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Price anomalies */}
      {priceAnomalies.length > 0 && (
        <Section
          title="Price Anomalies"
          subtitle="Items with >50% price variance across contracts. May indicate data entry errors or legitimate tiered pricing."
          severity="warn"
          count={priceAnomalies.length}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-brennan-border bg-gray-50">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Item</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Min Price</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Context</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Max Price</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Context</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Variance</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">Records</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brennan-border">
              {priceAnomalies.map((a, i) => (
                <tr key={i} className="hover:bg-amber-50/50">
                  <td className="px-3 py-2 font-mono text-sm">{a.itemNumber}</td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-green-700">${a.minPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{a.minContext}</td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-red-600">${a.maxPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{a.maxContext}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${a.variancePct > 100 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {a.variancePct}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-sm text-gray-500">{a.recordCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Contract overlaps */}
      {contractOverlaps.length > 0 && (
        <Section
          title="Overlapping Contracts"
          subtitle="Same distributor + end user with overlapping contract date ranges. May indicate duplicate contract entries."
          severity="warn"
          count={contractOverlaps.length}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-brennan-border bg-gray-50">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Distributor</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">End User</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Contract A</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Contract B</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brennan-border">
              {contractOverlaps.map((c, i) => (
                <tr key={i} className="hover:bg-amber-50/50">
                  <td className="px-3 py-2">
                    <DistBadge code={c.distributor} />
                  </td>
                  <td className="px-3 py-2 text-sm">{c.endUser}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-medium">{c.contractA.number}</span><br />
                    <span className="text-gray-400">{fmtDate(c.contractA.start)} – {fmtDate(c.contractA.end)}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-medium">{c.contractB.number}</span><br />
                    <span className="text-gray-400">{fmtDate(c.contractB.start)} – {fmtDate(c.contractB.end)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
