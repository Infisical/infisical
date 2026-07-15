import RE2 from "re2";
import { z } from "zod";

import { ProxiedServiceCredentialsSchema, ProxiedServicesSchema } from "@app/db/schemas";
import { PROXIED_SERVICES } from "@app/lib/api-docs";

import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "./proxied-service-enums";

const HOST_LABELS_RE = new RE2(/^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i);
const PORT_RE = new RE2(/^\d+$/);
const IPV6_SCHEMA = z.string().ip({ version: "v6" });

const isValidPort = (portStr: string) => {
  const port = Number(portStr);
  return PORT_RE.test(portStr) && port >= 1 && port <= 65535;
};

// matching grammar lives in the agent-proxy CLI (packages/agentproxy/match.go); keep the two in sync
export const hostPatternSchema = z
  .string()
  .trim()
  .min(1, "Host pattern is required")
  .max(255)
  .superRefine((raw, ctx) => {
    const segments = raw.split(",").map((s) => s.trim());
    segments.forEach((seg) => {
      if (seg === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Host pattern has an empty entry" });
        return;
      }
      if (seg.includes("://")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" must not include a scheme (e.g. https://)` });
        return;
      }
      let hostPort = seg;
      const slashIdx = hostPort.indexOf("/");
      if (slashIdx !== -1) hostPort = hostPort.slice(0, slashIdx);

      // bracketed IPv6 (e.g. [::1] or [2001:db8::1]:8443); brackets disambiguate the port colon
      if (hostPort.startsWith("[")) {
        const closingIdx = hostPort.indexOf("]");
        if (closingIdx === -1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" has an unclosed IPv6 bracket` });
          return;
        }
        if (!IPV6_SCHEMA.safeParse(hostPort.slice(1, closingIdx)).success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" is not a valid IPv6 address` });
          return;
        }
        const afterBracket = hostPort.slice(closingIdx + 1);
        if (afterBracket && (!afterBracket.startsWith(":") || !isValidPort(afterBracket.slice(1)))) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" has an invalid port` });
        }
        return;
      }

      let host = hostPort;
      const colonIdx = hostPort.lastIndexOf(":");
      if (colonIdx !== -1) {
        host = hostPort.slice(0, colonIdx);
        if (!isValidPort(hostPort.slice(colonIdx + 1))) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" has an invalid port` });
          return;
        }
      }
      if (!HOST_LABELS_RE.test(host)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" is not a valid host pattern` });
      }
    });
  });

const DynamicSecretConfigSchema = z
  .object({
    namespace: z.string().trim().min(1).optional(),
    principals: z.array(z.string().trim().min(1)).optional()
  })
  .strict();

const CredentialInputSchema = z
  .object({
    secretKey: z.string().trim().min(1).max(255).optional().describe(PROXIED_SERVICES.CREDENTIAL.secretKey),
    dynamicSecretName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .describe(PROXIED_SERVICES.CREDENTIAL.dynamicSecretName),
    dynamicSecretField: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .describe(PROXIED_SERVICES.CREDENTIAL.dynamicSecretField),
    dynamicSecretConfig: DynamicSecretConfigSchema.optional().describe(PROXIED_SERVICES.CREDENTIAL.dynamicSecretConfig),
    role: z.nativeEnum(ProxiedServiceCredentialRole).describe(PROXIED_SERVICES.CREDENTIAL.role),
    headerName: z.string().trim().min(1).max(255).optional().describe(PROXIED_SERVICES.CREDENTIAL.headerName),
    headerPrefix: z.string().trim().max(255).optional().describe(PROXIED_SERVICES.CREDENTIAL.headerPrefix),
    headerPurpose: z
      .nativeEnum(ProxiedServiceHeaderPurpose)
      .optional()
      .describe(PROXIED_SERVICES.CREDENTIAL.headerPurpose),
    placeholderKey: z.string().trim().min(1).max(255).optional().describe(PROXIED_SERVICES.CREDENTIAL.placeholderKey),
    placeholderValue: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .describe(PROXIED_SERVICES.CREDENTIAL.placeholderValue),
    substitutionSurfaces: z
      .array(z.nativeEnum(ProxiedServiceSubstitutionSurface))
      .nonempty()
      .optional()
      .describe(PROXIED_SERVICES.CREDENTIAL.substitutionSurfaces)
  })
  .superRefine((cred, ctx) => {
    if (Boolean(cred.secretKey) === Boolean(cred.dynamicSecretName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of secretKey or dynamicSecretName"
      });
    }
    if (cred.dynamicSecretName) {
      if (!cred.dynamicSecretField) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "dynamicSecretField is required when dynamicSecretName is set"
        });
      }
    } else if (cred.dynamicSecretField || cred.dynamicSecretConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dynamicSecretField and dynamicSecretConfig are only valid with dynamicSecretName"
      });
    }

    if (cred.role === ProxiedServiceCredentialRole.HeaderRewrite) {
      if (cred.headerPurpose) {
        if (cred.headerName || cred.headerPrefix) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "headerPurpose cannot be combined with headerName or headerPrefix"
          });
        }
      } else if (!cred.headerName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Header rewriting requires either headerName or headerPurpose"
        });
      }
    } else if (!cred.placeholderKey || !cred.placeholderValue || !cred.substitutionSurfaces) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Credential substitution requires placeholderKey, placeholderValue, and substitutionSurfaces"
      });
    }
  });

export const CredentialsArraySchema = CredentialInputSchema.array()
  .min(1, "At least one credential is required")
  .superRefine((credentials, ctx) => {
    const headerNameCounts = new Map<string, number>();
    const placeholderKeys = new Set<string>();
    const placeholderValues = new Set<string>();
    let usernameCount = 0;
    let passwordCount = 0;

    credentials.forEach((cred, i) => {
      if (cred.role === ProxiedServiceCredentialRole.HeaderRewrite) {
        if (cred.headerPurpose === ProxiedServiceHeaderPurpose.Username) usernameCount += 1;
        else if (cred.headerPurpose === ProxiedServiceHeaderPurpose.Password) passwordCount += 1;
        else if (cred.headerName) {
          const key = cred.headerName.toLowerCase();
          headerNameCounts.set(key, (headerNameCounts.get(key) ?? 0) + 1);
        }
      } else {
        if (cred.placeholderKey) {
          if (placeholderKeys.has(cred.placeholderKey)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate placeholder env var "${cred.placeholderKey}"`,
              path: [i, "placeholderKey"]
            });
          }
          placeholderKeys.add(cred.placeholderKey);
        }
        if (cred.placeholderValue) {
          if (placeholderValues.has(cred.placeholderValue)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Two credentials share the same placeholder value",
              path: [i, "placeholderValue"]
            });
          }
          placeholderValues.add(cred.placeholderValue);
        }
      }
    });

    headerNameCounts.forEach((count, name) => {
      if (count > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Header "${name}" is set by more than one credential`
        });
      }
    });

    if (usernameCount > 1 || passwordCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Basic auth allows at most one username and one password credential"
      });
    }
    if (usernameCount !== passwordCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Basic auth requires both a username and a password credential"
      });
    }
    if (usernameCount + passwordCount > 0 && headerNameCounts.size > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Basic auth cannot be combined with other header-rewrite credentials on the same service"
      });
    }
  });

export const SanitizedProxiedServiceCredentialSchema = ProxiedServiceCredentialsSchema.pick({
  id: true,
  serviceId: true,
  secretKey: true,
  role: true,
  headerName: true,
  headerPrefix: true,
  headerPurpose: true,
  placeholderKey: true,
  placeholderValue: true,
  substitutionSurfaces: true,
  dynamicSecretName: true,
  dynamicSecretField: true,
  dynamicSecretConfig: true
});

export const SanitizedProxiedServiceCredentialWithLeaseAccessSchema = SanitizedProxiedServiceCredentialSchema.extend({
  callerCanLease: z.boolean().optional()
});

export const SanitizedProxiedServiceBaseSchema = ProxiedServicesSchema.pick({
  id: true,
  name: true,
  hostPattern: true,
  isEnabled: true,
  folderId: true,
  createdAt: true,
  updatedAt: true
});

export const ProxiedServiceWithCredentialsSchema = SanitizedProxiedServiceBaseSchema.extend({
  credentials: SanitizedProxiedServiceCredentialSchema.array()
});

export const ProxiedServiceWithCanProxySchema = ProxiedServiceWithCredentialsSchema.extend({
  canProxy: z.boolean()
});

export const ProxiedServiceWithCanProxyAndLeaseAccessSchema = SanitizedProxiedServiceBaseSchema.extend({
  credentials: SanitizedProxiedServiceCredentialWithLeaseAccessSchema.array(),
  canProxy: z.boolean()
});
