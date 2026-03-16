import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// Distributor detail is now handled by the Records page with a distributor filter.
// This page redirects old URLs to the new canonical location.
export default async function DistributorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const distributorId = parseInt(id, 10);

  if (isNaN(distributorId)) {
    redirect("/distributors");
  }

  const distributor = await prisma.distributor.findUnique({
    where: { id: distributorId },
    select: { code: true },
  });

  if (!distributor) {
    redirect("/distributors");
  }

  redirect(`/records?distributor=${distributor.code}`);
}
