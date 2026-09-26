import { createHash } from "node:crypto";

export const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");
