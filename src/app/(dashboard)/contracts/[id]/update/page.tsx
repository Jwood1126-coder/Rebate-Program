import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { ContractUpdateUploadClient } from "@/components/contracts/contract-update-upload-client";

export const dynamic = "force-dynamic";

export default async function ContractUpdatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contractId = parseInt(id, 10);
  if (isNaN(contractId)) notFound();

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      distributor: { select: { code: true, name: true } },
      endUser: { select: { name: true } },
      rebatePlans: {
        where: { status: "active" },
        select: { id: true, planCode: true, planName: true },
      },
    },
  });

  if (!contract) notFound();

  return (
    <ContractUpdateUploadClient
      contract={{
        id: contract.id,
        contractNumber: contract.contractNumber,
        contractType: contract.contractType,
        distributor: contract.distributor,
        endUser: contract.endUser,
        plans: contract.rebatePlans,
      }}
    />
  );
}
