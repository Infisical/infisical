import {
  useAdminBulkDeleteUsers,
  useAdminCreateEmailDomain,
  useAdminDeleteEmailDomain,
  useAdminDeleteOrganization,
  useAdminDeleteOrganizationMembership,
  useAdminDeleteUser,
  useAdminGrantServerAdminAccess,
  useAdminRemoveIdentitySuperAdminAccess,
  useCreateEncryptionKeyRotation,
  useDeleteExpiringEncryptionKey,
  useDeleteStagedEncryptionKey,
  useGenerateUsageReport,
  useInvalidateCache,
  useRemoveUserServerAdminAccess,
  useServerAdminAccessOrg,
  useServerAdminCreateOrganization,
  useServerAdminResendOrgInvite,
  useUpdateServerConfig,
  useUpdateServerEncryptionStrategy
} from "@app/hooks/api/admin/mutation";
import {
  useAdminGetEmailDomains,
  useAdminGetIdentities,
  useAdminGetOrganizations,
  useAdminGetUsers,
  useGetAdminIntegrationsConfig,
  useGetEncryptionKeyRotations,
  useGetEncryptionRootKey,
  useGetEnvOverrides,
  useGetInvalidatingCacheStatus,
  useGetServerConfig,
  useGetServerRootKmsEncryptionDetails
} from "@app/hooks/api/admin/queries";
import { useGetOrganizations, useUpdateOrg } from "@app/hooks/api/organization/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";
import { useGetUser, useRenameUser } from "@app/hooks/api/users/queries";

import type { AdminAdapter } from "./contract";

export const adminLive: AdminAdapter = {
  useServerConfig: () => useGetServerConfig(),
  useUpdateServerConfig,
  useSubscription: (orgId) => useGetOrgSubscription({ orgID: orgId }),
  useUserOrganizations: useGetOrganizations,
  useGenerateUsageReport,
  useOrganizations: useAdminGetOrganizations,
  useCreateOrganization: useServerAdminCreateOrganization,
  useDeleteOrganization: useAdminDeleteOrganization,
  useDeleteOrganizationMembership: useAdminDeleteOrganizationMembership,
  useResendOrgInvite: useServerAdminResendOrgInvite,
  useAccessOrganization: useServerAdminAccessOrg,
  useUsers: useAdminGetUsers,
  useDeleteUser: useAdminDeleteUser,
  useBulkDeleteUsers: useAdminBulkDeleteUsers,
  useGrantServerAdminAccess: useAdminGrantServerAdminAccess,
  useRemoveServerAdminAccess: useRemoveUserServerAdminAccess,
  useIdentities: useAdminGetIdentities,
  useRemoveIdentityServerAdminAccess: useAdminRemoveIdentitySuperAdminAccess,
  useEmailDomains: useAdminGetEmailDomains,
  useCreateEmailDomain: useAdminCreateEmailDomain,
  useDeleteEmailDomain: useAdminDeleteEmailDomain,
  useEncryptionStrategies: useGetServerRootKmsEncryptionDetails,
  useUpdateEncryptionStrategy: useUpdateServerEncryptionStrategy,
  useEncryptionRootKey: useGetEncryptionRootKey,
  useEncryptionKeyRotations: useGetEncryptionKeyRotations,
  useCreateEncryptionKeyRotation,
  useDeleteStagedEncryptionKey,
  useDeleteExpiringEncryptionKey,
  useIntegrationsConfig: useGetAdminIntegrationsConfig,
  useInvalidatingCacheStatus: useGetInvalidatingCacheStatus,
  useInvalidateCache,
  useEnvOverrides: useGetEnvOverrides,
  useCacheInvalidationStatus: useGetInvalidatingCacheStatus,
  useCurrentUser: useGetUser,
  useRenameUser,
  useUpdateOrganization: useUpdateOrg
};
