import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "production") {
  if (
    !global.prismaGlobal ||
    typeof global.prismaGlobal.generatedCoupon === "undefined"
  ) {
    global.prismaGlobal?.$disconnect().catch(() => {});
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
