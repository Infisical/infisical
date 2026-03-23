import { z } from "zod";

// Redis accepts input and control only (command-line REPL, no PTY resize)

const InputSchema = z.object({ type: z.literal("input"), data: z.string() });
const ControlSchema = z.object({ type: z.literal("control"), data: z.string() });

export const RedisClientMessageSchema = z.discriminatedUnion("type", [InputSchema, ControlSchema]);

export type TRedisClientMessage = z.infer<typeof RedisClientMessageSchema>;
