import { z } from "zod";

import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";
import { TAgentVaultConnection } from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

/**
 * Seeded into the secret field on edit so the box can show that something is stored without the
 * server ever returning it. Never sent: the sheet maps it back to an omitted key. It is the one value
 * a real secret cannot be, which is the price of letting a single field mean keep, replace and remove.
 */
export const UNCHANGED_SECRET = "__INFISICAL_UNCHANGED__";

/**
 * 443 is the only port the grammar accepts without saying so, and the API stores it explicitly, so
 * every host would otherwise carry a `:443` nobody typed. Stripped wherever a host pattern is shown,
 * including the form, since the API puts it back on save.
 */
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
      secret: z.string().max(8192).optional()
    })
    .superRefine((data, ctx) => {
      if (data.credentialType === AgentVaultCredentialType.Passthrough) return;

      const isUnchanged = data.secret === UNCHANGED_SECRET;

      // A different type from the stored one leaves the sealed secret shaped for the credential being
      // replaced, so it has to be supplied again whatever the type.
      const typeChanged =
        Boolean(connection) && connection?.credential.type !== data.credentialType;

      if (data.credentialType === AgentVaultCredentialType.Bearer) {
        // Emptying the box is how a password is removed, and a bearer token cannot be removed — a
        // header with nothing after the prefix authenticates nobody, which is what Pass-through is for.
        // So on edit an empty box simply keeps the stored token, and only a create can be short one.
        if ((!connection || typeChanged) && !data.secret) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secret"], message: "Required" });
        }
        return;
      }

      if (typeChanged && !data.username && !data.secret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["username"],
          message: "Enter a username, a password, or both."
        });
        return;
      }

      const willHavePassword = isUnchanged ? true : Boolean(data.secret);
      if (data.username || willHavePassword) return;

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["username"],
        message: "Enter a username, a password, or both."
      });
    });

export type TConnectionForm = z.infer<ReturnType<typeof buildConnectionSchema>>;
