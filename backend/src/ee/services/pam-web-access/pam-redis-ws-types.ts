import { z } from "zod";

import { rawBufferToString, WsMessageType } from "./pam-ws-shared-types";

// Redis accepts input and control only (command-line REPL, no PTY resize)
export const RedisClientMessageSchema = z.object({
  type: z.enum([WsMessageType.Input, WsMessageType.Control]),
  data: z.string()
});

export type TRedisClientMessage = z.infer<typeof RedisClientMessageSchema>;

export const parseRedisClientMessage = (rawData: Buffer | ArrayBuffer | Buffer[]): TRedisClientMessage | null => {
  const str = rawBufferToString(rawData);
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return null;
  }
  const result = RedisClientMessageSchema.safeParse(parsed);
  return result.success ? result.data : null;
};
