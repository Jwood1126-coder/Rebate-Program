// List all column mappings across all distributors.
// GET — returns all active mappings with distributor info.

import { prisma } from "@/lib/db/client";
import { NextResponse } from "next/server";

export async function GET() {
  const mappings = await prisma.distributorColumnMapping.findMany({
    where: { isActive: true },
    include: {
      distributor: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ distributor: { code: "asc" } }, { fileType: "asc" }],
  });

  return NextResponse.json(mappings);
}
