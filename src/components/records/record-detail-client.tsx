"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./status-badge";
import { RecordModal } from "./record-modal";
import { SupersedeModal } from "./supersede-modal";
import { getAvailableActions } from "@/lib/records/record-actions";
import type { RecordStatus } from "@/lib/constants/statuses";

// --- Types ---

interface RecordData {
  id: number;
  rebatePrice: string;
  startDate: string;
  endDate: string | null;
  rawStartDate: string;
  rawEndDate: string | null;
  status: RecordStatus;
  item: { id: number; itemNumber: string; description: string | null };
  plan: { id: number; planCode: string; planName: string | null; discountType: string };
  contract: { id: number; contractNumber: string };
  distributor: { id: number; code: string; name: string };
  endUser: { id: number; code: string | null; name: string };
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ChainRecord {
  id: number;
  rebatePrice: string;
  startDate: string;
  endDate: string | null;
  status: string;
  itemNumber: string;
}

interface NoteData {
  id: number;
  noteText: string;
  noteType: string;
  createdBy: string;
  createdAt: string;
}

interface AuditEntry {
  id: number;
  action: string;
  changedFields: Record<string, { old: unknown; new: unknown }> | null;
  user: string;
  createdAt: string;
}

interface Props {
  record: RecordData;
  predecessors: ChainRecord[];
  successors: ChainRecord[];
  notes: NoteData[];
  auditEntries: AuditEntry[];
}

// --- Component ---

export function RecordDetailClient({
  record,
  predecessors,
  successors,
  notes: initialNotes,
  auditEntries,
}: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Action modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [supersedeModalOpen, setSupersedeModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"expire" | "cancel" | "restore" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const actions = getAvailableActions(record.status);

  async function handleConfirmAction() {
    if (!confirmAction) return;
    setActionLoading(true);
    setActionError(null);

    const url = confirmAction === "expire"
      ? `/api/records/${record.id}/expire`
      : confirmAction === "restore"
        ? `/api/records/${record.id}/restore`
        : `/api/records/${record.id}`;
    const method = confirmAction === "cancel" ? "DELETE" : "POST";

    try {
      const res = await fetch(url, { method });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || `Failed to ${confirmAction} record`);
        return;
      }
      setConfirmAction(null);
      router.refresh();
    } catch {
      setActionError("Network error");
    } finally {
      setActionLoading(false);
    }
  }

  const hasSupersessionChain = predecessors.length > 0 || successors.length > 0;

  const fetchNotes = useCallback(() => {
    fetch(`/api/records/${record.id}/notes`)
      .then((res) => (res.ok ? res.json() : Promise.reject("Failed")))
      .then((data) => setNotes(data.map((n: Record<string, unknown>) => ({
        id: n.id,
        noteText: n.noteText,
        noteType: n.noteType,
        createdBy: (n.createdBy as Record<string, string>)?.displayName ?? "Unknown",
        createdAt: n.createdAt,
      }))))
      .catch(() => {});
  }, [record.id]);

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    setNoteError(null);
    try {
      const res = await fetch(`/api/records/${record.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText: newNote.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setNoteError(data.error || "Failed to add note");
        return;
      }
      setNewNote("");
      fetchNotes();
    } catch {
      setNoteError("Network error");
    } finally {
      setSavingNote(false);
    }
  }

  // Sync notes if initial data changes (e.g. after router.refresh())
  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Link href="/records" className="hover:text-brennan-blue hover:underline">
          Records
        </Link>
        <span>/</span>
        <span className="font-medium text-brennan-text">#{record.id}</span>
      </div>

      {/* Header card */}
      <div className="rounded-lg border border-brennan-border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-brennan-text">
              Record #{record.id}
            </h1>
            <StatusBadge status={record.status} />
          </div>
          <div className="flex items-center gap-2">
            {actions.canEdit && (
              <button
                onClick={() => setEditModalOpen(true)}
                className="rounded-lg border border-brennan-border bg-white px-3 py-1.5 text-xs font-medium text-brennan-text transition-colors hover:bg-brennan-light"
              >
                Edit
              </button>
            )}
            {actions.canSupersede && (
              <button
                onClick={() => setSupersedeModalOpen(true)}
                className="rounded-lg border border-brennan-border bg-white px-3 py-1.5 text-xs font-medium text-brennan-text transition-colors hover:bg-brennan-light"
              >
                Supersede
              </button>
            )}
            {actions.canExpire && (
              <button
                onClick={() => setConfirmAction("expire")}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Expire
              </button>
            )}
            {actions.canCancel && (
              <button
                onClick={() => setConfirmAction("cancel")}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Cancel
              </button>
            )}
            {actions.canRestore && (
              <button
                onClick={() => setConfirmAction("restore")}
                className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50"
              >
                Restore
              </button>
            )}
            <Link
              href={`/records?contract=${record.contract.contractNumber}&plan=${record.plan.planCode}`}
              className="rounded-lg border border-brennan-border bg-white px-3 py-1.5 text-xs font-medium text-brennan-blue transition-colors hover:bg-brennan-light"
            >
              View in workspace
            </Link>
          </div>
        </div>

        {/* Core pricing info */}
        <div className="mt-4 flex items-baseline gap-6">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Rebate Price</p>
            <p className="mt-0.5 text-2xl font-bold text-brennan-text font-mono">
              ${Number(record.rebatePrice).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Item</p>
            <p className="mt-0.5 text-sm font-medium text-brennan-text font-mono">
              {record.item.itemNumber}
            </p>
            {record.item.description && (
              <p className="text-xs text-gray-500">{record.item.description}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Effective Period</p>
            <p className="mt-0.5 text-sm text-brennan-text">
              {record.startDate} → {record.endDate || <span className="text-amber-500">Open</span>}
            </p>
          </div>
        </div>

        {/* Contract context */}
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5 border-t border-brennan-border pt-4">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Distributor</p>
            <p className="mt-0.5">
              <span className="rounded bg-brennan-blue/10 px-1.5 py-0.5 text-xs font-bold text-brennan-blue">
                {record.distributor.code}
              </span>
              <span className="ml-1.5 text-sm text-gray-600">{record.distributor.name}</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">End User</p>
            <p className="mt-0.5 text-sm font-medium text-brennan-text">{record.endUser.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Contract</p>
            <Link
              href={`/contracts/${record.contract.id}`}
              className="mt-0.5 block text-sm font-mono font-medium text-brennan-blue hover:underline"
            >
              {record.contract.contractNumber}
            </Link>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Rebate Plan</p>
            <p className="mt-0.5 text-sm font-mono font-medium text-brennan-text">
              {record.plan.planCode}
            </p>
            {record.plan.planName && (
              <p className="text-xs text-gray-500">{record.plan.planName}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase">Discount Type</p>
            <p className="mt-0.5 text-sm text-brennan-text capitalize">{record.plan.discountType}</p>
          </div>
        </div>
      </div>

      {/* Two-column layout: main content + sidebar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main content — 2/3 width */}
        <div className="space-y-4 lg:col-span-2">
          {/* Supersession chain */}
          {hasSupersessionChain && (
            <div className="rounded-lg border border-brennan-border bg-white shadow-sm">
              <div className="border-b border-brennan-border px-4 py-3">
                <h2 className="text-sm font-bold text-brennan-text">Supersession Chain</h2>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center overflow-x-auto pb-2">
                  {/* Build full chain: predecessors (oldest first) → current → successors */}
                  {(() => {
                    const allNodes = [
                      ...[...predecessors].reverse().map((r) => ({ ...r, _current: false })),
                      {
                        id: record.id,
                        rebatePrice: record.rebatePrice,
                        startDate: record.startDate,
                        endDate: record.endDate,
                        status: record.status,
                        itemNumber: record.item.itemNumber,
                        _current: true,
                      },
                      ...successors.map((r) => ({ ...r, _current: false })),
                    ];
                    return allNodes.map((node, idx) => (
                      <div key={node.id} className="flex items-center shrink-0">
                        {idx > 0 && (
                          <svg className="h-4 w-5 shrink-0 text-gray-300 mx-1" fill="none" viewBox="0 0 20 16" stroke="currentColor" strokeWidth={2}>
                            <path d="M2 8h12m0 0-3-3m3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        <ChainNode rec={node} isCurrent={node._current} />
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Audit history */}
          <div className="rounded-lg border border-brennan-border bg-white shadow-sm">
            <div className="border-b border-brennan-border px-4 py-3">
              <h2 className="text-sm font-bold text-brennan-text">
                History
                <span className="ml-1.5 text-xs font-normal text-gray-400">
                  ({auditEntries.length} {auditEntries.length === 1 ? "entry" : "entries"})
                </span>
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {auditEntries.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  No audit entries for this record.
                </p>
              ) : (
                auditEntries.map((entry) => (
                  <AuditEntryRow key={entry.id} entry={entry} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — 1/3 width */}
        <div className="space-y-4">
          {/* Notes */}
          <div className="rounded-lg border border-brennan-border bg-white shadow-sm">
            <div className="border-b border-brennan-border px-4 py-3">
              <h2 className="text-sm font-bold text-brennan-text">
                Notes
                <span className="ml-1.5 text-xs font-normal text-gray-400">
                  ({notes.length})
                </span>
              </h2>
            </div>
            <div className="px-4 py-3 space-y-3">
              {/* Add note form */}
              <div className="space-y-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="w-full rounded-lg border border-brennan-border px-3 py-2 text-sm text-brennan-text placeholder:text-gray-400 focus:border-brennan-blue focus:outline-none focus:ring-1 focus:ring-brennan-blue"
                />
                {noteError && (
                  <p className="text-xs text-red-600">{noteError}</p>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={handleAddNote}
                    disabled={savingNote || !newNote.trim()}
                    className="rounded-lg bg-brennan-blue px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brennan-dark disabled:opacity-50"
                  >
                    {savingNote ? "Adding..." : "Add Note"}
                  </button>
                </div>
              </div>

              {/* Notes list */}
              {notes.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No notes yet.</p>
              ) : (
                <div className="space-y-2">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <NoteTypeBadge type={note.noteType} />
                        <span>{note.createdBy}</span>
                        <span className="ml-auto text-gray-400">
                          {formatDateTime(note.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-brennan-text whitespace-pre-wrap">
                        {note.noteText}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="rounded-lg border border-brennan-border bg-white shadow-sm">
            <div className="border-b border-brennan-border px-4 py-3">
              <h2 className="text-sm font-bold text-brennan-text">Record Metadata</h2>
            </div>
            <div className="px-4 py-3 space-y-2 text-xs">
              <MetadataRow label="Record ID" value={`#${record.id}`} />
              <MetadataRow label="Created by" value={record.createdBy} />
              <MetadataRow label="Created at" value={formatDateTime(record.createdAt)} />
              <MetadataRow label="Updated by" value={record.updatedBy} />
              <MetadataRow label="Updated at" value={formatDateTime(record.updatedAt)} />
            </div>
          </div>
        </div>
      </div>

      {/* Edit modal — reuses the same RecordModal as the Records table */}
      <RecordModal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          router.refresh();
        }}
        record={editModalOpen ? {
          id: record.id,
          rebatePlanId: record.plan.id,
          itemId: record.item.id,
          rebatePrice: record.rebatePrice,
          startDate: record.rawStartDate,
          endDate: record.rawEndDate ?? "",
        } : null}
      />

      {/* Supersede modal — redirects to the new replacement record on success */}
      {supersedeModalOpen && (
        <SupersedeModal
          open={supersedeModalOpen}
          onClose={() => setSupersedeModalOpen(false)}
          record={{
            id: record.id,
            distributor: record.distributor.code,
            contractNumber: record.contract.contractNumber,
            planCode: record.plan.planCode,
            endUser: record.endUser.name,
            itemNumber: record.item.itemNumber,
            rebatePrice: record.rebatePrice,
            startDate: record.startDate,
            endDate: record.endDate ?? "",
          }}
          onSuccess={(newRecordId) => {
            setSupersedeModalOpen(false);
            router.push(`/records/${newRecordId}`);
          }}
        />
      )}

      {/* Expire / Cancel confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setConfirmAction(null); setActionError(null); }} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-brennan-text">
              {confirmAction === "expire" ? "Expire Record" : confirmAction === "restore" ? "Restore Record" : "Cancel Record"}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {confirmAction === "expire"
                ? "This will set the end date to today, making this record expired. This action can be reversed by editing the record."
                : confirmAction === "restore"
                  ? "This will restore the cancelled record. Its status will be re-derived from its dates (active, expired, or future)."
                  : "This will mark the record as cancelled. Cancelled records are preserved for audit history and can be restored later."}
            </p>
            {actionError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setConfirmAction(null); setActionError(null); }}
                className="rounded-lg border border-brennan-border bg-white px-4 py-2 text-sm font-medium text-brennan-text transition-colors hover:bg-brennan-light"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={actionLoading}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                  confirmAction === "restore" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {actionLoading
                  ? (confirmAction === "expire" ? "Expiring..." : confirmAction === "restore" ? "Restoring..." : "Cancelling...")
                  : (confirmAction === "expire" ? "Expire Record" : confirmAction === "restore" ? "Restore Record" : "Cancel Record")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function ChainNode({ rec, isCurrent }: { rec: ChainRecord; isCurrent: boolean }) {
  const nodeStatusColors: Record<string, string> = {
    active: "border-green-300 bg-green-50",
    expired: "border-gray-300 bg-gray-50",
    future: "border-blue-300 bg-blue-50",
    superseded: "border-orange-300 bg-orange-50",
    draft: "border-yellow-300 bg-yellow-50",
    cancelled: "border-red-300 bg-red-50",
  };

  const borderClass = nodeStatusColors[rec.status] || "border-gray-300 bg-gray-50";
  const currentRing = isCurrent ? "ring-2 ring-brennan-blue ring-offset-1" : "";

  const inner = (
    <div className={`relative rounded-lg border-2 ${borderClass} ${currentRing} px-3 py-2 min-w-[140px] transition-colors ${!isCurrent ? "hover:shadow-md cursor-pointer" : ""}`}>
      {isCurrent && (
        <span className="absolute -top-2 left-2 rounded bg-brennan-blue px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
          CURRENT
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-500">#{rec.id}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeColors[rec.status] || "bg-gray-100 text-gray-600"}`}>
          {rec.status}
        </span>
      </div>
      <p className="mt-1 text-sm font-bold font-mono text-brennan-text">
        ${Number(rec.rebatePrice).toFixed(2)}
      </p>
      <p className="text-[10px] text-gray-500">
        {rec.startDate} → {rec.endDate || "Open"}
      </p>
    </div>
  );

  if (isCurrent) return inner;

  return (
    <Link href={`/records/${rec.id}`} className="block">
      {inner}
    </Link>
  );
}

const statusBadgeColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expired: "bg-gray-100 text-gray-600",
  future: "bg-blue-100 text-blue-700",
  superseded: "bg-orange-100 text-orange-700",
  draft: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
};

const actionColors: Record<string, string> = {
  INSERT: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
};

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  function formatValue(v: unknown): string {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${actionColors[entry.action] || "bg-gray-100 text-gray-600"}`}>
          {entry.action}
        </span>
        <span className="text-xs text-gray-500">{entry.user}</span>
        <span className="ml-auto text-xs text-gray-400">
          {formatDateTime(entry.createdAt)}
        </span>
      </div>

      {entry.changedFields && Object.keys(entry.changedFields).length > 0 && (
        <div className="mt-2 space-y-1">
          {Object.entries(entry.changedFields).map(([field, diff]) => (
            <div key={field} className="flex items-start gap-2 text-xs">
              <span className="min-w-[80px] shrink-0 font-medium text-gray-600">
                {field}
              </span>
              {entry.action === "INSERT" ? (
                <span className="text-green-700">
                  {formatValue(typeof diff === "object" && diff && "new" in diff ? diff.new : diff)}
                </span>
              ) : (
                <span className="text-gray-500">
                  <span className="line-through text-red-400">
                    {formatValue(typeof diff === "object" && diff && "old" in diff ? diff.old : null)}
                  </span>
                  {" → "}
                  <span className="font-medium text-brennan-text">
                    {formatValue(typeof diff === "object" && diff && "new" in diff ? diff.new : diff)}
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const noteTypeColors: Record<string, string> = {
  general: "bg-gray-100 text-gray-600",
  pricing: "bg-blue-100 text-blue-600",
  contract: "bg-purple-100 text-purple-600",
  price_change_reason: "bg-amber-100 text-amber-600",
  approval: "bg-green-100 text-green-600",
  internal: "bg-indigo-100 text-indigo-600",
};

function NoteTypeBadge({ type }: { type: string }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${noteTypeColors[type] || "bg-gray-100 text-gray-600"}`}>
      {type}
    </span>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-brennan-text">{value}</span>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
