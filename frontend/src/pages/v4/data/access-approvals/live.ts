import { useEffect, useRef } from "react";

import {
  useCancelAccessRequest,
  useCreateAccessRequest,
  useRetryDelegatedApprovalDispatch,
  useReviewAccessRequest,
  useRevokeAccessRequest
} from "@app/hooks/api/accessApproval/mutation";
import {
  useGetAccessApprovalPolicies,
  useGetAccessApprovalRequests,
  useGetAccessRequestsCount
} from "@app/hooks/api/accessApproval/queries";
import {
  isDelegatedDispatchRetrying,
  noteDelegatedDispatchRetryStatuses,
  useDelegatedDispatchRetryVersion
} from "@app/hooks/api/accessApproval/retrying-delegated-dispatch";
import { useDelegatedApprovalOptions } from "@app/hooks/api/delegatedApprovals/queries";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api/projects/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { AccessApprovalsAdapter } from "./contract";

export const accessApprovalsLive: AccessApprovalsAdapter = {
  useLicense: (orgId) => {
    const subscription = useGetOrgSubscription({ orgID: orgId });
    return {
      data: subscription.data
        ? {
            secretApproval: Boolean(subscription.data.secretApproval),
            honeyTokens: Boolean(subscription.data.honeyTokens)
          }
        : undefined,
      isPending: subscription.isPending,
      error: subscription.error
    };
  },
  usePolicies: (projectSlug) => useGetAccessApprovalPolicies({ projectSlug }),
  useRequests: ({ projectSlug, envSlug, authorUserId }) => {
    const query = useGetAccessApprovalRequests({ projectSlug, envSlug, authorUserId });
    const cameFromFetch = useRef(false);
    useEffect(() => {
      if (query.isFetching) {
        cameFromFetch.current = true;
        return;
      }
      if (!cameFromFetch.current || !query.data) return;
      cameFromFetch.current = false;
      noteDelegatedDispatchRetryStatuses(
        query.data.map((request) => ({ id: request.id, status: request.delegatedApproval?.status }))
      );
    }, [query.isFetching, query.data]);
    return query;
  },
  useRequestCount: (projectSlug) => useGetAccessRequestsCount({ projectSlug }),
  useMembers: (projectId) => {
    const members = useGetWorkspaceUsers(projectId, true);
    return {
      data: members.data?.map((member) => member.user),
      isPending: members.isPending,
      error: members.error
    };
  },
  useGroups: (projectId) => {
    const groups = useListWorkspaceGroups(projectId);
    return {
      data: groups.data?.map((membership) => ({
        id: membership.group.id,
        name: membership.group.name
      })),
      isPending: groups.isPending,
      error: groups.error
    };
  },
  useDelegatedApprovalOptions: (enabled) => useDelegatedApprovalOptions({ enabled }),
  useIsDispatchRetrying: () => {
    useDelegatedDispatchRetryVersion();
    return isDelegatedDispatchRetrying;
  },
  useCreateRequest: useCreateAccessRequest,
  useReviewRequest: useReviewAccessRequest,
  useRevokeRequest: useRevokeAccessRequest,
  useRetryDispatch: useRetryDelegatedApprovalDispatch,
  useCancelRequest: useCancelAccessRequest
};
