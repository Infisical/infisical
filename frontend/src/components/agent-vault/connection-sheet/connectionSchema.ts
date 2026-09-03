import { z } from "zod";

import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";
import { TAgentVaultConnection } from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

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

// The secret is write-only, so the form has to say what should happen to it rather than infer that
// from an empty box. On create there is nothing stored and the field means itself. On edit, blank
// keeps the stored secret and `clearPassword` is the only way to remove one, so tabbing through the
// field can never wipe a credential.
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
      secret: z.string().max(8192).optional(),
      clearPassword: z.boolean().optional()
    })
    .superRefine((data, ctx) => {
      if (data.credentialType === AgentVaultCredentialType.Passthrough) return;

      if (data.credentialType === AgentVaultCredentialType.Bearer) {
        // A bearer header with nothing after the prefix authenticates nobody, so a create must carry
        // one. An edit may leave it blank, which keeps what is stored.
        if (!connection && !data.secret) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secret"], message: "Required" });
        }
        return;
      }

      const storedHasPassword =
        connection?.credential.type === AgentVaultCredentialType.Basic &&
        connection.credential.hasPassword;
      const willHavePassword = data.clearPassword
        ? false
        : Boolean(data.secret) || storedHasPassword;

      if (!data.username && !willHavePassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["username"],
          message: "Enter a username, a password, or both."
        });
      }
    });

export type TConnectionForm = z.infer<ReturnType<typeof buildConnectionSchema>>;
