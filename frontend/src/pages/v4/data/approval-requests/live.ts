import { useQuery } from "@tanstack/react-query";

import { getMemberLabel } from "@app/helpers/members";
import {
  approvalPolicyQuery,
  useDeleteApprovalPolicy,
  useUpdateApprovalPolicy
} from "@app/hooks/api/approvalPolicies";
import {
  approvalRequestQuery,
  useApproveApprovalRequest,
  useCancelApprovalRequest,
  useRejectApprovalRequest
} from "@app/hooks/api/approvalRequests";
import { useGetCertificateProfileById } from "@app/hooks/api/certificateProfiles/queries";
import { useGetCertificateRequest } from "@app/hooks/api/certificates/queries";
import { useGetPkiApplicationById, useListPkiApplications } from "@app/hooks/api/pkiApplications";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api/projects/queries";
import { useGetUserProjectPermissions } from "@app/hooks/api/roles/queries";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import type { ApprovalRequestsAdapter } from "./contract";

export const approvalRequestsLive: ApprovalRequestsAdapter = {
  useViewer: (projectId) => {
    const query = useGetUserProjectPermissions({ projectId });
    return {
      data: query.data
        ? {
            isAdmin: query.data.memberships.some((membership) =>
              membership.roles.some((role) => role.role === ProjectMembershipRole.Admin)
            ),
            groupIds: query.data.memberships
              .map((membership) => membership.actorGroupId)
              .filter(Boolean)
          }
        : undefined,
      isPending: query.isPending,
      error: query.error
    };
  },
  useRequests: (dto) =>
    useQuery({ ...approvalRequestQuery.list(dto), enabled: Boolean(dto.scopeId) }),
  useRequest: (dto) => useQuery(approvalRequestQuery.getById(dto)),
  usePolicies: (dto, { enabled }) =>
    useQuery({ ...approvalPolicyQuery.list(dto), enabled: enabled && Boolean(dto.scopeId) }),
  useApprovers: (projectId, { includeGroupMembers }) => {
    const users = useGetWorkspaceUsers(projectId, includeGroupMembers || undefined);
    const groups = useListWorkspaceGroups(projectId);
    return {
      data:
        users.data && groups.data
          ? {
              users: users.data.map((member) => ({
                id: member.user.id,
                label: getMemberLabel(member)
              })),
              groups: groups.data.map(({ group }) => ({ id: group.id, label: group.name }))
            }
          : undefined,
      isPending: users.isPending || groups.isPending,
      error: users.error ?? groups.error
    };
  },
  useApplications: (applicationIds) => {
    const query = useListPkiApplications(
      { applicationIds, limit: 100 },
      { enabled: applicationIds.length > 0 }
    );
    return {
      data: query.data?.applications.map(({ id, name }) => ({ id, name })),
      isPending: query.isPending,
      error: query.error
    };
  },
  useApplication: (applicationId) => useGetPkiApplicationById(applicationId),
  useProfile: (profileId) => useGetCertificateProfileById({ profileId }),
  useCertificateRequest: useGetCertificateRequest,
  useApprove: useApproveApprovalRequest,
  useReject: useRejectApprovalRequest,
  useCancel: useCancelApprovalRequest,
  useUpdatePolicy: useUpdateApprovalPolicy,
  useDeletePolicy: useDeleteApprovalPolicy
};
