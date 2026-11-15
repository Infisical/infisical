import { createResourcePermissionQueryHook } from "@app/helpers/resourcePermissions";
import { useGetOrgUsers } from "@app/hooks/api";
import { useDigiCertConnectionListOrders } from "@app/hooks/api/appConnections/digicert/queries";
import { useListHsmConnectorKeys } from "@app/hooks/api/hsmConnectors/queries";
import { useGetOrganizationGroups } from "@app/hooks/api/organization/queries";
import { useListProjectIdentityMemberships } from "@app/hooks/api/projectIdentityMembership/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  useAddSignerGroupMember,
  useAddSignerIdentityMember,
  useAddSignerUserMembers,
  useCheckSignerCertificateImport,
  useCheckSignerIssuance,
  useCreateSigner,
  useDeleteSigner,
  useDisableSigner,
  useEnableSigner,
  useImportSignerCertificate,
  usePreApproveSigning,
  useReissueSignerCertificate,
  useRemoveSignerGroupMember,
  useRemoveSignerIdentityMember,
  useRemoveSignerUserMember,
  useRequestToSign,
  useRevokeSignerRequest,
  useUpdateSigner,
  useUpdateSignerGroupRole,
  useUpdateSignerIdentityRole,
  useUpdateSignerPolicy,
  useUpdateSignerUserRole
} from "@app/hooks/api/signers/mutations";
import {
  fetchUserSignerPermissions,
  signerKeys,
  useExportSignerCertificate,
  useGetSigner,
  useGetSignerPolicy,
  useGetSigningOperation,
  useListEffectiveSignerMembers,
  useListSignerMembers,
  useListSignerRequests,
  useListSigners,
  useListSigningOperations
} from "@app/hooks/api/signers/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { CodeSigningAdapter } from "./contract";

const useSignerPermissionQuery = createResourcePermissionQueryHook({
  queryKey: (signerId) => signerKeys.getUserSignerPermissions({ signerId }),
  fetchFn: (signerId) => fetchUserSignerPermissions({ signerId })
});

const userLabel = (user: {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
}) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
  user.username ||
  user.email ||
  user.id;

export const codeSigningLive: CodeSigningAdapter = {
  useSubscription: (orgId) => useGetOrgSubscription({ orgID: orgId }),
  useSigners: useListSigners,
  useSigner: useGetSigner,
  useSignerPermission: (signerId) => useSignerPermissionQuery(signerId),
  useSigningOperations: useListSigningOperations,
  useSigningOperation: useGetSigningOperation,
  useSignerMembers: useListSignerMembers,
  useEffectiveSignerMembers: useListEffectiveSignerMembers,
  useSignerPolicy: useGetSignerPolicy,
  useSignerRequests: useListSignerRequests,
  useSignerCertificate: useExportSignerCertificate,
  useMemberCandidates: (orgId, projectId, enabled) => {
    const users = useGetOrgUsers(orgId, { enabled });
    const identities = useListProjectIdentityMemberships(
      { projectId, projectType: ProjectType.CertificateManager, limit: 1000 },
      { enabled }
    );
    const groups = useGetOrganizationGroups(orgId);
    return {
      users: {
        data: users.data?.map(({ user }) => ({ value: user.id, label: userLabel(user) })),
        isPending: users.isPending,
        error: users.error
      },
      identities: {
        data: identities.data?.identityMemberships
          .map(({ identity }) => ({ value: identity.id, label: identity.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        isPending: identities.isPending,
        error: identities.error
      },
      groups: {
        data: groups.data?.map((group) => ({ value: group.id, label: group.name })),
        isPending: groups.isPending,
        error: groups.error
      }
    };
  },
  useHsmConnectorKeys: (connectorId, label, enabled) =>
    useListHsmConnectorKeys(connectorId, label, { enabled }),
  useDigiCertOrders: ({ appConnectionId, organizationId, productNameId }) =>
    useDigiCertConnectionListOrders(appConnectionId, organizationId, productNameId),
  useCreateSigner,
  useUpdateSigner,
  useDeleteSigner,
  useEnableSigner,
  useDisableSigner,
  useReissueSignerCertificate,
  useImportSignerCertificate,
  useCheckSignerCertificateImport,
  useCheckSignerIssuance,
  useAddUserMembers: useAddSignerUserMembers,
  useAddIdentityMember: useAddSignerIdentityMember,
  useAddGroupMember: useAddSignerGroupMember,
  useUpdateUserRole: useUpdateSignerUserRole,
  useUpdateIdentityRole: useUpdateSignerIdentityRole,
  useUpdateGroupRole: useUpdateSignerGroupRole,
  useRemoveUserMember: useRemoveSignerUserMember,
  useRemoveIdentityMember: useRemoveSignerIdentityMember,
  useRemoveGroupMember: useRemoveSignerGroupMember,
  useUpdateSignerPolicy,
  useRequestToSign,
  usePreApproveSigning,
  useRevokeSignerRequest
};
