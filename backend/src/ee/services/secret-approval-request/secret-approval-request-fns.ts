import { TSecretApprovalRequests } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { OrderByDirection } from "@app/lib/types";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";
import { SecretApprovalRequestOrderBy } from "./secret-approval-request-types";

type TSendApprovalEmails = {
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findProjectWithOrg">;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectId: string;
  secretApprovalRequest: Pick<TSecretApprovalRequests, "id" | "policyId">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
};

export const sendApprovalEmailsFn = async ({
  secretApprovalPolicyDAL,
  projectDAL,
  smtpService,
  projectId,
  secretApprovalRequest,
  notificationService
}: TSendApprovalEmails) => {
  const cfg = getConfig();

  const policy = await secretApprovalPolicyDAL.findById(secretApprovalRequest.policyId);

  const project = await projectDAL.findProjectWithOrg(projectId);

  await notificationService.createUserNotifications(
    policy.userApprovers.map((approver) => ({
      userId: approver.userId,
      orgId: project.orgId,
      type: NotificationType.SECRET_CHANGE_REQUEST,
      title: "Secret Change Request",
      body: `You have a new secret change request pending your review for the project **${project.name}** in the organization **${project.organization.name}**.`,
      link: `/organizations/${project.orgId}/projects/secret-management/${project.id}/approval?requestId=${secretApprovalRequest.id}`
    }))
  );

  // now we need to go through each of the reviewers and print out all the commits that they need to approve
  for await (const reviewerUser of policy.userApprovers) {
    await smtpService.sendMail({
      recipients: [reviewerUser?.email as string],
      subjectLine: "Infisical Secret Change Request",

      substitutions: {
        firstName: reviewerUser.firstName,
        projectName: project.name,
        organizationName: project.organization.name,
        approvalUrl: `${cfg.SITE_URL}/organizations/${project.orgId}/projects/secret-management/${project.id}/approval?requestId=${secretApprovalRequest.id}`
      },
      template: SmtpTemplates.SecretApprovalRequestNeedsReview
    });
  }
};

export type TSecretUpdateCommitCandidate = {
  key: string;
  secretId?: string | null;
  secret?: { id: string; key: string } | null;
  secretVersion?: { key: string } | null;
};

/**
 * Decides whether an update commit of a secret approval request can no longer be applied at merge time.
 * `commit.secret` is the referenced secret in its current DB state (nullish if since deleted) and
 * `secretWithSameKey` is the folder secret currently holding the commit's key, if any.
 *
 * Updates apply last-writer-wins by secret identity: a rename still applies even if the secret was
 * renamed by another merge in the meantime.
 */
export const hasSecretUpdateCommitConflict = (
  commit: TSecretUpdateCommitCandidate,
  secretWithSameKey?: { id: string }
): boolean => {
  if (!commit.secretId || !commit.secret) return true; // referenced secret was deleted (or recreated)
  // whoever currently holds the commit's key must be the referenced secret itself
  if (secretWithSameKey) return secretWithSameKey.id !== commit.secretId;
  // the key is free: only a rename may claim it. rename intent is read from the secret version the
  // commit was based on (falling back to the live key if that version was pruned), so a plain update
  // whose secret was renamed externally stays a conflict instead of dragging the old name back
  const reviewedKey = commit.secretVersion?.key ?? commit.secret.key;
  return commit.key === reviewedKey;
};

export type TSecretApprovalRequestSortable = {
  id: string;
  createdAt: Date;
  environment: string;
  environmentName?: string | null;
  policy: { secretPath?: string | null };
  committerUser?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  committerIdentity?: { name?: string | null } | null;
};

const lowerSortKey = (value?: string | null) => (value ?? "").toLowerCase();

const sortKeyOf = (request: TSecretApprovalRequestSortable, orderBy: SecretApprovalRequestOrderBy) => {
  switch (orderBy) {
    case SecretApprovalRequestOrderBy.Environment:
      return lowerSortKey(request.environmentName ?? request.environment);
    case SecretApprovalRequestOrderBy.SecretPath:
      return lowerSortKey(request.policy.secretPath);
    case SecretApprovalRequestOrderBy.Author:
      return lowerSortKey(
        `${request.committerUser?.firstName ?? ""} ${request.committerUser?.lastName ?? ""}`.trim() ||
          request.committerUser?.email ||
          request.committerIdentity?.name
      );
    case SecretApprovalRequestOrderBy.CreatedAt:
    default:
      return request.createdAt.getTime();
  }
};

// Mirrors the ordering the list queries apply in SQL so pages read from the legacy and the global approval
// system can be merged in memory. String keys compare by code point, which can differ from the database
// collation for non-ASCII names.
export const compareSecretApprovalRequests =
  (
    orderBy: SecretApprovalRequestOrderBy = SecretApprovalRequestOrderBy.CreatedAt,
    orderDirection: OrderByDirection = OrderByDirection.DESC
  ) =>
  (a: TSecretApprovalRequestSortable, b: TSecretApprovalRequestSortable) => {
    const direction = orderDirection === OrderByDirection.ASC ? 1 : -1;
    const keyA = sortKeyOf(a, orderBy);
    const keyB = sortKeyOf(b, orderBy);
    if (keyA < keyB) return -direction;
    if (keyA > keyB) return direction;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  };

// Each source is asked for the first offset + limit rows in the requested order, so the slice taken here is
// exactly what one query over both systems would return. Deep pages cost offset + limit rows per source.
export const mergeSecretApprovalRequestPages = <T extends TSecretApprovalRequestSortable>({
  pages,
  offset,
  limit,
  orderBy,
  orderDirection
}: {
  pages: { approvals: T[]; totalCount: number }[];
  offset: number;
  limit: number;
  orderBy?: SecretApprovalRequestOrderBy;
  orderDirection?: OrderByDirection;
}) => ({
  approvals: pages
    .flatMap((page) => page.approvals)
    .sort(compareSecretApprovalRequests(orderBy, orderDirection))
    .slice(offset, offset + limit),
  totalCount: pages.reduce((total, page) => total + page.totalCount, 0)
});
