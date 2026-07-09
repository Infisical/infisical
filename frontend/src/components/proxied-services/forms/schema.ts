import { z } from "zod";

import {
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "@app/hooks/api/proxiedServices/enums";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    hostPattern: z.string().trim().min(1, "Host pattern is required"),
    isEnabled: z.boolean().default(true),
    headerMode: z.nativeEnum(HeaderRewritingMode).default(HeaderRewritingMode.Headers),
    headers: z.array(headerCredentialSchema).default([]),
    basicAuth: basicAuthSchema.optional(),
    substitutions: z.array(substitutionSchema).default([])
  })
  .superRefine((form, ctx) => {
    if (form.headerMode === HeaderRewritingMode.Headers) {
      // only validate the rows the user actually sees in Headers mode
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
        }
      });
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
  });

export type TProxiedServiceForm = z.infer<typeof proxiedServiceFormSchema>;

export { ProxiedServiceHeaderPurpose };
