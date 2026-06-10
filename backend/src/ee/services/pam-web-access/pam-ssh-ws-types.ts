import { z } from "zod";

export enum SshClientMessageType {
  Input = "input",
  Control = "control",
  Resize = "resize"
}

const InputSchema = z.object({ type: z.literal(SshClientMessageType.Input), data: z.string() });
const ControlSchema = z.object({ type: z.literal(SshClientMessageType.Control), data: z.string() });
const ResizeSchema = z.object({ type: z.literal(SshClientMessageType.Resize), data: z.string() });

export const SshClientMessageSchema = z.discriminatedUnion("type", [InputSchema, ControlSchema, ResizeSchema]);
