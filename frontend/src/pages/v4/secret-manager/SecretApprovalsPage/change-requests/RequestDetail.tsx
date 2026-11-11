import { format, formatDistanceToNowStrict } from "date-fns";

import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { EmptyState } from "@app/components/v4/ui/empty";
import { DetailLayout, Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Heading, Meta, StatusText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { EnforcementLevel } from "@app/hooks/api/policies/enums";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { ApprovalStatus, CommitType } from "@app/hooks/api/secretApprovalRequest/types";
import { parsePathFromReplicatedPath } from "@app/lib/fn/string";

import { useV4Adapter } from "../../../data/adapters";
import { useV4Session } from "../../../data/session/contract";
import { PageLoader } from "../../../shell/project-gate";
import { ChangeItem } from "./ChangeItem";
import { MergeButtons, ReopenButton } from "./MergeButtons";
import {
  approvedCount,
  type ChangeRequest,
  ChangeSummary,
  pathOf,
  personName,
  plural,
  reviewStatus
} from "./parts";
import { ReviewPopover } from "./ReviewPopover";

const verbs: Record<CommitType, string> = {
  [CommitType.CREATE]: "add",
  [CommitType.ADD]: "add",
  [CommitType.UPDATE]: "update",
  [CommitType.DELETE]: "delete"
};

const stamp = (value: string | Date) => format(new Date(value), "MMM d, yyyy h:mm aa");

const RequestTitle = ({
  request,
  environment
}: {
  request: ChangeRequest;
  environment: string;
}) => {
  const found = [...new Set(request.commits.map((commit) => verbs[commit.op]))];
  const verb = found.length === 1 ? found[0] : "change";
  const keys = request.commits.map((commit) => commit.secretKey);
  const shown = keys.slice(0, 2);
  return (
    <>
      {shown.map((key, index) => (
        <span key={key}>
          {index > 0 && " and "}
          <code>{key}</code>
        </span>
      ))}
      {keys.length > shown.length && ` and ${keys.length - shown.length} more`}
      {` ${verb} in ${environment}`}
    </>
  );
};

type ReviewerRow = {
  userId: string;
  name: string;
  isRequired: boolean;
  isActive: boolean;
  review?: ChangeRequest["reviewers"][number];
};

export const RequestDetail = ({
  projectId,
  requestId,
  environmentName,
  listHref
}: {
  projectId: string;
  requestId: string;
  environmentName: (slug: string) => string;
  listHref: string;
}) => {
  const secrets = useV4Adapter("secrets");
  const { user } = useV4Session();
  const { data: access } = useV4Adapter("access").useProjectPermission({ projectId });
  const { data: request, isPending, error } = secrets.useApprovalRequestDetails({ id: requestId });
  const { data: imports } = secrets.useSecretImports({
    projectId,
    environment: request?.environment ?? "",
    path: parsePathFromReplicatedPath(request?.secretPath ?? ""),
    enabled: Boolean(request?.isReplicated)
  });

  const back = (
    <div>
      <Button variant="link" size="sm" icon="chev-left" asChild>
        <a href={listHref}>All change requests</a>
      </Button>
    </div>
  );
  if (isPending && !error) return <PageLoader label="Loading change request" />;
  if (!request)
    return (
      <Stack gap={16}>
        {back}
        <EmptyState
          icon="alert"
          title="Change request could not be loaded"
          description="It may have been deleted, or you may not have access to it."
        />
      </Stack>
    );

  const { policy } = request;
  const environment = environmentName(request.environment);
  const isOpen = request.status === "open" && !request.hasMerged;
  const isCommitter = request.committerUserId === user.id;
  const blocksSelfReview = policy.allowedSelfApprovals === false && isCommitter;
  const isApprover = policy.approvers.some(({ userId }) => userId === user.id);
  const isBypasser =
    !policy.bypassers?.length || policy.bypassers.some(({ userId }) => userId === user.id);
  const isAdmin = Boolean(
    access?.memberships?.some((membership) =>
      membership.roles.some(({ role }) => role === ProjectMembershipRole.Admin)
    )
  );
  const approvals = approvedCount(request);
  const isMergeable = policy.approvals <= approvals;
  const mergesOnApprove =
    policy.approvals <=
    policy.approvers.filter(
      ({ userId }) =>
        userId === user.id ||
        request.reviewers.some(
          (reviewer) => reviewer.userId === userId && reviewer.status === ApprovalStatus.APPROVED
        )
    ).length;
  const myReview = request.reviewers.find(({ userId }) => userId === user.id);
  const isSoft = policy.enforcementLevel === EnforcementLevel.Soft;
  const canMerge = isApprover || isCommitter || isAdmin;
  const mergeRoleReason = "Only approvers, the request author, or project admins can merge";

  let reviewBlocked: string | undefined;
  if (!isApprover) reviewBlocked = "You are not an approver on this policy";
  else if (blocksSelfReview)
    reviewBlocked = "This policy does not allow you to review your own changes";

  const missing = policy.approvals - approvals;
  const bypass = isSoft && !isMergeable && isBypasser;
  let mergeBlocked: string | undefined;
  if (!canMerge && !isSoft) mergeBlocked = mergeRoleReason;
  else if (!isMergeable && !isSoft) mergeBlocked = `Needs ${plural(missing, "more approval")}`;
  else if (!isMergeable && !isBypasser)
    mergeBlocked = "Only policy bypassers can merge without approval";
  else if (isMergeable && !canMerge) mergeBlocked = mergeRoleReason;

  const importSource = (() => {
    const found = request.isReplicated
      ? imports?.find((entry) => request.secretPath.includes(entry.id) && entry.isReplication)
      : undefined;
    return `${found?.importEnv?.slug ?? ""} ${found?.importPath ?? ""}`.trim();
  })();

  const changedBy = request.statusChangedByUser?.email;
  let outcome = (
    <Alert
      tone={isMergeable ? "ok" : "warn"}
      title={isMergeable ? "Good to merge" : "Merging is blocked"}
    >
      {!isMergeable &&
        `At least ${plural(policy.approvals, "approving review")} required by eligible reviewers.${changedBy ? ` Reopened by ${changedBy}.` : ""}`}
    </Alert>
  );
  if (request.hasMerged && request.bypassReason)
    outcome = (
      <Alert tone="warn" title="Merged without the required approvals">
        {`${changedBy ? `Merged by ${changedBy}. ` : ""}Reason: ${request.bypassReason}`}
      </Alert>
    );
  else if (request.hasMerged)
    outcome = (
      <Alert tone="ok" title="Change request merged">
        {[
          changedBy && `Merged by ${changedBy}.`,
          request.isReplicated
            ? `These changes were added to the secret import from ${importSource || "its source"}.`
            : "These secret changes were applied to the target environment and path."
        ]
          .filter(Boolean)
          .join(" ")}
      </Alert>
    );
  else if (request.status === "close")
    outcome = (
      <Alert
        tone="bad"
        title="Change request closed"
        actions={<ReopenButton request={request} projectId={projectId} />}
      >
        {[
          changedBy && `Closed by ${changedBy}.`,
          request.isReplicated
            ? "These changes were not added to the secret import."
            : "These secret changes were not applied to the target environment and path."
        ]
          .filter(Boolean)
          .join(" ")}
      </Alert>
    );

  const reviewers: ReviewerRow[] = [
    ...policy.approvers
      .filter((approver) => !(blocksSelfReview && approver.userId === user.id))
      .map((approver) => ({
        userId: approver.userId,
        name: personName(approver),
        isRequired: true,
        isActive: approver.isOrgMembershipActive,
        review: request.reviewers.find(({ userId }) => userId === approver.userId)
      })),
    ...request.reviewers
      .filter((reviewer) => !policy.approvers.some(({ userId }) => userId === reviewer.userId))
      .map((reviewer) => ({
        userId: reviewer.userId,
        name: personName(reviewer),
        isRequired: false,
        isActive: reviewer.isOrgMembershipActive,
        review: reviewer
      }))
  ];
  const reviewerColumns: DataTableColumn<ReviewerRow>[] = [
    {
      id: "reviewer",
      header: "Reviewer",
      width: 240,
      text: (row) => row.name,
      render: (row) => (
        <Inline gap={8} wrap={false}>
          <span>{row.name}</span>
          {row.userId === user.id && <Badge tone="soft">You</Badge>}
          {!row.isRequired && <Badge tone="outline">Optional</Badge>}
          {!row.isActive && (
            <Tooltip content="This user no longer has an active organization membership.">
              <Badge tone="soft">Deactivated</Badge>
            </Tooltip>
          )}
        </Inline>
      )
    },
    {
      id: "review",
      header: "Review",
      width: 136,
      render: (row) => {
        const state = reviewStatus[row.review?.status ?? ApprovalStatus.PENDING];
        const badge = <Badge tone={state.tone}>{state.label}</Badge>;
        return row.review ? (
          <Tooltip content={`Reviewed ${stamp(row.review.createdAt)}`}>{badge}</Tooltip>
        ) : (
          badge
        );
      }
    },
    {
      id: "comment",
      header: "Comment",
      grow: true,
      text: (row) => row.review?.comment ?? "",
      render: (row) =>
        row.review?.comment ? <span>{row.review.comment}</span> : <Meta mono={false}>None</Meta>
    }
  ];

  let committer = "a deleted user";
  if (request.committerUser)
    committer = `${personName(request.committerUser)} (${request.committerUser.email})`;
  else if (request.committerIdentity)
    committer = `${request.committerIdentity.name} (machine identity)`;

  let status = (
    <StatusText tone="warn" icon="clock">
      Open
    </StatusText>
  );
  if (request.hasMerged)
    status = (
      <StatusText tone="ok" icon="check-c">
        Merged
      </StatusText>
    );
  else if (request.status === "close")
    status = (
      <StatusText tone="bad" icon="x">
        Closed
      </StatusText>
    );

  return (
    <Stack gap={24}>
      {back}
      <PageHeader
        size="md"
        title={<RequestTitle request={request} environment={environment} />}
        description={`Opened by ${committer} ${formatDistanceToNowStrict(new Date(request.createdAt), { addSuffix: true })}`}
        badges={
          <>
            {status}
            {request.bypassReason && (
              <Tooltip content="Merged without the required approvals.">
                <Badge tone="warn">Bypassed</Badge>
              </Tooltip>
            )}
          </>
        }
        actions={
          isOpen ? (
            <>
              <ReviewPopover
                request={request}
                projectId={projectId}
                myReview={myReview}
                mergesOnApprove={mergesOnApprove && canMerge}
                disabledReason={reviewBlocked}
                emphasis={!myReview && !reviewBlocked && Boolean(mergeBlocked)}
              />
              <MergeButtons
                request={request}
                projectId={projectId}
                closeBlocked={canMerge || isSoft ? undefined : mergeRoleReason}
                mergeBlocked={mergeBlocked}
                bypass={bypass}
              />
            </>
          ) : undefined
        }
      />
      <DetailLayout
        asideLabel="Change request details"
        aside={
          <Card variant="framed" title="Details">
            <DataList
              variant="props"
              density="compact"
              items={[
                ["Request", <Meta key="slug">{`#${request.slug}`}</Meta>, { span: "half" }],
                [
                  "Changes",
                  <ChangeSummary
                    key="changes"
                    commits={request.commits}
                    isReplicated={request.isReplicated}
                  />,
                  { span: "half" }
                ],
                ["Environment", environment, { span: "half" }],
                ["Secret path", <code key="path">{pathOf(request)}</code>, { span: "half" }],
                ["Policy", policy.name, { span: "half" }],
                ["Approvals", `${approvals} of ${policy.approvals} required`, { span: "half" }],
                ["Enforcement", isSoft ? "Soft, can be bypassed" : "Hard", { span: "half" }],
                ["Opened", stamp(request.createdAt), { span: "half" }],
                ...(request.commitMessage ? [["Message", request.commitMessage] as const] : [])
              ]}
            />
          </Card>
        }
      >
        <Stack gap={24}>
          {outcome}
          <Card variant="framed" title="Reviewers" flush>
            <DataTable
              label="Reviewers"
              rows={reviewers}
              columns={reviewerColumns}
              getRowId={(row) => row.userId}
              rowLabel={(row) => row.name}
              empty={<EmptyState size="sm" media="bare" icon="user" title="No reviewers" />}
            />
          </Card>
          <Stack gap={12}>
            <Heading level={2} size="subsection">
              {`Secrets (${request.commits.length})`}
            </Heading>
            {request.commits.map((commit, index) => (
              <ChangeItem
                key={`${commit.op}-${index + 1}-${commit.secretVersion?.id}`}
                commit={commit}
                conflicts={request.conflicts}
                hasMerged={request.hasMerged}
              />
            ))}
          </Stack>
        </Stack>
      </DetailLayout>
    </Stack>
  );
};
