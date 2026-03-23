import { z } from "zod";

// SSH accepts input, control, and resize (raw keystroke forwarding with PTY resize)

const InputSchema = z.object({ type: z.literal("input"), data: z.string() });
const ControlSchema = z.object({ type: z.literal("control"), data: z.string() });
const ResizeSchema = z.object({ type: z.literal("resize"), data: z.string() });

export const SshClientMessageSchema = z.discriminatedUnion("type", [InputSchema, ControlSchema, ResizeSchema]);

export type TSshClientMessage = z.infer<typeof SshClientMessageSchema>;
