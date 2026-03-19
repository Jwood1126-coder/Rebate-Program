import { prisma } from "@/lib/db/client";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

function fmtET(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDateET(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default async function LoginActivityPage() {
  const session = await auth();
  const role = (session?.user as unknown as { role?: string })?.role;
  if (role !== "admin") redirect("/");

  const events = await prisma.loginEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { displayName: true, role: true, email: true } } },
  });

  // Per-user summary
  const userSummary = new Map<
    string,
    { displayName: string; role: string; email: string; loginCount: number; firstLogin: Date; lastLogin: Date }
  >();
  for (const e of events) {
    if (e.action !== "login") continue;
    const existing = userSummary.get(e.username);
    if (!existing) {
      userSummary.set(e.username, {
        displayName: e.user.displayName,
        role: e.user.role,
        email: e.user.email,
        loginCount: 1,
        firstLogin: e.createdAt,
        lastLogin: e.createdAt,
      });
    } else {
      existing.loginCount++;
      if (e.createdAt < existing.firstLogin) existing.firstLogin = e.createdAt;
    }
  }

  // Logins today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const loginsToday = events.filter((e) => e.action === "login" && e.createdAt >= todayStart).length;
  const uniqueToday = new Set(events.filter((e) => e.action === "login" && e.createdAt >= todayStart).map((e) => e.username)).size;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brennan-text">Login Activity</h1>
          <p className="text-sm text-gray-500">All times shown in Eastern Time (ET)</p>
        </div>
        <Link href="/settings" className="text-xs text-brennan-blue hover:underline">← Back to Settings</Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-brennan-border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Users</p>
          <p className="mt-1 text-2xl font-bold text-brennan-text">{userSummary.size}</p>
        </div>
        <div className="rounded-lg border border-brennan-border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Logins Today</p>
          <p className="mt-1 text-2xl font-bold text-brennan-text">{loginsToday}</p>
        </div>
        <div className="rounded-lg border border-brennan-border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Unique Users Today</p>
          <p className="mt-1 text-2xl font-bold text-brennan-text">{uniqueToday}</p>
        </div>
        <div className="rounded-lg border border-brennan-border bg-white p-4">
          <p className="text-xs text-gray-500 uppercase">Total Logins</p>
          <p className="mt-1 text-2xl font-bold text-brennan-text">{events.filter((e) => e.action === "login").length}</p>
        </div>
      </div>

      {/* Per-user summary */}
      <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-brennan-border bg-gray-50">
          <h2 className="text-sm font-semibold text-brennan-text">User Summary</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
              <th className="px-5 py-2">User</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Logins</th>
              <th className="px-3 py-2">First Seen</th>
              <th className="px-3 py-2">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...userSummary.entries()]
              .sort((a, b) => b[1].lastLogin.getTime() - a[1].lastLogin.getTime())
              .map(([username, s]) => (
                <tr key={username} className="hover:bg-gray-50/50">
                  <td className="px-5 py-2">
                    <span className="font-medium">{s.displayName}</span>
                    <span className="ml-1 text-gray-400 text-xs">({username})</span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{s.email}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {s.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{s.loginCount}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtDateET(s.firstLogin)}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="text-gray-700">{fmtET(s.lastLogin)}</span>
                    <span className="ml-1 text-gray-400">({timeAgo(s.lastLogin)})</span>
                  </td>
                </tr>
              ))}
            {userSummary.size === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-400">No login events recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Full event log */}
      <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-brennan-border bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brennan-text">Login Log</h2>
          <span className="text-xs text-gray-400">{events.length} events</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500 uppercase">
              <th className="px-5 py-2">Time (ET)</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Relative</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {events.slice(0, 200).map((e) => (
              <tr key={e.id} className="hover:bg-gray-50/50">
                <td className="px-5 py-1.5 font-mono text-gray-600">{fmtET(e.createdAt)}</td>
                <td className="px-3 py-1.5">
                  <span className="font-medium text-gray-700">{e.user.displayName}</span>
                  <span className="ml-1 text-gray-400">({e.username})</span>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                    {e.user.role}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.action === "login" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {e.action}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-gray-400">{timeAgo(e.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
