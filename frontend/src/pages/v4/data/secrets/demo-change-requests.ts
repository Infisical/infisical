import { AxiosError } from "axios";

import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  ApprovalStatus,
  BulkChangeRequestAction,
  CommitType,
  SecretApprovalRequestOrderBy,
  type TBulkChangeRequestResult,
  type TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";

import type { SecretsChangeRequestsAdapter } from "./contract-change-requests";
import { CHANGE_REQUEST_SELF } from "./demo-change-requests-seed";
import { type DemoStore, now, secretAt, useScenario, useStore } from "./demo-store";

const reviewed = (request: TSecretApprovalRequest, patch: Partial<TSecretApprovalRequest>) => ({
  ...request,
  ...patch,
  updatedAt: now()
});

const refused = (message: string) =>
  new AxiosError(message, "400", undefined, undefined, {
    status: 400,
    statusText: "Bad Request",
    headers: {},
    config: { headers: {} as never },
    data: { message }
  });

const committerOf = (request: TSecretApprovalRequest) =>
  request.committerUser
    ? `${request.committerUser.firstName} ${request.committerUser.lastName} ${request.committerUser.email}`
    : (request.committerIdentity?.name ?? "");

const approvalsOf = (request: TSecretApprovalRequest) =>
  request.policy.approvers.filter(({ userId }) =>
    request.reviewers.some(
      (reviewer) => reviewer.userId === userId && reviewer.status === ApprovalStatus.APPROVED
    )
  ).length;

const useApprovals = (projectId?: string) => {
  const scenario = useScenario();
  const { approvals } = useStore().use();
  if (scenario === "empty") return [];
  return projectId ? approvals.filter((request) => request.project === projectId) : approvals;
};

const usePendingState = () => {
  const scenario = useScenario();
  return {
    isPending: scenario === "loading",
    error: scenario === "error" ? new Error("The change requests could not be loaded.") : null
  };
};

const sortValue = (request: TSecretApprovalRequest, orderBy?: SecretApprovalRequestOrderBy) => {
  if (orderBy === SecretApprovalRequestOrderBy.Environment) return request.environment;
  if (orderBy === SecretApprovalRequestOrderBy.Author) return committerOf(request).toLowerCase();
  if (orderBy === SecretApprovalRequestOrderBy.SecretPath) return request.secretPath;
  return request.createdAt;
};

const review = (store: DemoStore, id: string, status: ApprovalStatus, comment?: string) => {
  const request = store.get().approvals.find((entry) => entry.id === id);
  if (!request) throw refused("The change request no longer exists.");
  if (request.status !== "open") throw refused("This change request is already closed.");
  if (!request.policy.approvers.some(({ userId }) => userId === CHANGE_REQUEST_SELF.userId))
    throw refused("You are not an approver on this change request's policy.");
  store.update((state) => ({
    ...state,
    approvals: state.approvals.map((entry) =>
      entry.id === id
        ? reviewed(entry, {
            reviewers: [
              ...entry.reviewers.filter(({ userId }) => userId !== CHANGE_REQUEST_SELF.userId),
              {
                ...CHANGE_REQUEST_SELF,
                status,
                comment: comment ?? "",
                isOrgMembershipActive: true,
                createdAt: new Date()
              }
            ]
          })
        : entry
    )
  }));
};

const merge = (store: DemoStore, id: string, bypassReason?: string, requireApprovals = false) => {
  const request = store.get().approvals.find((entry) => entry.id === id);
  if (!request) throw refused("The change request no longer exists.");
  if (request.status !== "open") throw refused("This change request is already closed.");
  const missing = request.policy.approvals - approvalsOf(request);
  if (missing > 0 && (requireApprovals || !bypassReason))
    throw refused(`Secret approval request needs ${missing} approval(s)`);
  const timestamp = now();
  store.update((state) => {
    let { secrets } = state;
    request.commits.forEach((commit) => {
      const match = secretAt(
        request.project,
        request.environment,
        request.secretPath,
        commit.secretKey
      );
      if (commit.op === CommitType.DELETE) {
        secrets = secrets.filter((secret) => !match(secret));
        return;
      }
      const value = commit.secretValue ?? "";
      if (secrets.some(match)) {
        secrets = secrets.map((secret) =>
          match(secret)
            ? { ...secret, value, version: secret.version + 1, updatedAt: timestamp }
            : secret
        );
        return;
      }
      secrets = [
        ...secrets,
        {
          id: crypto.randomUUID(),
          projectId: request.project,
          env: request.environment,
          path: request.secretPath,
          key: commit.secretKey,
          value,
          secretValueHidden: false,
          version: 1,
          comment: commit.secretComment ?? "",
          tags: [],
          secretMetadata: [],
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ];
    });
    return {
      ...state,
      secrets,
      approvals: state.approvals.map((entry) =>
        entry.id === id
          ? reviewed(entry, {
              hasMerged: true,
              status: "close",
              bypassReason: missing > 0 ? (bypassReason ?? null) : null,
              statusChangedByUserId: CHANGE_REQUEST_SELF.userId,
              statusChangedByUser: CHANGE_REQUEST_SELF
            })
          : entry
      )
    };
  });
};

export const secretsChangeRequestsDemo: SecretsChangeRequestsAdapter = {
  useApprovalRequests: ({
    projectId,
    status,
    environment,
    committer,
    search,
    offset = 0,
    limit = 20,
    orderBy,
    orderDirection
  }) => {
    const needle = (search ?? "").trim().toLowerCase();
    const direction = orderDirection === OrderByDirection.ASC ? 1 : -1;
    const matched = useApprovals(projectId)
      .filter(
        (request) =>
          (!status || request.status === status) &&
          (!environment || request.environment === environment) &&
          (!committer || request.committerUserId === committer) &&
          (!needle ||
            [request.environment, request.secretPath, committerOf(request)].some((text) =>
              text.toLowerCase().includes(needle)
            ) ||
            request.commits.some((commit) => commit.secretKey.toLowerCase().includes(needle)))
      )
      .sort(
        (a, b) =>
          direction * sortValue(a, orderBy).localeCompare(sortValue(b, orderBy)) ||
          b.createdAt.localeCompare(a.createdAt)
      );
    const { isPending, error } = usePendingState();
    return {
      data: isPending
        ? undefined
        : { approvals: matched.slice(offset, offset + limit), totalCount: matched.length },
      isPending,
      error
    };
  },
  useApprovalRequestCount: ({ projectId }) => {
    const requests = useApprovals(projectId);
    return {
      data: {
        open: requests.filter((request) => request.status === "open").length,
        closed: requests.filter((request) => request.status === "close").length
      },
      isPending: false,
      error: null
    };
  },
  useApprovalRequestDetails: ({ id }) => {
    const request = useApprovals().find((entry) => entry.id === id);
    return {
      data: request,
      isPending: false,
      error: request || !id ? null : new Error("Change request not found")
    };
  },
  useApprovalRequestDetailsList: (ids) => {
    const approvals = useApprovals();
    return ids.map((id) => {
      const data = approvals.find((entry) => entry.id === id);
      return { data, isPending: false, isError: !data, error: null, refetch: () => undefined };
    });
  },
  useSecretImports: ({ projectId, environment, path, enabled }) => {
    const { imports } = useStore().use();
    return {
      data: enabled
        ? imports.filter(
            (entry) =>
              entry.projectId === projectId &&
              entry.environment === environment &&
              entry.path === path
          )
        : undefined,
      isPending: false,
      error: null
    };
  },
  useReviewApprovalRequest: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ id, status, comment }) => {
        review(store, id, status, comment);
        return {};
      }
    };
  },
  useUpdateApprovalRequestStatus: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ id, status }) => {
        store.update((state) => ({
          ...state,
          approvals: state.approvals.map((request) =>
            request.id === id
              ? reviewed(request, {
                  status,
                  statusChangedByUserId: CHANGE_REQUEST_SELF.userId,
                  statusChangedByUser: CHANGE_REQUEST_SELF
                })
              : request
          )
        }));
        return {};
      }
    };
  },
  useMergeApprovalRequest: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ id, bypassReason }) => {
        merge(store, id, bypassReason);
        return {};
      }
    };
  },
  useBulkActOnApprovalRequests: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ action, comment, requestIds }) =>
        requestIds.map((id): TBulkChangeRequestResult => {
          try {
            if (action === BulkChangeRequestAction.Merge) merge(store, id, undefined, true);
            else
              review(
                store,
                id,
                action === BulkChangeRequestAction.Approve
                  ? ApprovalStatus.APPROVED
                  : ApprovalStatus.REJECTED,
                comment
              );
            return { id, isSuccess: true };
          } catch (error) {
            return {
              id,
              isSuccess: false,
              errorMessage: (error as AxiosError<{ message: string }>).response?.data?.message
            };
          }
        })
    };
  }
};
