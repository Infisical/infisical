import { ProjectType } from "@app/db/schemas";
import { TOrgPermission } from "@app/lib/types";

import { ActorAuthMethod, ActorType, MfaMethod } from "../auth/auth-type";

export type TUpdateOrgMembershipDTO = {
  userId: string;
  orgId: string;
  membershipId: string;
  role?: string;
  isActive?: boolean;
  actorOrgId: string | undefined;
  metadata?: { key: string; value: string }[];
  actorAuthMethod: ActorAuthMethod;
};

export type TGetOrgMembershipDTO = {
  membershipId: string;
} & TOrgPermission;

export type TDeleteOrgMembershipDTO = {
  userId: string;
  orgId: string;
  membershipId: string;
  actorOrgId: string | undefined;
  actorAuthMethod: ActorAuthMethod;
};

export type TInviteUserToOrgDTO = {
  inviteeEmails: string[];
  organizationRoleSlug: string;
  projects?: {
    id: string;
    projectRoleSlug?: string[];
  }[];
} & TOrgPermission;

export type TResendOrgMemberInvitationDTO = {
  membershipId: string;
} & TOrgPermission;

export type TVerifyUserToOrgDTO = {
  email: string;
  orgId: string;
  code: string;
};

export type TFindOrgMembersByEmailDTO = {
  actor: ActorType;
  actorOrgId: string | undefined;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  orgId: string;
  emails: string[];
};

export type TFindAllWorkspacesDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId: string | undefined;
  actorAuthMethod: ActorAuthMethod;
  orgId: string;
  type?: ProjectType;
};

export type TUpdateOrgDTO = {
  data: Partial<{
    name: string;
    slug: string;
    authEnforced: boolean;
    scimEnabled: boolean;
    defaultMembershipRoleSlug: string;
    enforceMfa: boolean;
    selectedMfaMethod: MfaMethod;
    allowSecretSharingOutsideOrganization: boolean;
    bypassOrgAuthEnabled: boolean;
    userTokenExpiration: string;
    secretsProductEnabled: boolean;
    pkiProductEnabled: boolean;
    kmsProductEnabled: boolean;
    sshProductEnabled: boolean;
    scannerProductEnabled: boolean;
    shareSecretsProductEnabled: boolean;
    maxSharedSecretLifetime: number;
    maxSharedSecretViewLimit: number | null;
  }>;
} & TOrgPermission;

export type TUpgradePrivilegeSystemDTO = Omit<TOrgPermission, "actor">;

export type TGetOrgGroupsDTO = TOrgPermission;

export type TListProjectMembershipsByOrgMembershipIdDTO = {
  orgMembershipId: string;
} & TOrgPermission;

export enum OrgAuthMethod {
  OIDC = "oidc",
  SAML = "saml"
}
