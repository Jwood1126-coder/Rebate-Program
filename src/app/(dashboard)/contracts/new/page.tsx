// Contract Setup Wizard — /contracts/new
// Guides user through: Distributor + End User → Contract → Plan → Line Items
// This is the "Part 1" of the rebate workflow (before claims can be reconciled).

import { prisma } from "@/lib/db/client";
import ContractWizardClient from "@/components/contracts/contract-wizard-client";

export const dynamic = "force-dynamic";

export default async function NewContractPage() {
  const [distributors, endUsers, items] = await Promise.all([
    prisma.distributor.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.endUser.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { itemNumber: "asc" },
      select: { id: true, itemNumber: true, description: true, productCode: true },
    }),
  ]);

  return (
    <ContractWizardClient
      distributors={distributors}
      endUsers={endUsers}
      items={items}
    />
  );
}
