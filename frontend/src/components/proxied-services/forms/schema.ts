import { z } from "zod";

import {
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "@app/hooks/api/proxiedServices/enums";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// mirrors the backend host-pattern grammar (proxied-service-schemas.ts) so bad patterns fail inline
const hostLabelsRe =
  /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

const hostPatternField = z
  .string()
  .trim()
  .min(1, "Host pattern is required")
  .max(255, "Host pattern is too long (max 255 characters)")
  .superRefine((raw, ctx) => {
    raw
      .split(",")
      .map((s) => s.trim())
      .forEach((seg) => {
        if (seg === "") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Host pattern has an empty entry" });
          return;
        }
        if (seg.includes("://")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${seg}" must not include a scheme (e.g. https://)`
          });
          return;
        }
        let hostPort = seg;
        const slashIdx = hostPort.indexOf("/");
        if (slashIdx !== -1) hostPort = hostPort.slice(0, slashIdx);
        let host = hostPort;
        const colonIdx = hostPort.lastIndexOf(":");
        if (colonIdx !== -1) {
          const portStr = hostPort.slice(colonIdx + 1);
          host = hostPort.slice(0, colonIdx);
          const port = Number(portStr);
          if (!/^\d+$/.test(portStr) || port < 1 || port > 65535) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" has an invalid port` });
            return;
          }
        }
        if (!hostLabelsRe.test(host)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${seg}" is not a valid host pattern`
          });
        }
      });
  });

// Field-level schemas are permissive; required-ness is enforced conditionally in the
// top-level superRefine so that fields belonging to the inactive header mode (which are not
// rendered) don't block submission.
export const headerCredentialSchema = z.object({
  secretKey: z.string().trim(),
  headerName: z.string().trim(),
  headerPrefix: z.string().trim().optional()
});

export const basicAuthSchema = z.object({
  usernameSecretKey: z.string().trim(),
  passwordSecretKey: z.string().trim()
});

export const substitutionSchema = z.object({
  placeholderKey: z
    .string()
    .trim()
    .min(1, "Environment variable name is required")
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Must be a valid environment variable name"),
  placeholderValue: z.string().trim().min(1),
  secretKey: z.string().trim().min(1, "Select a secret"),
  surfaces: z.array(z.nativeEnum(ProxiedServiceSubstitutionSurface)).min(1, "Select at least one")
});

export enum HeaderRewritingMode {
  Headers = "headers",
  BasicAuth = "basic-auth"
}

export const proxiedServiceFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(64)
      .regex(slugRegex, "Lowercase letters, numbers, and hyphens only"),
    hostPattern: hostPatternField,
    isEnabled: z.boolean().default(true),
    headerMode: z.nativeEnum(HeaderRewritingMode).default(HeaderRewritingMode.Headers),
    headers: z.array(headerCredentialSchema).default([]),
    basicAuth: basicAuthSchema.optional(),
    substitutions: z.array(substitutionSchema).default([])
  })
  .superRefine((form, ctx) => {
    if (form.headerMode === HeaderRewritingMode.Headers) {
      // only validate the rows the user actually sees in Headers mode
      const seenHeaderNames = new Map<string, number>();
      form.headers.forEach((row, i) => {
        if (!row.secretKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Select a secret",
            path: ["headers", i, "secretKey"]
          });
        }
        if (!row.headerName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Header name is required",
            path: ["headers", i, "headerName"]
          });
        } else {
          const key = row.headerName.trim().toLowerCase();
          if (seenHeaderNames.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Duplicate header name",
              path: ["headers", i, "headerName"]
            });
          }
          seenHeaderNames.set(key, i);
        }
      });
      // the backend rejects a service with no credentials at all
      if (!form.headers.length && !form.substitutions.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add at least one header or substitution",
          path: ["headers"]
        });
      }
    } else {
      if (!form.basicAuth?.usernameSecretKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select a secret",
          path: ["basicAuth", "usernameSecretKey"]
        });
      }
      if (!form.basicAuth?.passwordSecretKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select a secret",
          path: ["basicAuth", "passwordSecretKey"]
        });
      }
    }

    // placeholder env var names must be unique: each maps to one env var the agent sees
    const seenPlaceholderKeys = new Map<string, number>();
    form.substitutions.forEach((row, i) => {
      const key = row.placeholderKey.trim();
      if (!key) return;
      if (seenPlaceholderKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate environment variable name",
          path: ["substitutions", i, "placeholderKey"]
        });
      }
      seenPlaceholderKeys.set(key, i);
    });
  });

export type TProxiedServiceForm = z.infer<typeof proxiedServiceFormSchema>;

export { ProxiedServiceHeaderPurpose };
