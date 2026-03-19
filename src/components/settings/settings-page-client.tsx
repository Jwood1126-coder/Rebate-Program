"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/ui/searchable-select";
import ColumnMappingConfig from "@/components/settings/column-mapping-config";
import type { UserRole } from "@/lib/constants/statuses";

interface DistributorInfo {
  id: number;
  code: string;
  name: string;
}

interface MappingInfo {
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

interface SettingsPageClientProps {
  role: UserRole;
  counts: {
    distributors: number;
    contracts: number;
    plans: number;
    items: number;
    endUsers: number;
    users: number;
  };
  distributors?: DistributorInfo[];
  existingMappings?: MappingInfo[];
}

type EntityTab = "distributors" | "contracts" | "plans" | "items" | "endUsers";
type MainTab = "entities" | "mappings" | "users" | "system";

export function SettingsPageClient({ role, counts, distributors = [], existingMappings = [] }: SettingsPageClientProps) {
  const [mainTab, setMainTab] = useState<MainTab>("entities");
  const isAdmin = role === "admin";

  const mainTabs: { key: MainTab; label: string; adminOnly?: boolean }[] = [
    { key: "entities", label: "Entities" },
    { key: "mappings", label: "Column Mappings" },
    { key: "users", label: "Users", adminOnly: true },
    { key: "system", label: "System" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-brennan-text">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-500">Manage reference data, users, and system configuration</p>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 border-b border-brennan-border">
        {mainTabs
          .filter((t) => !t.adminOnly || isAdmin)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                mainTab === t.key
                  ? "border-b-2 border-brennan-blue text-brennan-blue"
                  : "text-gray-500 hover:text-brennan-text"
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {mainTab === "entities" && <EntitiesTab counts={counts} />}
      {mainTab === "mappings" && <MappingsTab distributors={distributors} existingMappings={existingMappings} />}
      {mainTab === "users" && isAdmin && <UsersTab />}
      {mainTab === "system" && <SystemTab counts={counts} isAdmin={isAdmin} />}
    </div>
  );
}

// ============================================================================
// Entities Tab
// ============================================================================
function EntitiesTab({ counts }: { counts: SettingsPageClientProps["counts"] }) {
  const [entityTab, setEntityTab] = useState<EntityTab>("distributors");

  const entityTabs: { key: EntityTab; label: string; count: number }[] = [
    { key: "distributors", label: "Distributors", count: counts.distributors },
    { key: "contracts", label: "Contracts", count: counts.contracts },
    { key: "plans", label: "Plans", count: counts.plans },
    { key: "items", label: "Items", count: counts.items },
    { key: "endUsers", label: "End Users", count: counts.endUsers },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {entityTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setEntityTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              entityTab === t.key
                ? "bg-brennan-blue text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label} <span className="ml-1 opacity-70">({t.count})</span>
          </button>
        ))}
      </div>

      {entityTab === "distributors" && <DistributorsSection />}
      {entityTab === "contracts" && <ContractsSection />}
      {entityTab === "plans" && <PlansSection />}
      {entityTab === "items" && <ItemsSection />}
      {entityTab === "endUsers" && <EndUsersSection />}
    </div>
  );
}

// ============================================================================
// Entity Sections
// ============================================================================

interface EntityRow {
  id: number;
  [key: string]: unknown;
}

function useEntityData<T extends EntityRow>(apiPath: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${apiPath}`);
      const d = await res.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const refresh = useCallback(() => {
    void fetchData();
    router.refresh();
  }, [fetchData, router]);

  return { data, loading, refresh };
}

function DistributorsSection() {
  const { data, loading, refresh } = useEntityData<{
    id: number; code: string; name: string; isActive: boolean;
  }>("distributors");
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <EntityTable
      loading={loading}
      columns={["Code", "Name", "Status", ""]}
      onNew={() => setCreating(true)}
      newLabel="New Distributor"
    >
      {data.map((d) => (
        <tr key={d.id} className="border-b border-brennan-border hover:bg-brennan-light/40">
          <td className="px-3 py-2 text-sm font-bold text-brennan-blue">{d.code}</td>
          <td className="px-3 py-2 text-sm text-brennan-text">{d.name}</td>
          <td className="px-3 py-2"><ActiveBadge active={d.isActive} /></td>
          <td className="px-3 py-2 text-right">
            <button onClick={() => setEditId(d.id)} className="text-xs font-medium text-brennan-blue hover:underline">Edit</button>
          </td>
        </tr>
      ))}
      {editId && (
        <EditModal
          type="distributor"
          id={editId}
          onClose={() => setEditId(null)}
          onSaved={refresh}
        />
      )}
      {creating && (
        <CreateModal
          title="New Distributor"
          fields={[
            { key: "code", label: "Code", required: true },
            { key: "name", label: "Name", required: true },
          ]}
          apiPath="distributors"
          onClose={() => setCreating(false)}
          onSaved={refresh}
        />
      )}
    </EntityTable>
  );
}

function ContractsSection() {
  const { data, loading, refresh } = useEntityData<{
    id: number; contractNumber: string; status: string;
    distributor: { code: string; name: string };
    endUser: { code: string; name: string };
  }>("contracts");
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <EntityTable
      loading={loading}
      columns={["Contract #", "Distributor", "End User", "Status", ""]}
      onNew={() => setCreating(true)}
      newLabel="New Contract"
    >
      {data.map((c) => (
        <tr key={c.id} className="border-b border-brennan-border hover:bg-brennan-light/40">
          <td className="px-3 py-2 text-sm font-medium text-brennan-text">{c.contractNumber}</td>
          <td className="px-3 py-2 text-sm text-brennan-text">{c.distributor?.code} - {c.distributor?.name}</td>
          <td className="px-3 py-2 text-sm text-brennan-text">{c.endUser?.name}</td>
          <td className="px-3 py-2"><StatusPill status={c.status} /></td>
          <td className="px-3 py-2 text-right">
            <button onClick={() => setEditId(c.id)} className="text-xs font-medium text-brennan-blue hover:underline">Edit</button>
          </td>
        </tr>
      ))}
      {editId && (
        <EditModal type="contract" id={editId} onClose={() => setEditId(null)} onSaved={refresh} />
      )}
      {creating && (
        <ContractCreateModal onClose={() => setCreating(false)} onSaved={refresh} />
      )}
    </EntityTable>
  );
}

function PlansSection() {
  const { data, loading, refresh } = useEntityData<{
    id: number; planCode: string; planName: string | null; discountType: string; status: string;
    contract: { contractNumber: string; distributor: { code: string } };
  }>("plans");
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <EntityTable
      loading={loading}
      columns={["Plan Code", "Plan Name", "Distributor", "Contract", "Type", "Status", ""]}
      onNew={() => setCreating(true)}
      newLabel="New Plan"
    >
      {data.map((p) => (
        <tr key={p.id} className="border-b border-brennan-border hover:bg-brennan-light/40">
          <td className="px-3 py-2 text-sm font-bold text-brennan-text">{p.planCode}</td>
          <td className="px-3 py-2 text-sm text-gray-600">{p.planName || "-"}</td>
          <td className="px-3 py-2 text-sm text-brennan-blue">{p.contract?.distributor?.code}</td>
          <td className="px-3 py-2 text-sm text-brennan-text">{p.contract?.contractNumber}</td>
          <td className="px-3 py-2 text-xs text-gray-500">{p.discountType}</td>
          <td className="px-3 py-2"><StatusPill status={p.status} /></td>
          <td className="px-3 py-2 text-right">
            <button onClick={() => setEditId(p.id)} className="text-xs font-medium text-brennan-blue hover:underline">Edit</button>
          </td>
        </tr>
      ))}
      {editId && (
        <EditModal type="plan" id={editId} onClose={() => setEditId(null)} onSaved={refresh} />
      )}
      {creating && (
        <PlanCreateModal onClose={() => setCreating(false)} onSaved={refresh} />
      )}
    </EntityTable>
  );
}

function ItemsSection() {
  const { data, loading, refresh } = useEntityData<{
    id: number; itemNumber: string; description: string | null; productCode: string | null; isActive: boolean;
  }>("items");
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <EntityTable
      loading={loading}
      columns={["Item #", "Description", "Product Code", "Status", ""]}
      onNew={() => setCreating(true)}
      newLabel="New Item"
    >
      {data.map((item) => (
        <tr key={item.id} className="border-b border-brennan-border hover:bg-brennan-light/40">
          <td className="px-3 py-2 font-mono text-sm text-brennan-text">{item.itemNumber}</td>
          <td className="px-3 py-2 text-sm text-gray-600">{item.description || "-"}</td>
          <td className="px-3 py-2 text-sm text-gray-500">{item.productCode || "-"}</td>
          <td className="px-3 py-2"><ActiveBadge active={item.isActive} /></td>
          <td className="px-3 py-2 text-right">
            <button onClick={() => setEditId(item.id)} className="text-xs font-medium text-brennan-blue hover:underline">Edit</button>
          </td>
        </tr>
      ))}
      {editId && (
        <EditModal type="item" id={editId} onClose={() => setEditId(null)} onSaved={refresh} />
      )}
      {creating && (
        <CreateModal
          title="New Item"
          fields={[
            { key: "itemNumber", label: "Item Number", required: true },
            { key: "description", label: "Description" },
            { key: "productCode", label: "Product Code" },
          ]}
          apiPath="items"
          onClose={() => setCreating(false)}
          onSaved={refresh}
        />
      )}
    </EntityTable>
  );
}

function EndUsersSection() {
  const { data, loading, refresh } = useEntityData<{
    id: number; code: string; name: string; isActive: boolean;
  }>("end-users");
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <EntityTable
      loading={loading}
      columns={["Code", "Name", "Status", ""]}
      onNew={() => setCreating(true)}
      newLabel="New End User"
    >
      {data.map((u) => (
        <tr key={u.id} className="border-b border-brennan-border hover:bg-brennan-light/40">
          <td className="px-3 py-2 text-sm font-bold text-brennan-text">{u.code}</td>
          <td className="px-3 py-2 text-sm text-brennan-text">{u.name}</td>
          <td className="px-3 py-2"><ActiveBadge active={u.isActive} /></td>
          <td className="px-3 py-2 text-right">
            <button onClick={() => setEditId(u.id)} className="text-xs font-medium text-brennan-blue hover:underline">Edit</button>
          </td>
        </tr>
      ))}
      {editId && (
        <EditModal type="endUser" id={editId} onClose={() => setEditId(null)} onSaved={refresh} />
      )}
      {creating && (
        <CreateModal
          title="New End User"
          fields={[
            { key: "code", label: "Code", required: true },
            { key: "name", label: "Name", required: true },
          ]}
          apiPath="end-users"
          onClose={() => setCreating(false)}
          onSaved={refresh}
        />
      )}
    </EntityTable>
  );
}

// ============================================================================
// Users Tab (admin only)
// ============================================================================
function UsersTab() {
  const { data, loading, refresh } = useEntityData<{
    id: number; username: string; displayName: string; email: string; role: string; isActive: boolean;
  }>("users");
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{data.length} users</p>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brennan-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-brennan-dark"
        >
          + New User
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border border-brennan-border bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-brennan-border bg-gray-50">
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Username</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Display Name</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
              <th className="w-16 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Loading...</td></tr>
            ) : (
              data.map((u) => (
                <tr key={u.id} className="border-b border-brennan-border hover:bg-brennan-light/40">
                  <td className="px-3 py-2 text-sm font-medium text-brennan-text">{u.username}</td>
                  <td className="px-3 py-2 text-sm text-brennan-text">{u.displayName}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{u.email}</td>
                  <td className="px-3 py-2"><RoleBadge role={u.role} /></td>
                  <td className="px-3 py-2"><ActiveBadge active={u.isActive} /></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditId(u.id)} className="text-xs font-medium text-brennan-blue hover:underline">Edit</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editId && <UserEditModal id={editId} onClose={() => setEditId(null)} onSaved={refresh} />}
      {creating && <UserCreateModal onClose={() => setCreating(false)} onSaved={refresh} />}
    </div>
  );
}

// ============================================================================
// Mappings Tab
// ============================================================================
function MappingsTab({ distributors, existingMappings }: { distributors: DistributorInfo[]; existingMappings: MappingInfo[] }) {
  return <ColumnMappingConfig distributors={distributors} existingMappings={existingMappings} />;
}

// ============================================================================
// System Tab
// ============================================================================
function SystemTab({ counts, isAdmin }: { counts: SettingsPageClientProps["counts"]; isAdmin: boolean }) {
  const [exportingFull, setExportingFull] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const handleExport = async (type: "full" | "csv") => {
    const setLoading = type === "full" ? setExportingFull : setExportingCsv;
    setLoading(true);
    setExportError(null);
    setExportSuccess(null);

    try {
      const url = type === "full" ? "/api/export/full" : "/api/export/records-csv";
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(data.error || `Export failed (${res.status})`);
      }

      // Trigger download
      const blob = await res.blob();
      const filename = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1]
        || (type === "full" ? "rms-export.xlsx" : "rebate-records.csv");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      setExportSuccess(type === "full" ? "Full Excel export downloaded" : "Records CSV downloaded");
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brennan-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-brennan-text">System Information</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Application</p>
            <p className="text-sm font-medium text-brennan-text">Rebate Management System</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Version</p>
            <p className="text-sm font-medium text-brennan-text">1.0.0</p>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-lg border border-brennan-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-brennan-text">Login Activity</h3>
              <p className="mt-0.5 text-xs text-gray-500">Track who has logged in and when</p>
            </div>
            <a
              href="/admin/login-activity"
              className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white hover:bg-brennan-dark transition-colors"
            >
              View Login Activity
            </a>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-brennan-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-brennan-text">Database Summary</h3>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[
            { label: "Distributors", count: counts.distributors },
            { label: "Contracts", count: counts.contracts },
            { label: "Plans", count: counts.plans },
            { label: "Items", count: counts.items },
            { label: "End Users", count: counts.endUsers },
            { label: "Users", count: counts.users },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-lg font-bold text-brennan-text">{s.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Data Export & Backup */}
      <div className="rounded-lg border border-brennan-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-brennan-text">Data Export &amp; Backup</h3>
        <p className="mt-1 text-xs text-gray-500">
          Download your data at any time. These exports contain everything needed to continue operations
          manually or restore from a backup.
        </p>

        {exportError && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {exportError}
          </div>
        )}
        {exportSuccess && (
          <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
            {exportSuccess}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Full Excel Export */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-brennan-text">Full Excel Export</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  All tables: distributors, contracts, plans, items, records. Multi-sheet workbook
                  you can open in Excel and use as a manual fallback.
                </p>
                <button
                  onClick={() => handleExport("full")}
                  disabled={exportingFull}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {exportingFull ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75"/></svg>
                      Exporting...
                    </>
                  ) : (
                    <>Download .xlsx</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Records CSV Export */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-brennan-text">Records CSV</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Just the rebate records as a flat CSV. Opens in any spreadsheet. Use this as your
                  emergency manual fallback if the system is unavailable.
                </p>
                <button
                  onClick={() => handleExport("csv")}
                  disabled={exportingCsv}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brennan-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-brennan-dark disabled:opacity-50"
                >
                  {exportingCsv ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75"/></svg>
                      Exporting...
                    </>
                  ) : (
                    <>Download .csv</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-800">Backup Recommendation</p>
          <p className="mt-0.5 text-xs text-amber-700">
            Download a full Excel export regularly (weekly or before major imports). The export
            contains all data needed to rebuild the system or continue operations in spreadsheets
            if necessary. For database-level backups, use the server command: <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[10px]">npm run db:backup</code>
          </p>
        </div>
      </div>

      {/* Disaster Recovery Quick Reference */}
      <div className="rounded-lg border border-brennan-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-brennan-text">Disaster Recovery</h3>
        <p className="mt-1 text-xs text-gray-500">
          If the system goes down, here is how to access your data and continue operations.
        </p>
        <div className="mt-3 space-y-2">
          <DrStep number={1} title="Use Your Last Excel Export">
            Open the most recent .xlsx file. It has every distributor, contract, plan, item, and
            rebate record. You can continue operating from this spreadsheet while the system is restored.
          </DrStep>
          <DrStep number={2} title="Restore from Database Backup">
            If the database is corrupted, restore from the latest pg_dump backup:
            <code className="mt-1 block rounded bg-gray-100 px-2 py-1 font-mono text-[10px]">npm run db:restore backups/rms-backup-YYYY-MM-DD.sql</code>
          </DrStep>
          <DrStep number={3} title="Re-seed from Scratch">
            If starting completely fresh, the seed script rebuilds reference data:
            <code className="mt-1 block rounded bg-gray-100 px-2 py-1 font-mono text-[10px]">npm run db:push &amp;&amp; npm run db:seed</code>
            Then re-import records from your Excel backup using the contract upload tool.
          </DrStep>
        </div>
      </div>
    </div>
  );
}

function DrStep({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brennan-blue text-xs font-bold text-white">
        {number}
      </div>
      <div>
        <p className="text-xs font-semibold text-brennan-text">{title}</p>
        <p className="mt-0.5 text-xs text-gray-600">{children}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

function EntityTable({
  loading,
  columns,
  children,
  onNew,
  newLabel,
}: {
  loading: boolean;
  columns: string[];
  children: React.ReactNode;
  onNew?: () => void;
  newLabel?: string;
}) {
  return (
    <div className="space-y-3">
      {onNew && (
        <div className="flex justify-end">
          <button
            onClick={onNew}
            className="rounded-lg bg-brennan-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-brennan-dark"
          >
            + {newLabel}
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-brennan-border bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-brennan-border bg-gray-50">
              {columns.map((c) => (
                <th key={c} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
      active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
    }`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    expired: "bg-gray-100 text-gray-500",
    cancelled: "bg-red-100 text-red-600",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-500"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "bg-purple-100 text-purple-700",
    rebate_manager: "bg-blue-100 text-blue-700",
    viewer: "bg-gray-100 text-gray-600",
  };
  const labels: Record<string, string> = {
    admin: "Admin",
    rebate_manager: "Manager",
    viewer: "Viewer",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[role] || "bg-gray-100 text-gray-600"}`}>
      {labels[role] || role}
    </span>
  );
}

// ============================================================================
// Generic Edit Modal (fetches entity, shows form, saves)
// ============================================================================
function EditModal({
  type,
  id,
  onClose,
  onSaved,
}: {
  type: "distributor" | "contract" | "plan" | "item" | "endUser";
  id: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiPath = type === "endUser" ? "end-users" : type === "plan" ? "plans" : `${type}s`;

  useEffect(() => {
    fetch(`/api/${apiPath}/${id}`)
      .then((res) => res.ok ? res.json() : Promise.reject("Not found"))
      .then((d) => { setData(d); setFormData(d); setLoading(false); })
      .catch(() => { setError("Failed to load"); setLoading(false); });
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
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function update(key: string, value: unknown) {
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
    <ModalShell title={titles[type]} onClose={onClose}>
      {loading && <p className="text-sm text-gray-400">Loading...</p>}
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && !loading && (
        <>
          <div className="space-y-3">
            {type === "distributor" && (
              <>
                <Field label="Code"><input className={readOnlyCls} value={String(formData.code || "")} readOnly /></Field>
                <Field label="Name"><input className={inputCls} value={String(formData.name || "")} onChange={(e) => update("name", e.target.value)} /></Field>
                <Checkbox label="Active" checked={Boolean(formData.isActive)} onChange={(v) => update("isActive", v)} />
              </>
            )}
            {type === "contract" && (
              <>
                <Field label="Contract Number"><input className={inputCls} value={String(formData.contractNumber || "")} onChange={(e) => update("contractNumber", e.target.value)} /></Field>
                <Field label="Description"><input className={inputCls} value={String(formData.description || "")} onChange={(e) => update("description", e.target.value)} /></Field>
                <Field label="Status">
                  <select className={inputCls} value={String(formData.status || "active")} onChange={(e) => update("status", e.target.value)}>
                    <option value="active">Active</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option>
                  </select>
                </Field>
              </>
            )}
            {type === "plan" && (
              <>
                <Field label="Plan Code"><input className={readOnlyCls} value={String(formData.planCode || "")} readOnly /></Field>
                <Field label="Plan Name"><input className={inputCls} value={String(formData.planName || "")} onChange={(e) => update("planName", e.target.value)} /></Field>
                <Field label="Discount Type">
                  <select className={inputCls} value={String(formData.discountType || "part")} onChange={(e) => update("discountType", e.target.value)}>
                    <option value="part">Part</option><option value="product_code">Product Code</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select className={inputCls} value={String(formData.status || "active")} onChange={(e) => update("status", e.target.value)}>
                    <option value="active">Active</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option>
                  </select>
                </Field>
              </>
            )}
            {type === "item" && (
              <>
                <Field label="Item Number"><input className={readOnlyCls} value={String(formData.itemNumber || "")} readOnly /></Field>
                <Field label="Description"><input className={inputCls} value={String(formData.description || "")} onChange={(e) => update("description", e.target.value)} /></Field>
                <Field label="Product Code"><input className={inputCls} value={String(formData.productCode || "")} onChange={(e) => update("productCode", e.target.value)} /></Field>
                <Checkbox label="Active" checked={Boolean(formData.isActive)} onChange={(v) => update("isActive", v)} />
              </>
            )}
            {type === "endUser" && (
              <>
                <Field label="Code"><input className={readOnlyCls} value={String(formData.code || "")} readOnly /></Field>
                <Field label="Name"><input className={inputCls} value={String(formData.name || "")} onChange={(e) => update("name", e.target.value)} /></Field>
                <Checkbox label="Active" checked={Boolean(formData.isActive)} onChange={(v) => update("isActive", v)} />
              </>
            )}
          </div>
          <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} />
        </>
      )}
    </ModalShell>
  );
}

// ============================================================================
// Create Modals
// ============================================================================
function CreateModal({
  title,
  fields,
  apiPath,
  onClose,
  onSaved,
}: {
  title: string;
  fields: { key: string; label: string; required?: boolean }[];
  apiPath: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-brennan-border px-3 py-2 text-sm text-brennan-text focus:border-brennan-blue focus:outline-none focus:ring-1 focus:ring-brennan-blue";

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/${apiPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required}>
            <input
              className={inputCls}
              value={formData[f.key] || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <ModalFooter onClose={onClose} onSave={handleCreate} saving={saving} saveLabel="Create" />
    </ModalShell>
  );
}

function ContractCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [distributors, setDistributors] = useState<{ id: number; code: string; name: string }[]>([]);
  const [endUsers, setEndUsers] = useState<{ id: number; code: string; name: string }[]>([]);
  const [formData, setFormData] = useState({ distributorId: "", endUserId: "", contractNumber: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-brennan-border px-3 py-2 text-sm text-brennan-text focus:border-brennan-blue focus:outline-none focus:ring-1 focus:ring-brennan-blue";

  useEffect(() => {
    Promise.all([fetch("/api/distributors"), fetch("/api/end-users")])
      .then(([dRes, eRes]) => Promise.all([dRes.json(), eRes.json()]))
      .then(([d, e]) => { setDistributors(d); setEndUsers(e); });
  }, []);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          distributorId: Number(formData.distributorId),
          endUserId: Number(formData.endUserId),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const distOptions = distributors.map((d) => ({ value: String(d.id), label: `${d.code} - ${d.name}` }));
  const euOptions = endUsers.map((e) => ({ value: String(e.id), label: `${e.code} - ${e.name}` }));

  return (
    <ModalShell title="New Contract" onClose={onClose}>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        <Field label="Distributor" required>
          <SearchableSelect
            options={distOptions}
            value={formData.distributorId}
            onChange={(v) => setFormData((p) => ({ ...p, distributorId: v }))}
            placeholder="Select distributor..."
          />
        </Field>
        <Field label="End User" required>
          <SearchableSelect
            options={euOptions}
            value={formData.endUserId}
            onChange={(v) => setFormData((p) => ({ ...p, endUserId: v }))}
            placeholder="Select end user..."
          />
        </Field>
        <Field label="Contract Number" required>
          <input className={inputCls} value={formData.contractNumber} onChange={(e) => setFormData((p) => ({ ...p, contractNumber: e.target.value }))} />
        </Field>
        <Field label="Description">
          <input className={inputCls} value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} />
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={handleCreate} saving={saving} saveLabel="Create" />
    </ModalShell>
  );
}

function PlanCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [contracts, setContracts] = useState<{ id: number; contractNumber: string; distributor: { code: string } }[]>([]);
  const [formData, setFormData] = useState({ contractId: "", planCode: "", planName: "", discountType: "part" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-brennan-border px-3 py-2 text-sm text-brennan-text focus:border-brennan-blue focus:outline-none focus:ring-1 focus:ring-brennan-blue";

  useEffect(() => {
    fetch("/api/contracts").then((r) => r.json()).then(setContracts);
  }, []);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, contractId: Number(formData.contractId) }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const contractOptions = contracts.map((c) => ({
    value: String(c.id),
    label: `${c.distributor?.code} / ${c.contractNumber}`,
  }));

  return (
    <ModalShell title="New Rebate Plan" onClose={onClose}>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        <Field label="Contract" required>
          <SearchableSelect
            options={contractOptions}
            value={formData.contractId}
            onChange={(v) => setFormData((p) => ({ ...p, contractId: v }))}
            placeholder="Select contract..."
          />
        </Field>
        <Field label="Plan Code" required>
          <input className={inputCls} value={formData.planCode} onChange={(e) => setFormData((p) => ({ ...p, planCode: e.target.value }))} />
        </Field>
        <Field label="Plan Name">
          <input className={inputCls} value={formData.planName} onChange={(e) => setFormData((p) => ({ ...p, planName: e.target.value }))} />
        </Field>
        <Field label="Discount Type" required>
          <select className={inputCls} value={formData.discountType} onChange={(e) => setFormData((p) => ({ ...p, discountType: e.target.value }))}>
            <option value="part">Part</option>
            <option value="product_code">Product Code</option>
          </select>
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={handleCreate} saving={saving} saveLabel="Create" />
    </ModalShell>
  );
}

// ============================================================================
// User Modals (admin only)
// ============================================================================
function UserCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [formData, setFormData] = useState({
    username: "", displayName: "", email: "", password: "", role: "viewer",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-brennan-border px-3 py-2 text-sm text-brennan-text focus:border-brennan-blue focus:outline-none focus:ring-1 focus:ring-brennan-blue";

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="New User" onClose={onClose}>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        <Field label="Username" required>
          <input className={inputCls} value={formData.username} onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value }))} />
        </Field>
        <Field label="Display Name" required>
          <input className={inputCls} value={formData.displayName} onChange={(e) => setFormData((p) => ({ ...p, displayName: e.target.value }))} />
        </Field>
        <Field label="Email" required>
          <input className={inputCls} type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} />
        </Field>
        <Field label="Password" required>
          <input className={inputCls} type="password" value={formData.password} onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))} />
        </Field>
        <Field label="Role" required>
          <select className={inputCls} value={formData.role} onChange={(e) => setFormData((p) => ({ ...p, role: e.target.value }))}>
            <option value="viewer">Viewer</option>
            <option value="rebate_manager">Rebate Manager</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={handleCreate} saving={saving} saveLabel="Create User" />
    </ModalShell>
  );
}

function UserEditModal({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-brennan-border px-3 py-2 text-sm text-brennan-text focus:border-brennan-blue focus:outline-none focus:ring-1 focus:ring-brennan-blue";
  const readOnlyCls = "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500";

  useEffect(() => {
    fetch(`/api/users/${id}`)
      .then((res) => res.ok ? res.json() : Promise.reject("Not found"))
      .then((d) => { setData(d); setFormData(d); setLoading(false); })
      .catch(() => { setError("Failed to load"); setLoading(false); });
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        displayName: formData.displayName,
        email: formData.email,
        role: formData.role,
        isActive: formData.isActive,
      };
      if (formData.newPassword) payload.password = formData.newPassword;

      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to save");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function update(key: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <ModalShell title="Edit User" onClose={onClose}>
      {loading && <p className="text-sm text-gray-400">Loading...</p>}
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && !loading && (
        <>
          <div className="space-y-3">
            <Field label="Username"><input className={readOnlyCls} value={String(formData.username || "")} readOnly /></Field>
            <Field label="Display Name"><input className={inputCls} value={String(formData.displayName || "")} onChange={(e) => update("displayName", e.target.value)} /></Field>
            <Field label="Email"><input className={inputCls} type="email" value={String(formData.email || "")} onChange={(e) => update("email", e.target.value)} /></Field>
            <Field label="Role">
              <select className={inputCls} value={String(formData.role || "viewer")} onChange={(e) => update("role", e.target.value)}>
                <option value="viewer">Viewer</option>
                <option value="rebate_manager">Rebate Manager</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="New Password (leave blank to keep)">
              <input className={inputCls} type="password" value={String(formData.newPassword || "")} onChange={(e) => update("newPassword", e.target.value)} placeholder="Leave blank to keep current" />
            </Field>
            <Checkbox label="Active" checked={Boolean(formData.isActive)} onChange={(v) => update("isActive", v)} />
          </div>
          <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} />
        </>
      )}
    </ModalShell>
  );
}

// ============================================================================
// Modal Primitives
// ============================================================================
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-brennan-border px-5 py-3.5">
          <h2 className="text-base font-bold text-brennan-text">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-brennan-light hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onClose,
  onSave,
  saving,
  saveLabel = "Save Changes",
}: {
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="mt-4 flex justify-end gap-2 border-t border-brennan-border pt-3">
      <button type="button" onClick={onClose} className="rounded-lg border border-brennan-border bg-white px-4 py-2 text-sm font-medium text-brennan-text transition-colors hover:bg-brennan-light">
        Cancel
      </button>
      <button type="button" disabled={saving} onClick={onSave} className="rounded-lg bg-brennan-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brennan-dark disabled:opacity-50">
        {saving ? "Saving..." : saveLabel}
      </button>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
      <label className="text-sm text-brennan-text">{label}</label>
    </div>
  );
}
