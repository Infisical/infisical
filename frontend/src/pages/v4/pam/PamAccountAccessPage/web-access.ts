import { z } from "zod";

import { PamPolicyType, type TPamAccount } from "@app/hooks/api/pam";

const policyOf = (account: TPamAccount, policy: PamPolicyType) =>
  (account.templatePolicies as Record<string, unknown> | null)?.[policy];

export const requiresReason = (account: TPamAccount) =>
  policyOf(account, PamPolicyType.RequireReason) === true;

export const requiresMfa = (account: TPamAccount) =>
  policyOf(account, PamPolicyType.RequireMfa) === true;

type TAccessError = {
  response?: { data?: { error?: string; details?: { mfaSessionId?: string } } };
};

export const accessErrorCode = (error: unknown) => (error as TAccessError)?.response?.data?.error;

// An MFA-gated request answers SESSION_MFA_REQUIRED with a fresh MFA session to verify
export const mfaSessionIdOf = (error: unknown) =>
  accessErrorCode(error) === "SESSION_MFA_REQUIRED"
    ? (error as TAccessError).response?.data?.details?.mfaSessionId
    : undefined;

export const MFA_FAILED = {
  blocked: "Allow pop-ups for this site to complete MFA verification, then try again.",
  failed: "MFA verification timed out or failed. Please try again."
} as const;

export enum WsMessageType {
  Ready = "ready",
  Output = "output",
  Input = "input",
  Control = "control",
  Resize = "resize",
  SessionEnd = "session_end"
}

export const WebAccessServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum([WsMessageType.Ready, WsMessageType.Output]),
    data: z.string(),
    prompt: z.string()
  }),
  z.object({ type: z.literal(WsMessageType.SessionEnd), reason: z.string() })
]);
