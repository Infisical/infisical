import RE2 from "re2";
import { z } from "zod";

import { ProxiedServiceCredentialsSchema, ProxiedServicesSchema } from "@app/db/schemas";

import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "./proxied-service-enums";

// One host label: alphanumerics and internal hyphens, optionally a single leading "*." wildcard.
// RE2 (per codebase convention) for linear-time matching on user input.
const HOST_LABELS_RE = new RE2(/^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i);
const PORT_RE = new RE2(/^\d+$/);

// Validates the comma-separated hostPattern grammar so malformed values fail at creation
// instead of silently never matching at proxy time. The matching grammar itself lives in the
// agent-proxy CLI (packages/agentproxy/match.go); keep the two in sync.
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
      if (slashIdx !== -1) hostPort = hostPort.slice(0, slashIdx); // path portion is free-form
      let host = hostPort;
      const colonIdx = hostPort.lastIndexOf(":");
      if (colonIdx !== -1) {
        const portStr = hostPort.slice(colonIdx + 1);
        host = hostPort.slice(0, colonIdx);
        const port = Number(portStr);
        if (!PORT_RE.test(portStr) || port < 1 || port > 65535) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" has an invalid port` });
          return;
        }
      }
      if (!HOST_LABELS_RE.test(host)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" is not a valid host pattern` });
      }
    });
  });

const CredentialInputSchema = z
  .object({
    secretKey: z.string().trim().min(1),
    role: z.nativeEnum(ProxiedServiceCredentialRole),
    headerName: z.string().trim().min(1).optional(),
    headerPrefix: z.string().trim().optional(),
    headerPurpose: z.nativeEnum(ProxiedServiceHeaderPurpose).optional(),
    placeholderKey: z.string().trim().min(1).optional(),
    placeholderValue: z.string().trim().min(1).optional(),
    substitutionSurfaces: z.array(z.nativeEnum(ProxiedServiceSubstitutionSurface)).nonempty().optional()
  })
  .superRefine((cred, ctx) => {
    if (cred.role === ProxiedServiceCredentialRole.HeaderRewrite) {
      // either a named header (optionally with a prefix) or a basic-auth purpose, not both
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
      // credential substitution
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Credential substitution requires placeholderKey, placeholderValue, and substitutionSurfaces"
      });
    }
  });

// Cross-credential rules that cannot be checked one row at a time: basic-auth pairing,
// unique header names / placeholders, and header-rewrite modes that cannot coexist.
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
    // Basic auth already owns the Authorization header, so it cannot coexist with named header rewrites.
    if (usernameCount + passwordCount > 0 && headerNameCounts.size > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Basic auth cannot be combined with other header-rewrite credentials on the same service"
      });
    }
  });

// Sanitized response shapes, shared by the CRUD router and the dashboard aggregate schema.
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
  substitutionSurfaces: true
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
