import { z } from "zod";

import { addHostListIssues } from "@app/helpers/agentVaultHostPattern";
import { addPathPrefixIssues } from "@app/helpers/agentVaultPathPrefix";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultSubstitutionSurface
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";
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

export const HTTP_METHODS = Object.values(AgentVaultHttpMethod);

// Mirrors AGENT_VAULT_MAX_HEADERS / AGENT_VAULT_MAX_SUBSTITUTIONS / AGENT_VAULT_MAX_PATH_PREFIXES on the
// backend. Without these the only thing enforcing the cap is the server, and its rejection names an array
// root that no field renders.
export const MAX_HEADERS = 20;
export const MAX_SUBSTITUTIONS = 20;
export const MAX_PATH_PREFIXES = 20;

export const SURFACE_LABELS: Record<AgentVaultSubstitutionSurface, string> = {
  [AgentVaultSubstitutionSurface.Path]: "Path",
  [AgentVaultSubstitutionSurface.Query]: "Query",
  [AgentVaultSubstitutionSurface.Header]: "Header",
  [AgentVaultSubstitutionSurface.Body]: "Body"
};

// Mirrors AGENT_VAULT_NO_CONTROL_CHARS_RE on the backend. A pasted key with a trailing newline is the
// common case, and it saves fine but then makes Go refuse to send the header.
// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS_RE = /^[^\x00-\x1f\x7f]*$/;

const CONTROL_CHARS_MESSAGE =
  "This can't contain line breaks or other control characters. Check for a stray newline if you pasted it.";

// Set by the proxy on every request, so naming one here would either be dropped or corrupt the request.
const RESERVED_HEADER_NAMES = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "proxy-connection",
  "upgrade",
  "te",
  "trailer",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization"
]);

export enum ServiceStep {
  Template = "template",
  Details = "details",
  Credential = "credential",
  Transformations = "transformations",
  Review = "review"
}

export const SERVICE_STEP_FIELDS: Record<ServiceStep, string[]> = {
  [ServiceStep.Template]: [],
  [ServiceStep.Details]: [
    "name",
    "hostPattern",
    "allMethods",
    "methods",
    "allPaths",
    "pathPrefixes"
  ],
  [ServiceStep.Credential]: ["credentialType", "headerName", "headerPrefix", "username", "secret"],
  [ServiceStep.Transformations]: ["headers", "substitutions"],
  [ServiceStep.Review]: []
};

export const buildServiceSchema = (service?: TAgentVaultService | null) =>
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
      secret: z.string().max(8192).optional(),
      allMethods: z.boolean(),
      methods: z.array(z.nativeEnum(AgentVaultHttpMethod)),
      allPaths: z.boolean(),
      pathPrefixes: z
        .array(z.object({ value: z.string() }))
        .max(MAX_PATH_PREFIXES, `You can add at most ${MAX_PATH_PREFIXES} path prefixes.`),
      headers: z
        .array(
          z.object({
            id: z.string().optional(),
            name: z.string().trim().max(128),
            prefix: z.string().trim().max(64),
            value: z.string().max(8192)
          })
        )
        .max(MAX_HEADERS, `You can add at most ${MAX_HEADERS} headers.`),
      substitutions: z
        .array(
          z.object({
            id: z.string().optional(),
            placeholder: z.string().trim().max(255),
            value: z.string().max(8192),
            surfaces: z.array(z.nativeEnum(AgentVaultSubstitutionSurface))
          })
        )
        .max(MAX_SUBSTITUTIONS, `You can add at most ${MAX_SUBSTITUTIONS} substitutions.`)
    })
    .superRefine((data, ctx) => {
      if (!data.allMethods && data.methods.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["methods"],
          message: "Select at least one method."
        });
      }

      if (!data.allPaths) {
        if (data.pathPrefixes.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["pathPrefixes"],
            message: "Add at least one path prefix."
          });
        }
        addPathPrefixIssues(data.pathPrefixes, ctx, ["pathPrefixes"]);
      }

      let credentialHeader: string | null = null;
      if (data.credentialType === AgentVaultCredentialType.Bearer) {
        credentialHeader = data.headerName || "Authorization";
      } else if (data.credentialType === AgentVaultCredentialType.Basic) {
        credentialHeader = "Authorization";
      }

      const seenHeaders = new Set<string>();
      data.headers.forEach((header, index) => {
        const at = (field: string, message: string) =>
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["headers", index, field], message });

        if (!header.name) {
          at("name", "Required");
        } else if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(header.name)) {
          at(
            "name",
            "A header name can't contain spaces or colons. Use letters, digits and dashes."
          );
        } else if (RESERVED_HEADER_NAMES.has(header.name.toLowerCase())) {
          at("name", "This header is set by the proxy and can't be overridden.");
        } else if (
          credentialHeader &&
          header.name.toLowerCase() === credentialHeader.toLowerCase()
        ) {
          at("name", `The ${credentialHeader} header is already set by the credential.`);
        } else if (seenHeaders.has(header.name.toLowerCase())) {
          at("name", "This header is listed twice.");
        }
        seenHeaders.add(header.name.toLowerCase());

        if (!header.value) at("value", "Required");
        else if (!NO_CONTROL_CHARS_RE.test(header.value)) at("value", CONTROL_CHARS_MESSAGE);

        if (header.prefix && !NO_CONTROL_CHARS_RE.test(header.prefix)) {
          at("prefix", CONTROL_CHARS_MESSAGE);
        }
      });

      const seenPlaceholders = new Set<string>();
      data.substitutions.forEach((substitution, index) => {
        const at = (field: string, message: string) =>
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["substitutions", index, field],
            message
          });

        if (!substitution.placeholder) {
          at("placeholder", "Required");
        } else if (!NO_CONTROL_CHARS_RE.test(substitution.placeholder)) {
          at("placeholder", CONTROL_CHARS_MESSAGE);
        } else if (seenPlaceholders.has(substitution.placeholder)) {
          at("placeholder", "This placeholder is listed twice.");
        }
        seenPlaceholders.add(substitution.placeholder);

        if (!substitution.value) at("value", "Required");
        else if (!NO_CONTROL_CHARS_RE.test(substitution.value)) at("value", CONTROL_CHARS_MESSAGE);
        if (substitution.surfaces.length === 0) {
          at("surfaces", "Pick at least one place to look for the placeholder.");
        }
      });

      if (data.credentialType === AgentVaultCredentialType.Passthrough) return;

      const isUnchanged = data.secret === UNCHANGED_SECRET;

      const typeChanged = Boolean(service) && service?.credential.type !== data.credentialType;

      if (data.credentialType === AgentVaultCredentialType.Bearer) {
        if ((!service || typeChanged) && !data.secret) {
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

export type TServiceForm = z.infer<ReturnType<typeof buildServiceSchema>>;
