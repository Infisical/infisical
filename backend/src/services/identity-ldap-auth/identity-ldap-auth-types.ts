import { z } from "zod";

import { TActorInput } from "@app/lib/types";

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
} & TActorInput;

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
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetLdapAuthDTO = {
  identityId: string;
} & TActorInput;

export type TLoginLdapAuthDTO = {
  identityId: string;
  organizationSlug?: string;
};

export type TRevokeLdapAuthDTO = {
  identityId: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TClearLdapAuthLockoutsDTO = {
  identityId: string;
} & TActorInput;

export type TCheckLdapAuthLockoutDTO = {
  identityId: string;
  username: string;
};
