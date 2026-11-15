import { useQueries, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useDeleteAlert, useUpdateAlert } from "@app/hooks/api/alerts/mutations";
import { useListAlerts } from "@app/hooks/api/alerts/queries";
import {
  useCreateApprovalPolicy,
  useDeleteApprovalPolicy
} from "@app/hooks/api/approvalPolicies/mutations";
import { approvalPolicyQuery } from "@app/hooks/api/approvalPolicies/queries";
import { ApprovalPolicyScope, ApprovalPolicyType } from "@app/hooks/api/approvalPolicies/types";
import {
  useCancelCertificateRequest,
  useTriggerCertificateRequestValidation
} from "@app/hooks/api/certificates/mutations";
import { useListCertificateRequests } from "@app/hooks/api/certificates/queries";
import { useDeletePkiAlertV2 } from "@app/hooks/api/pkiAlertsV2/mutations";
import { useGetPkiAlertsV2 } from "@app/hooks/api/pkiAlertsV2/queries";
import {
  useAddPkiApplicationMember,
  useAddPkiApplicationUserMembers,
  useAttachPkiApplicationProfiles,
  useCreatePkiApplication,
  useDeletePkiApplication,
  useDetachPkiApplicationProfile,
  useRemovePkiApplicationMember,
  useUpdatePkiApplication,
  useUpdatePkiApplicationMemberRole
} from "@app/hooks/api/pkiApplications/mutations";
import {
  useGetPkiApplicationByName,
  useGetPkiApplicationPermissions,
  useListPkiApplicationMembers,
  useListPkiApplicationProfiles,
  useListPkiApplications
} from "@app/hooks/api/pkiApplications/queries";
import { useTriggerPkiSyncSyncCertificates } from "@app/hooks/api/pkiSyncs/mutations";
import { useListPkiSyncs } from "@app/hooks/api/pkiSyncs/queries";
import { useListProjectIdentityMemberships } from "@app/hooks/api/projectIdentityMembership/queries";
import {
  useGetWorkspaceUsers,
  useListWorkspaceCertificates,
  useListWorkspaceGroups
} from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";

import type { MemberCandidate, PkiApplicationsAdapter } from "./contract";
import { enrollmentLive } from "./live-enrollment";

const candidates = <T>(
  query: { data?: T[]; isPending: boolean; error: unknown },
  toCandidate: (entry: T) => MemberCandidate
) => ({ data: query.data?.map(toCandidate), isPending: query.isPending, error: query.error });

export const pkiApplicationsLive: PkiApplicationsAdapter = {
  ...enrollmentLive,
  useApplications: useListPkiApplications,
  useApplicationByName: useGetPkiApplicationByName,
  useApplicationProfiles: useListPkiApplicationProfiles,
  useApplicationMembers: useListPkiApplicationMembers,
  useApplicationPermissions: useGetPkiApplicationPermissions,
  useApplicationCertificates: useListWorkspaceCertificates,
  useMemberCandidates: (projectId, enabled) => {
    const users = useGetWorkspaceUsers(projectId, true, undefined, { enabled });
    const identities = useListProjectIdentityMemberships(
      { projectId, projectType: ProjectType.CertificateManager, limit: 1000 },
      { enabled }
    );
    const groups = useListWorkspaceGroups(projectId, ProjectType.CertificateManager, { enabled });
    const groupIdentities = useQueries({
      queries: (groups.data ?? []).map((membership) => ({
        queryKey: ["pki-application-add-member", "group-identities", membership.group.id],
        enabled,
        queryFn: async () => {
          const { data } = await apiRequest.get<{
            machineIdentities: { id: string; name: string }[];
          }>(`/api/v1/groups/${membership.group.id}/machine-identities`, {
            params: { offset: 0, limit: 1000 }
          });
          return data.machineIdentities;
        }
      }))
    });
    const identityById = new Map<string, MemberCandidate>();
    (identities.data?.identityMemberships ?? []).forEach(({ identity }) =>
      identityById.set(identity.id, { value: identity.id, label: identity.name })
    );
    groupIdentities
      .flatMap((query) => query.data ?? [])
      .forEach((identity) => {
        if (!identityById.has(identity.id))
          identityById.set(identity.id, { value: identity.id, label: identity.name });
      });
    return {
      users: candidates(users, ({ user }) => ({
        value: user.id,
        label:
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.username ||
          user.email ||
          user.id
      })),
      identities: {
        data: identities.data ? [...identityById.values()] : undefined,
        isPending: identities.isPending,
        error: identities.error
      },
      groups: candidates(groups, ({ group }) => ({ value: group.id, label: group.name }))
    };
  },
  useCertificateRequests: useListCertificateRequests,
  useApplicationSyncs: (projectId, applicationId) =>
    useListPkiSyncs(projectId, { enabled: Boolean(projectId), applicationId }),
  useApplicationPolicies: (applicationId) =>
    useQuery({
      ...approvalPolicyQuery.list({
        policyType: ApprovalPolicyType.CertRequest,
        scope: ApprovalPolicyScope.PkiApplication,
        scopeId: applicationId
      }),
      enabled: Boolean(applicationId)
    }),
  useApplicationAlerts: (dto) => useListAlerts(dto, { enabled: Boolean(dto.resourceId) }),
  useLegacyAlerts: (applicationId) => {
    const query = useGetPkiAlertsV2({ applicationId, limit: 100 });
    return { data: query.data?.alerts, isPending: query.isPending, error: query.error };
  },
  useCreateApplication: useCreatePkiApplication,
  useUpdateApplication: useUpdatePkiApplication,
  useDeleteApplication: useDeletePkiApplication,
  useAttachProfiles: useAttachPkiApplicationProfiles,
  useDetachProfile: useDetachPkiApplicationProfile,
  useAddMember: useAddPkiApplicationMember,
  useAddUserMembers: useAddPkiApplicationUserMembers,
  useUpdateMemberRole: useUpdatePkiApplicationMemberRole,
  useRemoveMember: useRemovePkiApplicationMember,
  useCancelCertificateRequest,
  useTriggerRequestValidation: useTriggerCertificateRequestValidation,
  useTriggerSync: useTriggerPkiSyncSyncCertificates,
  useCreatePolicy: useCreateApprovalPolicy,
  useDeletePolicy: useDeleteApprovalPolicy,
  useUpdateAlert,
  useDeleteAlert,
  useDeleteLegacyAlert: useDeletePkiAlertV2
};
