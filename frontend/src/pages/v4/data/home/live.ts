import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useReviewAccessRequest } from "@app/hooks/api/accessApproval/mutation";
import type { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { useGetServerConfig } from "@app/hooks/api/admin/queries";
import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies/types";
import { approvalRequestQuery, useApproveApprovalRequest } from "@app/hooks/api/approvalRequests";
import {
  ApprovalRequestStatus,
  type CertRequestRequestData,
  type CertRevocationRequestData,
  type CodeSigningRequestData,
  type PamAccessRequestData,
  type TApprovalRequest
} from "@app/hooks/api/approvalRequests/types";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import {
  certManagerInstanceKeys,
  fetchCertManagerInstanceState
} from "@app/hooks/api/certManagerInstance";
import { NotificationType, type TUserNotification } from "@app/hooks/api/notifications/types";
import { useGetOrgProductStats } from "@app/hooks/api/organization/queries";
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
  if (url.pathname.endsWith("/pam/approval-requests") && requestId)
    return {
      kind: "policy",
      requestId,
      policyType: ApprovalPolicyType.PamAccess
    };
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
  projectName: string
): HomeApproval => {
  const keys = request.commits.map((commit) => commit.secretKey ?? commit.secretVersion?.secretKey);
  return {
    ...base,
    product: ProjectType.SecretManager,
    subject: keys.length === 1 && keys[0] ? keys[0] : plural(keys.length, "secret"),
    action: ` changed in ${projectName}, ${request.environment}`,
    description: `${request.committerIdentity?.name ?? personName(request.committerUser)}. Needs ${plural(request.policy.approvals, "approval")}.`,
    target: {
      kind: "secret-change",
      requestId: request.id,
      projectId: request.project
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
  if (request.type === ApprovalPolicyType.PamAccess) {
    const pam = data as PamAccessRequestData;
    return {
      ...shared,
      product: ProjectType.PAM,
      subject: pam.accountName ?? pam.resourceName ?? "Account",
      action: ` access for ${pam.accessDuration}`,
      urgent: request.isBreakGlass,
      target: request.isBreakGlass ? undefined : shared.target
    };
  }
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
    const stats = useGetOrgProductStats(orgId);
    const instance = useQuery({
      queryKey: certManagerInstanceKeys.state(orgId),
      queryFn: fetchCertManagerInstanceState
    });
    const projectId = instance.data?.activeProjectId ?? "";
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
    if (stats.isPending || instance.isPending)
      return { data: undefined, isPending: true, error: null };
    if (!setUp)
      return {
        data: null,
        isPending: false,
        error: stats.error ?? instance.error
      };
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
    const notifications = shellLive.useNotifications(orgId);
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
      queries: policyEntries.map((entry) =>
        approvalRequestQuery.getById({
          requestId: entry.parsed.requestId,
          policyType: (entry.parsed as Extract<Parsed, { kind: "policy" }>).policyType
        })
      )
    });
    const lookups = [...changeDetails, ...accessLists, ...policyRequests];
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
        if (!request || request.status !== "open" || request.hasMerged || reviewed) return [];
        return [secretChangeRow(base, request, projectName(request.project))];
      }
      if (entry.kind === "access") {
        const list = accessLists[accessProjects.indexOf(entry.projectId)]?.data;
        const request = list?.requests.find((item) => item.id === entry.requestId);
        if (!list || !request || request.status !== ApprovalStatus.PENDING) return [];
        return [accessRow(base, request, list.project)];
      }
      const request =
        policyRequests[policyEntries.findIndex((item) => item.parsed === entry)]?.data;
      if (!request || request.status !== ApprovalRequestStatus.Pending || !request.canReview)
        return [];
      return [policyRow(base, request)];
    });
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
        approvals: approvals.sort(
          (a, b) =>
            Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) ||
            b.createdAt.localeCompare(a.createdAt)
        ),
        attention
      },
      isPending: notifications.isPending || lookups.some((lookup) => lookup.isPending),
      error: notifications.error
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
      } else
        await policy.mutateAsync({
          requestId: target.requestId,
          policyType: target.policyType as ApprovalPolicyType
        });
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
      data: stats.data &&
        members.data && {
          hasProject: projects.length > 0,
          hasSecrets: stats.data.secretManager.secretsCount > 0,
          hasReads: reads.data === null ? null : Boolean(reads.data?.total),
          members: members.data.length
        },
      isPending: stats.isPending || members.isPending,
      error: stats.error ?? members.error
    };
  }
};
