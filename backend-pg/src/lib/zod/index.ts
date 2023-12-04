import { z } from "zod";

// this is a patched zod string to remove empty string to undefined
export const zpStr = <T extends z.ZodString>(
  schema: T,
  opt: { stripNull: boolean } = { stripNull: true }
) =>
  z.preprocess((val) => {
    if (opt.stripNull && val === null) return undefined;
    if (typeof val !== "string") return val;
    return val.trim() || undefined;
  }, schema);
