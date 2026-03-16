import { prisma } from "@/lib/db/client";
import { NextResponse } from "next/server";

export async function GET() {
  const items = await prisma.item.findMany({
    orderBy: { itemNumber: "asc" },
  });

  return NextResponse.json(items);
}
