import { z } from "zod";

import { rawBufferToString, WsMessageType } from "./pam-ws-shared-types";

// SSH accepts input, control, and resize (raw keystroke forwarding with PTY resize)
export const SshClientMessageSchema = z.object({
  type: z.enum([WsMessageType.Input, WsMessageType.Control, WsMessageType.Resize]),
  data: z.string()
});

export type TSshClientMessage = z.infer<typeof SshClientMessageSchema>;

export const parseSshClientMessage = (rawData: Buffer | ArrayBuffer | Buffer[]): TSshClientMessage | null => {
  const str = rawBufferToString(rawData);
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return null;
  }
  const result = SshClientMessageSchema.safeParse(parsed);
  return result.success ? result.data : null;
};
