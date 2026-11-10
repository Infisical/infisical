import type {
  AdminEmailDomain,
  AdminGetEmailDomainsFilters,
  AdminGetIdentitiesFilters,
  AdminGetOrganizationsFilters,
  AdminGetUsersFilters,
  AdminIntegrationsConfig,
  OrganizationWithProjects,
  RootKeyEncryptionStrategy,
  TAdminCreateEmailDomainDTO,
  TCreatedEncryptionKeyRotation,
  TCreateOrganizationDTO,
  TDeleteExpiringEncryptionKeyDTO,
  TDeleteStagedEncryptionKeyDTO,
  TEncryptionKeyRotationsPage,
  TEncryptionRootKey,
  TGetEnvOverrides,
  TGetServerRootKmsEncryptionDetails,
  TInvalidateCacheDTO,
  TResendOrgInviteDTO,
  TServerConfig,
  TUpdateServerConfigDTO,
  TUsageReportResponse
} from "@app/hooks/api/admin/types";
import type { Identity } from "@app/hooks/api/identities/types";
import type { Organization, UpdateOrgDTO } from "@app/hooks/api/organization/types";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";
import type { RenameUserDTO, User } from "@app/hooks/api/users/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type V4AdminPage<TKey extends string, TItem> = { [K in TKey]: TItem[] } & {
  totalCount: number;
};

export type AdminAdapter = {
  useServerConfig: () => V4QueryResult<TServerConfig>;
  useUpdateServerConfig: (options?: {
    handledErrorCodes?: string[];
  }) => ReturnType<V4Mutation<TUpdateServerConfigDTO, TServerConfig>>;
  useSubscription: (orgId: string) => V4QueryResult<SubscriptionPlan>;
  useUserOrganizations: () => V4QueryResult<Organization[]>;
  useGenerateUsageReport: V4Mutation<void, TUsageReportResponse>;

  useOrganizations: (
    filters: AdminGetOrganizationsFilters
  ) => V4QueryResult<V4AdminPage<"organizations", OrganizationWithProjects>>;
  useCreateOrganization: V4Mutation<TCreateOrganizationDTO, { organization: Organization }>;
  useDeleteOrganization: V4Mutation<string, unknown>;
  useDeleteOrganizationMembership: V4Mutation<
    { organizationId: string; membershipId: string },
    unknown
  >;
  useResendOrgInvite: V4Mutation<TResendOrgInviteDTO, void>;
  useAccessOrganization: V4Mutation<string, unknown>;

  useUsers: (filters: AdminGetUsersFilters) => V4QueryResult<V4AdminPage<"users", User>>;
  useDeleteUser: V4Mutation<string, unknown>;
  useBulkDeleteUsers: V4Mutation<string[], unknown>;
  useGrantServerAdminAccess: V4Mutation<string, unknown>;
  useRemoveServerAdminAccess: V4Mutation<string, unknown>;

  useIdentities: (
    filters: AdminGetIdentitiesFilters
  ) => V4QueryResult<V4AdminPage<"identities", Identity>>;
  useRemoveIdentityServerAdminAccess: V4Mutation<string, unknown>;

  useEmailDomains: (
    filters: AdminGetEmailDomainsFilters
  ) => V4QueryResult<V4AdminPage<"emailDomains", AdminEmailDomain>>;
  useCreateEmailDomain: V4Mutation<TAdminCreateEmailDomainDTO, { emailDomain: AdminEmailDomain }>;
  useDeleteEmailDomain: V4Mutation<string, { emailDomain: AdminEmailDomain }>;

  useEncryptionStrategies: () => V4QueryResult<TGetServerRootKmsEncryptionDetails>;
  useUpdateEncryptionStrategy: V4Mutation<RootKeyEncryptionStrategy, unknown>;
  useEncryptionRootKey: () => V4QueryResult<TEncryptionRootKey>;
  useEncryptionKeyRotations: (page: {
    offset: number;
    limit: number;
  }) => V4QueryResult<TEncryptionKeyRotationsPage>;
  useCreateEncryptionKeyRotation: V4Mutation<
    { replaceStaged?: boolean } | undefined,
    TCreatedEncryptionKeyRotation
  >;
  useDeleteStagedEncryptionKey: V4Mutation<TDeleteStagedEncryptionKeyDTO, unknown>;
  useDeleteExpiringEncryptionKey: V4Mutation<TDeleteExpiringEncryptionKeyDTO, unknown>;

  useIntegrationsConfig: () => V4QueryResult<AdminIntegrationsConfig>;

  useInvalidatingCacheStatus: (enabled?: boolean) => V4QueryResult<boolean>;
  useInvalidateCache: V4Mutation<TInvalidateCacheDTO, void>;

  useEnvOverrides: () => V4QueryResult<TGetEnvOverrides>;

  useCurrentUser: () => V4QueryResult<User>;
  useRenameUser: V4Mutation<RenameUserDTO, object>;
  useUpdateOrganization: V4Mutation<UpdateOrgDTO, object>;
};
