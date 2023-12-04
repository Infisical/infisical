import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export enum AuthMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml"
}

export const UserSchema = z.object({
  id: z.string(),
  authMethods: z.nativeEnum(AuthMethod).array().default([AuthMethod.EMAIL]).optional().nullable(),
  email: z.string(),
  isSuperAdmin: z.boolean().default(false).optional(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  isMfaEnabled: z.boolean().default(false).optional(),
  mfaMethods: z.string().array().default([]).optional().nullable(),
  isAccepted: z.boolean().default(false).optional(),
  devices: z.string().nullable().optional()
});

export const UserDeviceSchema = z
  .object({
    ip: z.string(),
    userAgent: z.string()
  })
  .array()
  .default([]);

export type TUser = z.infer<typeof UserSchema>;
export type TUserInsert = Omit<TUser, TImmutableDBKeys>;
export type TUserUpdate = Partial<Omit<TUser, "id" | "email">>;
