import { PrismaClient } from "@prisma/client";

// Prisma client singleton — avoids exhausting connections during dev hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Neon (serverless Postgres) adds network latency and cold-starts, so the
    // default 2s maxWait to begin an interactive transaction is too tight.
    transactionOptions: { maxWait: 15_000, timeout: 30_000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
