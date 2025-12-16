import { z } from "zod";

import { TProjectPermission } from "@app/lib/types";

export const AllowedFieldsSchema = z.object({
  key: z.string().trim(),
  value: z
    .string()
    .trim()
    .transform((val) => val.replace(/\s/g, ""))
});

export type TAllowedFields = z.infer<typeof AllowedFieldsSchema>;

export type TAttachLdapAuthDTO = {
  identityId: string;
  templateId?: string;
  url?: string;
  searchBase?: string;
  searchFilter: string;
  bindDN?: string;
  bindPass?: string;
  ldapCaCertificate?: string;
  allowedFields?: TAllowedFields[];
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
  lockoutEnabled: boolean;
  lockoutThreshold: number;
  lockoutDurationSeconds: number;
  lockoutCounterResetSeconds: number;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateLdapAuthDTO = {
  identityId: string;
  templateId?: string;
  url?: string;
  searchBase?: string;
  searchFilter?: string;
  bindDN?: string;
  bindPass?: string;
  allowedFields?: TAllowedFields[];
  ldapCaCertificate?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
  lockoutEnabled?: boolean;
  lockoutThreshold?: number;
  lockoutDurationSeconds?: number;
  lockoutCounterResetSeconds?: number;
} & Omit<TProjectPermission, "projectId">;

export type TGetLdapAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TLoginLdapAuthDTO = {
  identityId: string;
  subOrganizationName?: string;
};

export type TRevokeLdapAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TClearLdapAuthLockoutsDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TCheckLdapAuthLockoutDTO = {
  identityId: string;
  username: string;
};
