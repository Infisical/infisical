import { z } from "zod";

import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";
import { TAgentVaultConnection } from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

/**
 * Seeded into a secret field on edit so the box can show that something is stored without the
 * server ever returning it. Never sent: the sheet maps it back to an omitted key. It is the one value
 * a real secret cannot be, which is the price of letting a single field mean keep, replace and remove.
 * Both halves of a basic credential are secret fields, since the username can be the key.
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

const HOST_LABELS_RE =
  /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

/**
 * A partial pre-check, not an authority: it exists so a malformed host is caught on the step that holds
 * the field rather than bounced back from a submit two steps later. Bracketed IPv6 is passed straight
 * through, since only the server expands it. agent-vault-host-pattern.ts stays the grammar of record and
 * revalidates everything.
 */
const hostSegmentError = (segment: string, seen: Set<string>): string | null => {
  const raw = segment.trim();
  if (!raw) return "Remove the empty entry";
  if (raw.includes("://")) return "Remove the scheme, for example https://";
  if (raw.includes("/"))
    return "A connection covers a whole host, so remove everything from the first /";
  if (raw.startsWith("[")) return null;

  let host = raw;
  let port = "443";
  const colonIdx = raw.lastIndexOf(":");
  if (colonIdx !== -1) {
    host = raw.slice(0, colonIdx);
    port = raw.slice(colonIdx + 1);
    const parsed = Number(port);
    if (!/^\d+$/.test(port) || parsed < 1 || parsed > 65535) return `"${raw}" has an invalid port`;
  }

  host = host.replace(/\.$/, "").toLowerCase();
  if (host === "*" || host === "*.") return "Name specific hosts. A bare wildcard is too broad.";
  if (!HOST_LABELS_RE.test(host)) return `"${raw}" is not a valid host`;

  const key = `${host}:${port}`;
  if (seen.has(key)) return `"${raw}" is listed more than once`;
  seen.add(key);

  return null;
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
// from an empty box. On create there is nothing stored and the field means itself. On edit, a field
// left alone keeps what is stored and an emptied one removes that half, so tabbing through a field
// can never wipe a credential.
export const buildConnectionSchema = (connection?: TAgentVaultConnection | null) =>
  z
    .object({
      name: slugSchema({ max: 64, field: "Name" }),
      hostPattern: z
        .string()
        .trim()
        .min(1, "Required")
        .max(1024)
        .superRefine((value, ctx) => {
          const seen = new Set<string>();

          value.split(",").forEach((segment) => {
            const error = hostSegmentError(segment, seen);
            if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
          });
        }),
      credentialType: z.nativeEnum(AgentVaultCredentialType),
      headerName: z
        .string()
        .trim()
        .max(128)
        // Matches the backend rule. Go's HTTP client refuses any other character, so a name that saves
        // here would 502 every request through the connection.
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

      // Neither half is ever returned, so on edit an untouched box may hold either something or
      // nothing. Only two emptied boxes are refused here; one emptied box beside an untouched one is
      // left to the server, which has the stored pair.
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
