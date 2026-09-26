import { PrismaClient } from "@prisma/client";

// Next.js hot-reloads server modules in development, which would otherwise
// create a new PrismaClient (and a new DB connection pool) on every file
// save. Stashing the client on `globalThis` survives the reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
