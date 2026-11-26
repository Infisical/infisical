export type TAdminSignUpDTO = {
  email: string;
  password: string;
  lastName?: string;
  firstName: string;
  organizationName?: string;
  ip: string;
  userAgent: string;
  setupToken?: string;
};

export type TAdminBootstrapInstanceDTO = {
  email: string;
  password: string;
  organizationName: string;
  setupToken?: string;
};

export type TAdminGetUsersDTO = {
  offset: number;
  limit: number;
  searchTerm: string;
  adminsOnly: boolean;
};

export type TAdminGetIdentitiesDTO = {
  offset: number;
  limit: number;
  searchTerm: string;
};

export type TGetOrganizationsDTO = {
  offset: number;
  limit: number;
  searchTerm: string;
};

export type TAdminGetEmailDomainsDTO = {
  offset: number;
  limit: number;
  searchTerm: string;
};

export type TAdminCreateEmailDomainDTO = {
  orgId: string;
  domain: string;
};

export type TAdminDeleteEmailDomainDTO = {
  emailDomainId: string;
};

export type TCreateOrganizationDTO = {
  name: string;
  inviteAdminEmails: string[];
};

export type TResendOrgInviteDTO = {
  organizationId: string;
  membershipId: string;
};

export enum SuperAdminErrorCode {
  AuthMethodLockout = "SUPER_ADMIN_AUTH_METHOD_LOCKOUT",
  InvalidSetupToken = "SUPER_ADMIN_INVALID_SETUP_TOKEN",
  InstanceAlreadySetUp = "SUPER_ADMIN_INSTANCE_ALREADY_SET_UP"
}

export enum CacheType {
  ALL = "all",
  SECRETS = "secrets"
}
