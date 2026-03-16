"use client";

import { useState, useMemo } from "react";

interface AuditEntry {
  id: number;
  action: string;
  tableName: string;
  recordId: number;
  userName: string;
  createdAt: string;
  changedFields: Record<string, { old: unknown; new: unknown }> | null;
}

interface AuditPageClientProps {
  entries: AuditEntry[];
  uniqueUsers: { id: number; displayName: string }[];
}

export function AuditPageClient({ entries, uniqueUsers }: AuditPageClientProps) {
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterTable, setFilterTable] = useState("");

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterAction && e.action !== filterAction) return false;
      if (filterUser && e.userName !== filterUser) return false;
      if (filterTable && e.tableName !== filterTable) return false;
      return true;
    });
  }, [entries, filterAction, filterUser, filterTable]);

  const uniqueTables = useMemo(
    () => [...new Set(entries.map((e) => e.tableName))].sort(),
    [entries]
  );

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brennan-border bg-white p-4">
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="rounded-lg border border-brennan-border bg-white px-3 py-2 text-sm"
        >
          <option value="">All Actions</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="rounded-lg border border-brennan-border bg-white px-3 py-2 text-sm"
        >
          <option value="">All Users</option>
          {uniqueUsers.map((u) => (
            <option key={u.id} value={u.displayName}>
              {u.displayName}
            </option>
          ))}
        </select>
        <select
          value={filterTable}
          onChange={(e) => setFilterTable(e.target.value)}
          className="rounded-lg border border-brennan-border bg-white px-3 py-2 text-sm"
        >
          <option value="">All Tables</option>
          {uniqueTables.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {(filterAction || filterUser || filterTable) && (
          <button
            onClick={() => { setFilterAction(""); setFilterUser(""); setFilterTable(""); }}
            className="text-xs text-brennan-blue hover:text-brennan-dark"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Audit entries */}
      <div className="rounded-xl border border-brennan-border bg-white">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            {entries.length === 0
              ? "Audit entries will appear here once data changes are made."
              : "No entries match your filters."}
          </div>
        ) : (
          <div className="divide-y divide-brennan-border">
            {filtered.map((entry) => (
              <div key={entry.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ActionBadge action={entry.action} />
                    <div>
                      <p className="text-sm font-medium text-brennan-text">
                        <span className="font-mono text-xs text-gray-500">
                          {entry.tableName}
                        </span>
                        {" "}
                        record #{entry.recordId}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        by {entry.userName} &middot;{" "}
                        {new Date(entry.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
                {entry.changedFields &&
                  Object.keys(entry.changedFields).length > 0 && (
                    <div className="mt-2 rounded-lg bg-brennan-light/50 p-3">
                      <div className="space-y-1">
                        {Object.entries(entry.changedFields).map(([field, diff]) => (
                          <div key={field} className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-gray-600">
                              {field}:
                            </span>
                            {diff.old !== null && (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 line-through">
                                {String(diff.old)}
                              </span>
                            )}
                            <span className="text-gray-400">&rarr;</span>
                            <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">
                              {String(diff.new)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ActionBadge({ action }: { action: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    INSERT: {
      label: "Created",
      classes: "bg-green-100 text-green-800 border-green-200",
    },
    UPDATE: {
      label: "Updated",
      classes: "bg-blue-100 text-blue-800 border-blue-200",
    },
    DELETE: {
      label: "Deleted",
      classes: "bg-red-100 text-red-800 border-red-200",
    },
  };

  const c = config[action] ?? config.UPDATE;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.classes}`}
    >
      {c.label}
    </span>
  );
}
