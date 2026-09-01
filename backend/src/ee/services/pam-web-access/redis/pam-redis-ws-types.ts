import { z } from "zod";

export enum RedisClientMessageType {
  Input = "input",
  Control = "control"
}

const InputSchema = z.object({ type: z.literal(RedisClientMessageType.Input), data: z.string() });
const ControlSchema = z.object({ type: z.literal(RedisClientMessageType.Control), data: z.string() });

export const RedisClientMessageSchema = z.discriminatedUnion("type", [InputSchema, ControlSchema]);
