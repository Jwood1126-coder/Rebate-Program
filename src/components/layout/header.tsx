"use client";

import { useSession, signOut } from "next-auth/react";

export function Header() {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "User";
  const userRole = (session?.user as unknown as { role?: string })?.role ?? "";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleLabel: Record<string, string> = {
    admin: "Admin",
    rebate_manager: "Manager",
    viewer: "Viewer",
  };

  return (
    <header className="flex h-11 items-center justify-end border-b border-brennan-border bg-white px-4">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brennan-blue text-[10px] font-medium text-white">
          {initials}
        </div>
        <span className="text-xs text-brennan-text">{userName}</span>
        <span className="text-xs text-gray-400">{roleLabel[userRole] ?? userRole}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="ml-1 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-brennan-light hover:text-brennan-text"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
