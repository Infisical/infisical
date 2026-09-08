import { z } from "zod";

import { addHostListIssues } from "@app/helpers/agentVaultHostPattern";
import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";
import { TAgentVaultConnection } from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

/**
 * Seeded into a secret field on edit so the box can show that something is stored without the server
 * returning it. Never sent: the sheet maps it back to an omitted key.
 */
export const UNCHANGED_SECRET = "__INFISICAL_UNCHANGED__";

/** The API stores :443 explicitly, so it is stripped wherever a host pattern is shown and put back on save. */
export const displayHostPattern = (hostPattern: string) =>
  hostPattern
    .split(",")
    .map((host) => host.trim().replace(/:443$/, ""))
    .join(", ");

export const CREDENTIAL_LABELS: Record<AgentVaultCredentialType, string> = {
  [AgentVaultCredentialType.Bearer]: "Bearer",
  [AgentVaultCredentialType.Basic]: "Basic Auth",
  [AgentVaultCredentialType.Passthrough]: "Pass-through"
};

export enum ConnectionStep {
  Template = "template",
  Details = "details",
  Credential = "credential",
  Review = "review"
}

export const CONNECTION_STEP_FIELDS: Record<ConnectionStep, string[]> = {
  [ConnectionStep.Template]: [],
  [ConnectionStep.Details]: ["name", "hostPattern"],
  [ConnectionStep.Credential]: [
    "credentialType",
    "headerName",
    "headerPrefix",
    "username",
    "secret"
  ],
  [ConnectionStep.Review]: []
};

export const buildConnectionSchema = (connection?: TAgentVaultConnection | null) =>
  z
    .object({
      name: slugSchema({ max: 64, field: "Name" }),
      hostPattern: z.string().trim().min(1, "Required").max(1024).superRefine(addHostListIssues),
      credentialType: z.nativeEnum(AgentVaultCredentialType),
      headerName: z
        .string()
        .trim()
        .max(128)
        .regex(
          /^[A-Za-z0-9!#$%&'*+.^_`|~-]*$/,
          "A header name can't contain spaces or colons. Use letters, digits and dashes, as in X-API-Key."
        )
        .optional(),
      headerPrefix: z.string().trim().max(64).optional(),
      username: z.string().trim().max(256).optional(),
      secret: z.string().max(8192).optional()
    })
    .superRefine((data, ctx) => {
      if (data.credentialType === AgentVaultCredentialType.Passthrough) return;

      const isUnchanged = data.secret === UNCHANGED_SECRET;

      const typeChanged =
        Boolean(connection) && connection?.credential.type !== data.credentialType;

      if (data.credentialType === AgentVaultCredentialType.Bearer) {
        if ((!connection || typeChanged) && !data.secret) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secret"], message: "Required" });
        }
        return;
      }

      const willHaveUsername = data.username === UNCHANGED_SECRET ? true : Boolean(data.username);
      const willHavePassword = isUnchanged ? true : Boolean(data.secret);
      if (
        typeChanged
          ? Boolean(data.username) || Boolean(data.secret)
          : willHaveUsername || willHavePassword
      ) {
        return;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["username"],
        message: "Enter a username, a password, or both."
      });
    });

export type TConnectionForm = z.infer<ReturnType<typeof buildConnectionSchema>>;
