import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { env } from "../env";
import { PrismaClient } from "../generated/prisma/client";

// Prisma 7 talks to the database through a driver adapter. The SQLite path is relative to server/.
export const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: env.DATABASE_URL }) });

/**
 * Convert a value to something Prisma accepts for a Json column. The JSON round-trip drops
 * `undefined` fields (e.g. missing token counts), which Prisma's JSON input type rejects.
 */
export const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as import("../generated/prisma/client").Prisma.InputJsonValue;
