import {
  useCreateAccessApprovalPolicy,
  useDeleteAccessApprovalPolicy,
  useUpdateAccessApprovalPolicy
} from "@app/hooks/api/accessApproval/mutation";
import {
  useGetAccessApprovalPolicies,
  useGetAccessRequestsCount
} from "@app/hooks/api/accessApproval/queries";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import { useDelegatedApprovalOptions } from "@app/hooks/api/delegatedApprovals/queries";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api/projects/queries";
import {
  useCreateSecretApprovalPolicy,
  useDeleteSecretApprovalPolicy,
  useUpdateSecretApprovalPolicy
} from "@app/hooks/api/secretApproval/mutation";
import { useGetSecretApprovalPolicies } from "@app/hooks/api/secretApproval/queries";
import { useGetSecretApprovalRequestCount } from "@app/hooks/api/secretApprovalRequest/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { ApprovalPoliciesAdapter } from "./contract";

export const approvalPoliciesLive: ApprovalPoliciesAdapter = {
  useGates: (orgId) => {
    const subscription = useGetOrgSubscription({ orgID: orgId });
    return {
      data: subscription.data
        ? {
            secretApproval: Boolean(subscription.data.secretApproval),
            enterpriseAppConnections: Boolean(subscription.data.enterpriseAppConnections)
          }
        : undefined,
      isPending: subscription.isPending,
      error: subscription.error
    };
  },
  useChangePolicies: (projectId, { enabled }) =>
    useGetSecretApprovalPolicies({ projectId, options: { enabled } }),
  useAccessPolicies: (projectSlug, { enabled }) =>
    useGetAccessApprovalPolicies({ projectSlug, options: { enabled } }),
  useApproverOptions: (projectId, { members: readMembers, groups: readGroups }) => {
    const members = useGetWorkspaceUsers(projectId, true, undefined, {
      enabled: readMembers && Boolean(projectId)
    });
    const groups = useListWorkspaceGroups(projectId, undefined, {
      enabled: readGroups && Boolean(projectId)
    });
    return {
      members: members.data ?? [],
      groups: groups.data ?? [],
      isError: (readMembers && members.isError) || (readGroups && groups.isError),
      isFetching: (readMembers && members.isFetching) || (readGroups && groups.isFetching),
      refetch: () => {
        if (readMembers) members.refetch().catch(() => undefined);
        if (readGroups) groups.refetch().catch(() => undefined);
      }
    };
  },
  useCreateChangePolicy: useCreateSecretApprovalPolicy,
  useUpdateChangePolicy: useUpdateSecretApprovalPolicy,
  useDeleteChangePolicy: useDeleteSecretApprovalPolicy,
  useCreateAccessPolicy: useCreateAccessApprovalPolicy,
  useUpdateAccessPolicy: useUpdateAccessApprovalPolicy,
  useDeleteAccessPolicy: useDeleteAccessApprovalPolicy,
  useOpenChangeRequestCount: ({ projectId, policyId, enabled }) => {
    const query = useGetSecretApprovalRequestCount({ projectId, policyId, options: { enabled } });
    return { data: query.data?.open, isPending: query.isPending, error: query.error };
  },
  useOpenAccessRequestCount: ({ projectSlug, policyId, enabled }) => {
    const query = useGetAccessRequestsCount({ projectSlug, policyId, options: { enabled } });
    return { data: query.data?.pendingCount, isPending: query.isPending, error: query.error };
  },
  useDelegatedApprovalOptions: ({ enabled }) => useDelegatedApprovalOptions({ enabled }),
  useAppConnections: (app, projectId) => useListAvailableAppConnections(app, projectId)
};
