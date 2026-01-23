import { z } from "zod";

export const zodBuffer = z.custom<Buffer>((data) => Buffer.isBuffer(data) || data instanceof Uint8Array, {
  message: "Expected binary data (Buffer Or Uint8Array)"
});
