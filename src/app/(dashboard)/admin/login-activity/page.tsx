import { prisma } from "@/lib/db/client";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LoginActivityPage() {
  const session = await auth();
  const role = (session?.user as unknown as { role?: string })?.role;
  if (role !== "admin") redirect("/");

  const events = await prisma.loginEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { displayName: true, role: true } } },
  });

  // Compute per-user summary
  const userSummary = new Map<string, { displayName: string; role: string; loginCount: number; lastLogin: Date }>();
  for (const e of events) {
    if (e.action !== "login") continue;
    const existing = userSummary.get(e.username);
    if (!existing) {
      userSummary.set(e.username, {
        displayName: e.user.displayName,
        role: e.user.role,
        loginCount: 1,
        lastLogin: e.createdAt,
      });
    } else {
      existing.loginCount++;
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brennan-text">Login Activity</h1>
          <p className="text-sm text-gray-500">Admin only — tracks who logged in and when.</p>
        </div>
        <Link href="/" className="text-xs text-brennan-blue hover:underline">← Dashboard</Link>
      </div>

      {/* Per-user summary */}
      <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-brennan-border bg-gray-50">
          <h2 className="text-sm font-semibold text-brennan-text">User Summary</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-2">User</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Logins</th>
              <th className="px-3 py-2">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...userSummary.entries()].map(([username, s]) => (
              <tr key={username}>
                <td className="px-4 py-2 font-medium">{s.displayName} <span className="text-gray-400">({username})</span></td>
                <td className="px-3 py-2 text-gray-500">{s.role}</td>
                <td className="px-3 py-2 text-right font-medium">{s.loginCount}</td>
                <td className="px-3 py-2 text-gray-500">{s.lastLogin.toLocaleString()}</td>
              </tr>
            ))}
            {userSummary.size === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No login events recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Full event log */}
      <div className="rounded-lg border border-brennan-border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-brennan-border bg-gray-50">
          <h2 className="text-sm font-semibold text-brennan-text">Recent Logins ({events.length})</h2>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500 uppercase">
              <th className="px-4 py-2">User</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {events.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-1.5">
                  <span className="font-medium">{e.user.displayName}</span>
                  <span className="text-gray-400 ml-1">({e.username})</span>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.action === "login" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {e.action}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-gray-500">{e.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
