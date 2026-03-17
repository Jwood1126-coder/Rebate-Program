import { prisma } from "@/lib/db/client";
import { auth } from "@/lib/auth";
import { SettingsPageClient } from "@/components/settings/settings-page-client";
import type { UserRole } from "@/lib/constants/statuses";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const role = (session?.user as unknown as { role: UserRole })?.role;

  // Fetch entity counts, distributors, and existing column mappings
  const [
    distributorCount, contractCount, planCount, itemCount, endUserCount, userCount,
    distributors,
    existingMappings,
  ] = await Promise.all([
    prisma.distributor.count(),
    prisma.contract.count(),
    prisma.rebatePlan.count(),
    prisma.item.count(),
    prisma.endUser.count(),
    prisma.user.count(),
    prisma.distributor.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.distributorColumnMapping.findMany({
      where: { isActive: true },
      include: {
        distributor: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ distributor: { code: "asc" } }, { fileType: "asc" }],
    }),
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
      distributors={distributors}
      existingMappings={JSON.parse(JSON.stringify(existingMappings))}
    />
  );
}
