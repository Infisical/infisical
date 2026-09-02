import { z } from "zod";

import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";
import { TAgentVaultConnection } from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

export const CREDENTIAL_LABELS: Record<AgentVaultCredentialType, string> = {
  [AgentVaultCredentialType.Bearer]: "Bearer",
  [AgentVaultCredentialType.Basic]: "Basic",
  [AgentVaultCredentialType.Passthrough]: "Pass-through"
};

export enum ConnectionStep {
  Template = "template",
  Credential = "credential",
  Scope = "scope",
  Review = "review"
}

export const CONNECTION_STEP_FIELDS: Record<ConnectionStep, string[]> = {
  [ConnectionStep.Template]: [],
  [ConnectionStep.Credential]: [
    "credentialType",
    "headerName",
    "headerPrefix",
    "username",
    "secret"
  ],
  [ConnectionStep.Scope]: ["hostPattern"],
  [ConnectionStep.Review]: ["name"]
};

const credentialSettingsDiffer = (
  data: {
    credentialType: AgentVaultCredentialType;
    headerName?: string;
    headerPrefix?: string;
    username?: string;
  },
  connection: TAgentVaultConnection
) => {
  const stored = connection.credential;
  if (data.credentialType !== stored.type) return true;
  if (stored.type === AgentVaultCredentialType.Bearer) {
    return (
      (data.headerName || "Authorization") !== stored.headerName ||
      (data.headerPrefix ?? "") !== stored.headerPrefix
    );
  }
  if (stored.type === AgentVaultCredentialType.Basic) return data.username !== stored.username;
  return false;
};

// The secret rules depend on whether a connection already exists: required on create, and on edit
// required again whenever the settings that govern how it is sent change, because the API replaces
// the credential as a whole or not at all. Keeping them in the schema means Continue blocks on the
// step that owns the field and onFormInvalid jumps there, rather than Save failing silently.
export const buildConnectionSchema = (connection?: TAgentVaultConnection | null) =>
  z
    .object({
      name: slugSchema({ max: 64, field: "Name" }),
      hostPattern: z
        .string()
        .trim()
        .min(1, "Required")
        .max(1024)
        .refine((value) => !value.includes("://"), "Remove the scheme, for example https://")
        .refine(
          (value) => !value.includes("/"),
          "A connection covers a whole host, so remove everything from the first /"
        )
        .refine(
          (value) => value.split(",").every((entry) => entry.trim().length > 0),
          "Remove the empty entry"
        )
        .refine(
          (value) =>
            value.split(",").every((entry) => entry.trim() !== "*" && entry.trim() !== "*."),
          "Name specific hosts. A bare wildcard is too broad."
        ),
      credentialType: z.nativeEnum(AgentVaultCredentialType),
      headerName: z.string().trim().max(128).optional(),
      headerPrefix: z.string().trim().max(64).optional(),
      username: z.string().trim().max(256).optional(),
      secret: z.string().max(8192).optional()
    })
    .superRefine((data, ctx) => {
      const needsSecret = data.credentialType !== AgentVaultCredentialType.Passthrough;

      if (data.credentialType === AgentVaultCredentialType.Basic && !data.username) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["username"], message: "Required" });
      }

      if (!needsSecret || data.secret) return;

      if (!connection) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secret"], message: "Required" });
      } else if (credentialSettingsDiffer(data, connection)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["secret"],
          message: "Enter the secret again to change how it is sent."
        });
      }
    });

export type TConnectionForm = z.infer<ReturnType<typeof buildConnectionSchema>>;
