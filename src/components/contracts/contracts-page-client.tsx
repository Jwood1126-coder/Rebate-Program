"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";

interface ContractRow {
  id: number;
  contractNumber: string;
  customerNumber: string | null;
  contractType: string;
  distributor: string;
  distributorName: string;
  endUser: string;
  startDate: string;
  endDate: string;
  status: string;
  recordCount: number;
  updatedAt: string;
  description: string | null;
}

interface FilterOptions {
  distributors: string[];
  endUsers: string[];
  statuses: string[];
}

interface Props {
  contracts: ContractRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: FilterOptions;
}

const statusColors: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  pending_review: "Pending Review",
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
};

export function ContractsPageClient({
  contracts,
  totalCount,
  page,
  pageSize,
  totalPages,
  filterOptions,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    startTransition(() => router.push(`/contracts?${params.toString()}`));
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p > 1) {
      params.set("page", String(p));
    } else {
      params.delete("page");
    }
    startTransition(() => router.push(`/contracts?${params.toString()}`));
  }

  const hasFilters = searchParams.has("distributor") || searchParams.has("endUser") ||
    searchParams.has("status") || searchParams.has("search");

  function clearAllFilters() {
    startTransition(() => router.push("/contracts"));
  }

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className={isPending ? "opacity-70 transition-opacity" : ""}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-brennan-text">Contracts</h1>
          <p className="text-xs text-gray-500">
            {totalCount} contract{totalCount !== 1 ? "s" : ""}
            {hasFilters ? " (filtered)" : ""}
          </p>
        </div>
        <Link
          href="/contracts/new"
          className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brennan-dark"
        >
          + New Contract
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={searchParams.get("distributor") || ""}
          onChange={(e) => setFilter("distributor", e.target.value)}
          className="h-8 rounded-lg border border-brennan-border bg-white px-2 text-xs text-brennan-text focus:border-brennan-blue focus:outline-none"
        >
          <option value="">All Distributors</option>
          {filterOptions.distributors.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          value={searchParams.get("endUser") || ""}
          onChange={(e) => setFilter("endUser", e.target.value)}
          className="h-8 rounded-lg border border-brennan-border bg-white px-2 text-xs text-brennan-text focus:border-brennan-blue focus:outline-none"
        >
          <option value="">All End Users</option>
          {filterOptions.endUsers.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>

        <select
          value={searchParams.get("status") || ""}
          onChange={(e) => setFilter("status", e.target.value)}
          className="h-8 rounded-lg border border-brennan-border bg-white px-2 text-xs text-brennan-text focus:border-brennan-blue focus:outline-none"
        >
          <option value="">All Statuses</option>
          {filterOptions.statuses.map((s) => (
            <option key={s} value={s}>{statusLabels[s] || s}</option>
          ))}
        </select>

        <div className="relative">
          <DebouncedSearchInput
            value={searchParams.get("search") || ""}
            onChange={(v) => setFilter("search", v)}
          />
          <svg className="absolute left-2 top-2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </div>

        {hasFilters && (
          <button
            onClick={clearAllFilters}
            className="h-8 rounded-lg border border-brennan-border bg-white px-3 text-xs font-medium text-gray-500 hover:bg-brennan-light"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-brennan-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brennan-border bg-brennan-light/50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-3 py-2">Contract #</th>
              <th className="px-3 py-2">Customer #</th>
              <th className="px-3 py-2">Distributor</th>
              <th className="px-3 py-2">End User</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">End</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-center">Records</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contracts.map((c) => (
              <tr key={c.id} className="hover:bg-brennan-light/30 transition-colors">
                <td className="px-3 py-2">
                  <Link
                    href={`/contracts/${c.id}`}
                    className="font-mono font-medium text-brennan-blue hover:underline"
                  >
                    {c.contractNumber}
                  </Link>
                  {c.contractType === "evergreen" && (
                    <span className="ml-1.5 rounded bg-teal-100 px-1 py-0.5 text-[10px] font-bold text-teal-700" title="Evergreen contract">
                      EG
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-gray-600">
                  {c.customerNumber || "—"}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-bold text-brennan-blue">
                    {c.distributor}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-700">{c.endUser}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{c.startDate || "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {c.endDate || <span className="text-amber-500">Open</span>}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[c.status] || "bg-gray-100 text-gray-600"}`}>
                    {statusLabels[c.status] || c.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-xs text-gray-600">{c.recordCount}</td>
                <td className="px-3 py-2 text-xs text-gray-400">
                  {new Date(c.updatedAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/contracts/${c.id}/update`}
                    className="rounded bg-brennan-blue px-2.5 py-1 text-xs font-medium text-white hover:bg-brennan-dark"
                  >
                    Update
                  </Link>
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-gray-400">
                  {hasFilters ? "No contracts match the current filters." : "No contracts yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing {rangeStart}–{rangeEnd} of {totalCount} contracts
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(1)}
              disabled={page <= 1}
              className="rounded border border-brennan-border bg-white px-2 py-1 disabled:opacity-40"
            >
              First
            </button>
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="rounded border border-brennan-border bg-white px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-2 font-medium">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="rounded border border-brennan-border bg-white px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
            <button
              onClick={() => goToPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded border border-brennan-border bg-white px-2 py-1 disabled:opacity-40"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Debounced search input that stays in sync with URL state.
 * Resyncs when the URL value changes externally (back/forward, clear filters, deep links).
 */
function DebouncedSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync local state when the URL value changes externally
  // (back/forward navigation, clear filters, deep links).
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional prop-to-state sync
    setLocal(value);
  }, [value]);

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
      onChange(v.trim());
    }, 400);
  }

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="Search contracts..."
      className="h-8 w-52 rounded-lg border border-brennan-border bg-white pl-7 pr-2 text-xs text-brennan-text placeholder:text-gray-400 focus:border-brennan-blue focus:outline-none"
    />
  );
}
