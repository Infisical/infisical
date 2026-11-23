import nodeCrypto from "node:crypto";

// A range response, as the shared request client returns it, that lists password as breached.
export const breachedRangeResponse = (password: string) => {
  const hash = nodeCrypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { data: `${hash.slice(5)}:3\r\n` };
};
