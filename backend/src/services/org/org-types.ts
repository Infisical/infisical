import { z } from "zod";

import { MfaMethod } from "@app/lib/auth/actor-types";
import { TActorInput } from "@app/lib/types";

import { SsoMfaTrust } from "../auth/auth-type";
import { OrgWithSubOrgsSchema } from "./org-schema";

/** Root org with accessible sub-orgs (basic info only) */
export type TOrgWithSubOrgs = z.infer<typeof OrgWithSubOrgsSchema>;

export type TUpdateOrgMembershipDTO = {
  membershipId: string;
  role?: string;
  isActive?: boolean;
  metadata?: { key: string; value: string }[];
  orgId: string;
} & TActorInput;

export type TGetOrgMembershipDTO = {
  membershipId: string;
  orgId: string;
} & TActorInput;

export type TDeleteOrgMembershipDTO = {
  membershipId: string;
  orgId: string;
} & TActorInput;

export type TDeleteOrgMembershipsDTO = {
  membershipIds: string[];
  orgId: string;
} & TActorInput;

export type TInviteUserToOrgDTO = {
  inviteeEmails: string[];
  organizationRoleSlug: string;
  projects?: {
    id: string;
    projectRoleSlug?: string[];
  }[];
  orgId: string;
} & TActorInput;

export type TResendOrgMemberInvitationDTO = {
  membershipId: string;
  orgId: string;
} & TActorInput;

export type TVerifyUserToOrgDTO = {
  email: string;
  orgId: string;
  code: string;
};

export type TFindOrgMembersByEmailDTO = {
  orgId: string;
  emails: string[];
} & TActorInput;

export type TFindAllWorkspacesDTO = {
  orgId: string;
} & TActorInput;

export type TSecretShareBrandConfig = {
  primaryColor?: string;
  secondaryColor?: string;
} | null;

export type TUpdateOrgDTO = {
  data: Partial<{
    name: string;
    slug: string;
    authEnforced: boolean;
    googleSsoAuthEnforced: boolean;
    scimEnabled: boolean;
    defaultMembershipRoleSlug: string;
    enforceMfa: boolean;
    selectedMfaMethod: MfaMethod;
    ssoMfaTrust: SsoMfaTrust;
    allowSecretSharingOutsideOrganization: boolean;
    bypassOrgAuthEnabled: boolean;
    userTokenExpiration: string;
    secretsProductEnabled: boolean;
    pkiProductEnabled: boolean;
    kmsProductEnabled: boolean;
    scannerProductEnabled: boolean;
    shareSecretsProductEnabled: boolean;
    maxSharedSecretLifetime: number;
    maxSharedSecretViewLimit: number | null;
    blockDuplicateSecretSyncDestinations: boolean;
    allowCrossProjectSecretSharing: boolean;
    requireGatewayPools: boolean;
    secretShareBrandConfig: TSecretShareBrandConfig;
  }>;
  orgId: string;
} & TActorInput;

export type TUpgradePrivilegeSystemDTO = { orgId: string } & TActorInput;

export type TGetOrgGroupsDTO = { orgId: string } & TActorInput;

export type TFindAllOrgMembersDTO = { orgId: string } & TActorInput;

export type TListProjectMembershipsByOrgMembershipIdDTO = {
  orgMembershipId: string;
  orgId: string;
} & TActorInput;

export enum OrgAuthMethod {
  OIDC = "oidc",
  SAML = "saml"
}
