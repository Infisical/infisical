import { useEffect, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import ms from "ms";

import { apiRequest } from "@app/config/request";
import { resolveCertManagerProjectId } from "@app/helpers/certManagerActiveProject";
import { useReviewAccessRequest } from "@app/hooks/api/accessApproval/mutation";
import type { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { useGetServerConfig } from "@app/hooks/api/admin/queries";
import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies/types";
import { approvalRequestQuery, useApproveApprovalRequest } from "@app/hooks/api/approvalRequests";
import {
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  type CertRequestRequestData,
  type CertRevocationRequestData,
  type CodeSigningRequestData,
  type TApprovalRequest
} from "@app/hooks/api/approvalRequests/types";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import {
  certManagerInstanceKeys,
  fetchCertManagerInstanceState
} from "@app/hooks/api/certManagerInstance";
import { NotificationType, type TUserNotification } from "@app/hooks/api/notifications/types";
import { useGetOrganizationById, useGetOrgProductStats } from "@app/hooks/api/organization/queries";
import { pamKeys } from "@app/hooks/api/pam/queries";
import type { TPamAccessRequest } from "@app/hooks/api/pam/types";
import { fetchProjectById, useListWorkspaceCertificates } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useUpdateSecretApprovalReviewStatus } from "@app/hooks/api/secretApprovalRequest/mutation";
import { useGetSecretApprovalRequestDetailsList } from "@app/hooks/api/secretApprovalRequest/queries";
import {
  ApprovalStatus,
  type TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";
import { useGetOrgSecretsAccessVolume } from "@app/hooks/api/secretInsights/queries";
import { useGetOrgUserAccess } from "@app/hooks/api/users/queries";

import { useV4Session } from "../session/contract";
import { shellLive } from "../shell/live";
import type {
  HomeAdapter,
  HomeApproval,
  HomeApprovalTarget,
  HomeAttention,
  HomeDay
} from "./contract";

const DAY = 86_400_000;

const ATTENTION_PRODUCT: Partial<Record<NotificationType, ProjectType | undefined>> = {
  [NotificationType.SECRET_ROTATION_FAILED]: ProjectType.SecretManager,
  [NotificationType.SECRET_SYNC_FAILED]: ProjectType.SecretManager,
  [NotificationType.CREDENTIAL_ROTATION_FAILED]: ProjectType.PAM,
  [NotificationType.PKI_SYNC_FAILED]: ProjectType.CertificateManager,
  [NotificationType.SECRET_SCANNING_SCAN_FAILED]: ProjectType.SecretScanning,
  [NotificationType.GATEWAY_HEALTH_ALERT]: undefined,
  [NotificationType.RELAY_HEALTH_ALERT]: undefined
};

type Parsed =
  | { kind: "secret-change"; requestId: string; projectId: string }
  | { kind: "access"; requestId: string; projectId: string }
  | { kind: "policy"; requestId: string; policyType: ApprovalPolicyType };

const parseApproval = (notification: TUserNotification): Parsed | undefined => {
  if (!notification.link) return undefined;
  let url: URL;
  try {
    url = new URL(notification.link, window.location.origin);
  } catch {
    return undefined;
  }
  const requestId = url.searchParams.get("requestId");
  const project = url.pathname.match(/\/projects\/secret-management\/([^/]+)\/approval/)?.[1];
  if (notification.type === NotificationType.SECRET_CHANGE_REQUEST && project && requestId)
    return { kind: "secret-change", requestId, projectId: project };
  if (notification.type === NotificationType.ACCESS_APPROVAL_REQUEST && project && requestId)
    return { kind: "access", requestId, projectId: project };
  if (notification.type !== NotificationType.APPROVAL_REQUIRED) return undefined;
  const certRequestId = url.pathname.match(/\/cert-manager\/approvals\/([^/]+)/)?.[1];
  const policyType = url.searchParams.get("policyType") as ApprovalPolicyType | null;
  if (certRequestId && policyType && Object.values(ApprovalPolicyType).includes(policyType))
    return { kind: "policy", requestId: certRequestId, policyType };
  return undefined;
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const personName = (person?: { firstName?: string; lastName?: string; email?: string } | null) =>
  [person?.firstName, person?.lastName].filter(Boolean).join(" ") || person?.email || "Someone";

const secretChangeRow = (
  base: Pick<HomeApproval, "id" | "createdAt" | "href">,
  request: TSecretApprovalRequest,
  project: { id: string; name: string }
): HomeApproval => {
  const keys = request.commits.map((commit) => commit.secretKey ?? commit.secretVersion?.secretKey);
  return {
    ...base,
    product: ProjectType.SecretManager,
    subject: keys.length === 1 && keys[0] ? keys[0] : plural(keys.length, "secret"),
    action: ` changed in ${project.name}, ${request.environment}`,
    description: `${request.committerIdentity?.name ?? personName(request.committerUser)}. Needs ${plural(request.policy.approvals, "approval")}.`,
    target: {
      kind: "secret-change",
      requestId: request.id,
      projectId: project.id
    }
  };
};

const accessRow = (
  base: Pick<HomeApproval, "id" | "createdAt" | "href">,
  request: TAccessApprovalRequest,
  project: { name: string; slug: string }
): HomeApproval => ({
  ...base,
  product: ProjectType.SecretManager,
  subject: project.name,
  action: ` access${request.isTemporary && request.temporaryRange ? ` for ${request.temporaryRange}` : ""}, ${request.environmentName}`,
  description: `${personName(request.requestedByUser)}. Needs ${plural(request.policy.approvals, "approval")}.`,
  target: { kind: "access", requestId: request.id, projectSlug: project.slug }
});

const policyRow = (
  base: Pick<HomeApproval, "id" | "createdAt" | "href">,
  request: TApprovalRequest
): HomeApproval => {
  const data = request.requestData.requestData;
  const why = request.justification ? `. ${request.justification}` : "";
  const shared = {
    ...base,
    description: `${request.requesterName}${why}.`,
    target: {
      kind: "policy",
      requestId: request.id,
      policyType: request.type
    } as const
  };
  if (request.type === ApprovalPolicyType.CertRevocation) {
    const revocation = data as CertRevocationRequestData;
    return {
      ...shared,
      product: ProjectType.CertificateManager,
      subject: revocation.commonName,
      action: " certificate revocation"
    };
  }
  if (request.type === ApprovalPolicyType.CertCodeSigning) {
    const signing = data as CodeSigningRequestData;
    return {
      ...shared,
      product: ProjectType.CertificateManager,
      subject: signing.signerName,
      action: " signing request"
    };
  }
  const cert = data as CertRequestRequestData;
  return {
    ...shared,
    product: ProjectType.CertificateManager,
    subject: cert.certificateRequest.commonName ?? cert.profileName,
    action: " certificate request"
  };
};

const humanDuration = (duration: string) => {
  const parsed = ms(duration);
  return typeof parsed === "number" ? ms(parsed, { long: true }) : duration;
};

const pamRow = (request: TPamAccessRequest, href: string): HomeApproval => {
  const why = request.justification ? `. ${request.justification}` : "";
  const duration = request.requestData?.requestData.duration;
  return {
    id: request.id,
    createdAt: request.createdAt,
    href,
    product: ProjectType.PAM,
    subject: request.accountName ?? "Account",
    action: duration ? ` access for ${humanDuration(duration)}` : " access",
    description: `${request.requesterName}${why}.`,
    target: {
      kind: "policy",
      requestId: request.id,
      policyType: ApprovalPolicyType.PamAccess
    }
  };
};

const BYPASS_TITLE = "Access approval bypassed";

const unescape = (text: string) => text.replace(/\\(.)/g, "$1");

const breakGlassRow = (
  notification: TUserNotification,
  orgId: string,
  recent: TPamAccessRequest[]
): HomeApproval => {
  const body = notification.body ?? "";
  const [requester, account] = [...body.matchAll(/\*\*(.+?)\*\*/g)].map((match) =>
    unescape(match[1])
  );
  const sentAt = new Date(notification.createdAt).getTime();
  const request = recent
    .filter(
      (item) =>
        item.isBreakGlass && item.accountName === account && item.requesterName === requester
    )
    .sort(
      (a, b) =>
        Math.abs(new Date(a.updatedAt).getTime() - sentAt) -
        Math.abs(new Date(b.updatedAt).getTime() - sentAt)
    )[0];
  const folderId = request?.requestData?.requestData.folderId;
  const reason =
    request?.bypassReason ?? body.match(/Reason: "([\s\S]*)"$/)?.[1]?.replace(/\\([\s\S])/g, "$1");
  return {
    id: notification.id,
    createdAt: notification.createdAt,
    href: folderId
      ? `/organizations/${orgId}/pam/accounts?folderId=${folderId}&tab=approvals`
      : (notification.link ?? undefined),
    product: ProjectType.PAM,
    subject: "Break-glass",
    action: account ? ` access to ${account}` : " access",
    description: `${[requester ?? "Someone", reason].filter(Boolean).join(". ")}.`,
    urgent: true
  };
};

const votedOnCurrentStep = (request: TApprovalRequest, userId: string) =>
  request.steps
    .find((step) => step.status === ApprovalRequestStepStatus.InProgress)
    ?.approvals.some((approval) => approval.approverUserId === userId) ?? false;

const isExpired = (request: { expiresAt?: Date | string | null }) =>
  Boolean(request.expiresAt && new Date(request.expiresAt) < new Date());

const awaitsReview = (request: TApprovalRequest | undefined, userId: string) =>
  Boolean(
    request &&
    request.status === ApprovalRequestStatus.Pending &&
    request.canReview &&
    !isExpired(request) &&
    !votedOnCurrentStep(request, userId)
  );

const useToday = () => useState(() => new Date(new Date().setHours(0, 0, 0, 0)))[0];

export const homeLive: HomeAdapter = {
  useSecretReads: (orgId) => {
    const analytics = Boolean(useGetServerConfig().data?.isClickhouseAuditLogEnabled);
    const query = useGetOrgSecretsAccessVolume(orgId, { enabled: analytics });
    if (!analytics) return { data: null, isPending: false, error: null };
    return {
      data: query.data && {
        total: query.data.days.reduce((sum, day) => sum + day.total, 0),
        days: query.data.days.map((day) => ({
          date: day.date,
          value: day.total
        }))
      },
      isPending: query.isPending,
      error: query.error
    };
  },
  useFindings: (orgId) => {
    const query = useGetOrgProductStats(orgId);
    const scanning = query.data?.secretScanning;
    return {
      data:
        scanning &&
        (scanning.dataSourcesCount
          ? {
              findings: scanning.findingsCount,
              dataSources: scanning.dataSourcesCount
            }
          : null),
      isPending: query.isPending,
      error: query.error
    };
  },
  useExpiringCertificates: (orgId) => {
    const today = useToday();
    const { projects } = useV4Session();
    const stats = useGetOrgProductStats(orgId);
    const instance = useQuery({
      queryKey: certManagerInstanceKeys.state(orgId),
      queryFn: fetchCertManagerInstanceState
    });
    const projectId =
      resolveCertManagerProjectId({
        orgId,
        activeProjectId: instance.data?.activeProjectId ?? null,
        memberProjectIds: projects.map((project) => project.id)
      }) ?? "";
    const error = stats.error ?? instance.error;
    const setUp = Boolean(stats.data?.certificateManager.certificatesCount) && Boolean(projectId);
    const end = new Date(today.getTime() + 30 * DAY);
    const certificates = useListWorkspaceCertificates({
      projectId,
      offset: 0,
      limit: 100,
      status: CertStatus.ACTIVE,
      notAfterFrom: today,
      notAfterTo: end
    });
    if (error) return { data: undefined, isPending: false, error };
    if (stats.isPending || instance.isPending)
      return { data: undefined, isPending: true, error: null };
    if (!setUp) return { data: null, isPending: false, error: null };
    const list = certificates.data?.certificates;
    const days: HomeDay[] = Array.from({ length: 31 }, (_, index) => {
      const cutoff = today.getTime() + (index + 1) * DAY;
      return {
        date: new Date(today.getTime() + index * DAY).toISOString(),
        value: (list ?? []).filter((cert) => new Date(cert.notAfter).getTime() < cutoff).length
      };
    });
    return {
      data: certificates.data && { count: certificates.data.totalCount, days },
      isPending: certificates.isPending,
      error: certificates.error
    };
  },
  useQueue: (orgId) => {
    const { user, projects } = useV4Session();
    const queryClient = useQueryClient();
    const notifications = shellLive.useNotifications(orgId);
    useEffect(() => {
      const timer = window.setInterval(
        () =>
          queryClient.invalidateQueries({
            predicate: (query) => {
              const request = query.state.data as TSecretApprovalRequest | undefined;
              return query.queryKey[1] === "secret-approval-request-detail" && !request?.hasMerged;
            }
          }),
        30_000
      );
      return () => window.clearInterval(timer);
    }, [queryClient]);
    const all = notifications.data ?? [];
    const parsed = all
      .map((notification) => ({
        notification,
        parsed: parseApproval(notification)
      }))
      .filter((entry): entry is { notification: TUserNotification; parsed: Parsed } =>
        Boolean(entry.parsed)
      )
      .filter(
        (entry, index, list) =>
          list.findIndex((other) => other.parsed.requestId === entry.parsed.requestId) === index
      );
    const secretChanges = parsed.filter((entry) => entry.parsed.kind === "secret-change");
    const changeDetails = useGetSecretApprovalRequestDetailsList({
      ids: secretChanges.map((entry) => entry.parsed.requestId)
    });
    const accessProjects = [
      ...new Set(
        parsed.flatMap((entry) => (entry.parsed.kind === "access" ? [entry.parsed.projectId] : []))
      )
    ];
    const accessLists = useQueries({
      queries: accessProjects.map((projectId) => ({
        queryKey: ["v4-home", "access-requests", projectId],
        refetchInterval: 30_000,
        queryFn: async () => {
          const project = await fetchProjectById(projectId);
          const { data } = await apiRequest.get<{
            requests: TAccessApprovalRequest[];
          }>("/api/v1/access-approvals/requests", {
            params: { projectSlug: project.slug }
          });
          return {
            project: { name: project.name, slug: project.slug },
            requests: data.requests
          };
        }
      }))
    });
    const policyEntries = parsed.filter((entry) => entry.parsed.kind === "policy");
    const policyRequests = useQueries({
      queries: policyEntries.map((entry) => ({
        ...approvalRequestQuery.getById({
          requestId: entry.parsed.requestId,
          policyType: (entry.parsed as Extract<Parsed, { kind: "policy" }>).policyType
        }),
        refetchInterval: (query: { state: { data?: TApprovalRequest } }) =>
          query.state.data && query.state.data.status !== ApprovalRequestStatus.Pending
            ? false
            : 30_000
      }))
    });
    const pamProjectId = useGetOrganizationById(orgId).data?.pamProjectId;
    const pamMember = Boolean(
      pamProjectId && projects.some((project) => project.id === pamProjectId)
    );
    const pamPending = useQuery({
      queryKey: pamKeys.pendingMyApproval(),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ requests: TPamAccessRequest[] }>(
          "/api/v1/pam/access-requests/pending-my-approval"
        );
        return data.requests;
      },
      enabled: pamMember,
      refetchInterval: 30_000
    });
    const pamRequests = pamPending.data ?? [];
    const pamDetails = useQueries({
      queries: pamRequests.map((request) => ({
        ...approvalRequestQuery.getById({
          requestId: request.id,
          policyType: ApprovalPolicyType.PamAccess
        }),
        refetchInterval: (query: { state: { data?: TApprovalRequest } }) =>
          query.state.data && query.state.data.status !== ApprovalRequestStatus.Pending
            ? false
            : 30_000
      }))
    });
    const bypasses = all.filter(
      (notification) =>
        notification.type === NotificationType.ACCESS_APPROVAL_REQUEST_UPDATED &&
        notification.title === BYPASS_TITLE &&
        !notification.isRead
    );
    const recentPam = useQuery({
      queryKey: pamKeys.listAccessRequests({ limit: 100 }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          requests: TPamAccessRequest[];
          totalCount: number;
        }>("/api/v1/pam/access-requests", { params: { limit: 100 } });
        return data;
      },
      enabled: pamMember && bypasses.length > 0
    });
    const lookups = [
      ...changeDetails,
      ...accessLists,
      ...policyRequests,
      ...(pamMember ? [pamPending] : []),
      ...pamDetails
    ];
    const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? id;
    const approvals = parsed.flatMap(({ notification, parsed: entry }): HomeApproval[] => {
      const base = {
        id: notification.id,
        createdAt: notification.createdAt,
        href: notification.link ?? undefined
      };
      if (entry.kind === "secret-change") {
        const request =
          changeDetails[secretChanges.findIndex((item) => item.parsed === entry)]?.data;
        const reviewed = request?.reviewers.some(
          (reviewer) => reviewer.userId === user.id && reviewer.status !== ApprovalStatus.PENDING
        );
        const ownBlocked =
          request?.committerUserId === user.id && request.policy.allowedSelfApprovals === false;
        if (!request || request.status !== "open" || request.hasMerged || reviewed || ownBlocked)
          return [];
        return [
          secretChangeRow(base, request, {
            id: entry.projectId,
            name: projectName(entry.projectId)
          })
        ];
      }
      if (entry.kind === "access") {
        const list = accessLists[accessProjects.indexOf(entry.projectId)]?.data;
        const request = list?.requests.find((item) => item.id === entry.requestId);
        const reviewed = request?.reviewers.some(
          (reviewer) => reviewer.userId === user.id && reviewer.status !== ApprovalStatus.PENDING
        );
        const ownBlocked =
          request?.requestedByUserId === user.id && !request.policy.allowedSelfApprovals;
        if (
          !list ||
          !request ||
          request.status !== ApprovalStatus.PENDING ||
          isExpired(request) ||
          reviewed ||
          ownBlocked
        )
          return [];
        return [accessRow(base, request, list.project)];
      }
      const request =
        policyRequests[policyEntries.findIndex((item) => item.parsed === entry)]?.data;
      if (!request || !awaitsReview(request, user.id)) return [];
      return [policyRow(base, request)];
    });
    const pamApprovals = pamRequests.flatMap((request, index): HomeApproval[] => {
      const detail = pamDetails[index]?.data;
      if (!awaitsReview(detail, user.id)) return [];
      return [
        pamRow(request, `/organizations/${orgId}/pam/approval-requests?requestId=${request.id}`)
      ];
    });
    const breakGlass = bypasses.map((notification) =>
      breakGlassRow(notification, orgId, recentPam.data?.requests ?? [])
    );
    const attention = all.flatMap((notification): HomeAttention[] =>
      notification.type in ATTENTION_PRODUCT && !notification.isRead
        ? [
            {
              id: notification.id,
              product: ATTENTION_PRODUCT[notification.type],
              title: notification.title,
              description: notification.body ?? undefined,
              createdAt: notification.createdAt,
              href: notification.link ?? undefined
            }
          ]
        : []
    );
    return {
      data: notifications.data && {
        approvals: [...approvals, ...pamApprovals, ...breakGlass].sort(
          (a, b) =>
            Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) ||
            b.createdAt.localeCompare(a.createdAt)
        ),
        attention
      },
      isPending: notifications.isPending || lookups.some((lookup) => lookup.isPending),
      error: notifications.error ?? lookups.find((lookup) => lookup.error)?.error ?? null
    };
  },
  useApprove: () => {
    const queryClient = useQueryClient();
    const secretChange = useUpdateSecretApprovalReviewStatus();
    const access = useReviewAccessRequest();
    const policy = useApproveApprovalRequest();
    const approve = async (target: HomeApprovalTarget) => {
      if (target.kind === "secret-change")
        await secretChange.mutateAsync({
          id: target.requestId,
          projectId: target.projectId,
          status: ApprovalStatus.APPROVED
        });
      else if (target.kind === "access") {
        await access.mutateAsync({
          requestId: target.requestId,
          projectSlug: target.projectSlug,
          status: "approved"
        });
        await queryClient.invalidateQueries({
          queryKey: ["v4-home", "access-requests"]
        });
      } else {
        await policy.mutateAsync({
          requestId: target.requestId,
          policyType: target.policyType as ApprovalPolicyType
        });
        if (target.policyType === ApprovalPolicyType.PamAccess)
          await queryClient.invalidateQueries({ queryKey: pamKeys.accessRequest() });
      }
    };
    return {
      mutateAsync: approve,
      isPending: secretChange.isPending || access.isPending || policy.isPending
    };
  },
  useSetup: (orgId) => {
    const { projects } = useV4Session();
    const stats = useGetOrgProductStats(orgId);
    const reads = homeLive.useSecretReads(orgId);
    const members = useGetOrgUserAccess(orgId);
    return {
      data:
        stats.data && members.data && !reads.isPending
          ? {
              hasProject: projects.length > 0,
              hasSecrets: stats.data.secretManager.secretsCount > 0,
              hasReads: reads.data == null ? null : reads.data.total > 0,
              members: members.data.length
            }
          : undefined,
      isPending: stats.isPending || members.isPending || reads.isPending,
      error: stats.error ?? members.error
    };
  }
};
