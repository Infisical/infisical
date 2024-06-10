import { z, ZodTypeAny } from "zod";

// this is a patched zod string to remove empty string to undefined
export const zpStr = <T extends ZodTypeAny>(schema: T, opt: { stripNull: boolean } = { stripNull: true }) =>
  z.preprocess((val) => {
    if (opt.stripNull && val === null) return undefined;
    if (typeof val !== "string") return val;
    return val.trim() || undefined;
  }, schema);

export const zodBuffer = z.custom<Buffer>((data) => Buffer.isBuffer(data) || data instanceof Uint8Array, {
  message: "Expected binary data (Buffer Or Uint8Array)"
});
