import { prisma } from "@/lib/db/client";
import { auth } from "@/lib/auth";
import { SettingsPageClient } from "@/components/settings/settings-page-client";
import type { UserRole } from "@/lib/constants/statuses";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const role = (session?.user as unknown as { role: UserRole })?.role;

  // Fetch entity counts for the overview
  const [distributorCount, contractCount, planCount, itemCount, endUserCount, userCount] =
    await Promise.all([
      prisma.distributor.count(),
      prisma.contract.count(),
      prisma.rebatePlan.count(),
      prisma.item.count(),
      prisma.endUser.count(),
      prisma.user.count(),
    ]);

  return (
    <SettingsPageClient
      role={role}
      counts={{
        distributors: distributorCount,
        contracts: contractCount,
        plans: planCount,
        items: itemCount,
        endUsers: endUserCount,
        users: userCount,
      }}
    />
  );
}
