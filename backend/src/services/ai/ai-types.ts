import { z } from "zod";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";

export type TAiToolDeps = {
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "runWithPoolFailover">;
  signal?: AbortSignal;
};

export type TAiToolResult = { result: unknown; summary: string };

// A read-only lookup an app connection offers to every AI feature
export type TAppConnectionAiTool<TConn, TInput extends z.AnyZodObject = z.AnyZodObject> = {
  description: string;
  inputSchema: TInput;
  run: (conn: TConn, input: z.infer<TInput>, deps: TAiToolDeps) => Promise<TAiToolResult>;
};

export const defineAiTool = <TConn, TInput extends z.AnyZodObject>(tool: TAppConnectionAiTool<TConn, TInput>) => tool;

// A tool bound to one connection, ready to hand to a model
export type TAiTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  connectionId: string;
  connectionName: string;
  run: (input: unknown, signal?: AbortSignal) => Promise<TAiToolResult>;
};

export type TAiJudgeToolCall = {
  tool: string;
  connectionId: string | null;
  connectionName: string | null;
  input: unknown;
  summary: string | null;
  error: string | null;
  // Kept in stored evidence for audit, never returned by the API
  result?: unknown;
};

export type TAiJudgeResult = {
  approve: boolean;
  reason: string;
  model: string;
  toolCalls: TAiJudgeToolCall[];
  // Set when the AI couldn't decide, which never approves
  error: string | null;
};

export type TAiRequestContext = {
  policyType: string;
  policyName: string;
  requester: { name: string | null; email: string | null };
  justification: string | null;
  duration: string | null;
  details: unknown;
  inputs: { label: string; value: string; connectionName: string | null }[];
};
