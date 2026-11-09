import { useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ApprovalQueue, type ApprovalRequest } from "@app/components/v4/patterns/approval-queue";
import { Badge, type BadgeTone } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { Detail, DetailLabel, DetailValue } from "@app/components/v4/ui/detail";
import { EmptyState } from "@app/components/v4/ui/empty";
import { DetailLayout, Inline, Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";
import { StatusText } from "@app/components/v4/ui/text";
import {
  ApprovalStatus,
  CommitType,
  type TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";

import { toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref, v4Path } from "../../links";
import { PageLoader } from "../../shell/project-gate";
import { withoutDefaults } from "../search-defaults";

const ROUTE = v4Path("/organizations/$orgId/projects/secret-management/$projectId/approval");

enum TabSection {
  SecretApprovalRequests = "approval-requests",
  ResourceApprovalRequests = "resource-requests",
  Policies = "policies"
}

const verbs: Record<CommitType, string> = {
  [CommitType.CREATE]: "add",
  [CommitType.ADD]: "add",
  [CommitType.UPDATE]: "update",
  [CommitType.DELETE]: "delete"
};
const opTone: Record<CommitType, BadgeTone> = {
  [CommitType.CREATE]: "ok",
  [CommitType.ADD]: "ok",
  [CommitType.UPDATE]: "info",
  [CommitType.DELETE]: "bad"
};

const verbOf = (request: TSecretApprovalRequest) => {
  const found = [...new Set(request.commits.map((commit) => verbs[commit.op]))];
  return found.length === 1 ? found[0] : "change";
};

const committerName = (request: TSecretApprovalRequest) => {
  if (request.committerUser)
    return (
      [request.committerUser.firstName, request.committerUser.lastName].filter(Boolean).join(" ") ||
      request.committerUser.email
    );
  return request.committerIdentity?.name ?? "A deleted user";
};

const ageOf = (createdAt: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (60 * 24))}d`;
};

const RequestTitle = ({
  request,
  environment
}: {
  request: TSecretApprovalRequest;
  environment: string;
}) => {
  const keys = request.commits.flatMap((commit) => (commit.secretKey ? [commit.secretKey] : []));
  const shown = keys.slice(0, 2);
  if (!shown.length) {
    const verb = verbOf(request);
    return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} in ${environment.toLowerCase()}`;
  }
  return (
    <>
      {shown.map((key, index) => (
        <span key={key}>
          {index > 0 && " and "}
          <code>{key}</code>
        </span>
      ))}
      {keys.length > shown.length && ` and ${keys.length - shown.length} more`}
      {` ${verbOf(request)} in ${environment.toLowerCase()}`}
    </>
  );
};

const describe = (request: TSecretApprovalRequest) => {
  const count = request.commits.length;
  return `${committerName(request)} asked to ${verbOf(request)} ${count} secret${count === 1 ? "" : "s"} at ${request.secretPath}.`;
};

const statusOf = (request: TSecretApprovalRequest) => {
  if (request.hasMerged) return { tone: "ok" as const, icon: "check-c" as const, label: "Merged" };
  if (request.status === "close")
    return { tone: "neutral" as const, icon: "x" as const, label: "Closed" };
  return { tone: "warn" as const, icon: "clock" as const, label: "Open" };
};

const reviewLabel: Record<ApprovalStatus, string> = {
  [ApprovalStatus.APPROVED]: "Approved",
  [ApprovalStatus.REJECTED]: "Rejected",
  [ApprovalStatus.PENDING]: "Pending",
  [ApprovalStatus.REVOKED]: "Revoked"
};

type Commit = TSecretApprovalRequest["commits"][number];
type Approver = TSecretApprovalRequest["policy"]["approvers"][number];

const approverName = (approver: Approver) =>
  [approver.firstName, approver.lastName].filter(Boolean).join(" ") || approver.email;

const changeColumns: DataTableColumn<Commit>[] = [
  {
    id: "change",
    header: "Change",
    width: 120,
    render: (commit) => (
      <Badge tone={opTone[commit.op]}>
        {verbs[commit.op].charAt(0).toUpperCase() + verbs[commit.op].slice(1)}
      </Badge>
    )
  },
  {
    id: "secret",
    header: "Secret",
    grow: true,
    text: (commit) => commit.secretKey,
    render: (commit) => <code>{commit.secretKey}</code>
  },
  {
    id: "version",
    header: "Version",
    width: 96,
    render: (commit) =>
      (commit.secret?.version ?? commit.version) === undefined
        ? "New"
        : `v${commit.secret?.version ?? commit.version}`
  }
];

const RequestDetail = ({
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
  const { data: request, isPending, error } = secrets.useApprovalRequestDetails({ id: requestId });
  const review = secrets.useReviewApprovalRequest();
  const updateStatus = secrets.useUpdateApprovalRequestStatus();
  const merge = secrets.useMergeApprovalRequest();
  const act = async (task: () => Promise<unknown>, done: string) => {
    try {
      await task();
      toast({ tone: "ok", title: done });
    } catch (failure) {
      toast({
        tone: "bad",
        title: failure instanceof Error ? failure.message : "The action failed. Try again"
      });
    }
  };
  const reviewerColumns: DataTableColumn<Approver>[] = [
    { id: "approver", header: "Approver", grow: true, text: approverName, render: approverName },
    {
      id: "review",
      header: "Review",
      width: 160,
      render: (approver) =>
        reviewLabel[
          request?.reviewers.find((entry) => entry.userId === approver.userId)?.status ??
            ApprovalStatus.PENDING
        ]
    }
  ];
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
        <EmptyState icon="alert" title="Change request not found" />
      </Stack>
    );
  const environment = environmentName(request.environment);
  const status = statusOf(request);
  const mine = request.reviewers.find((reviewer) => reviewer.email === user.email);
  const approvals = request.reviewers.filter(
    (reviewer) => reviewer.status === ApprovalStatus.APPROVED
  ).length;
  const open = request.status === "open";
  const isApprover = request.policy.approvers.some((approver) => approver.email === user.email);
  const approveBlock = !isApprover ? "You are not an approver on this policy" : undefined;
  const mergeBlock =
    approvals < request.policy.approvals
      ? `Needs ${request.policy.approvals - approvals} more approval${request.policy.approvals - approvals === 1 ? "" : "s"}`
      : undefined;
  return (
    <Stack gap={24}>
      {back}
      <PageHeader
        size="md"
        title={<RequestTitle request={request} environment={environment} />}
        description={describe(request)}
        badges={
          <StatusText tone={status.tone} icon={status.icon}>
            {status.label}
          </StatusText>
        }
        actions={
          open ? (
            <>
              <Button
                variant="outline"
                disabled={Boolean(approveBlock)}
                title={approveBlock}
                onClick={() =>
                  act(
                    () =>
                      review.mutateAsync({
                        id: request.id,
                        projectId,
                        status: ApprovalStatus.REJECTED
                      }),
                    "You rejected this change request"
                  )
                }
              >
                Reject
              </Button>
              <Button
                variant="accent"
                disabled={Boolean(approveBlock) || mine?.status === ApprovalStatus.APPROVED}
                title={approveBlock}
                onClick={() =>
                  act(
                    () =>
                      review.mutateAsync({
                        id: request.id,
                        projectId,
                        status: ApprovalStatus.APPROVED
                      }),
                    "You approved this change request"
                  )
                }
              >
                {mine?.status === ApprovalStatus.APPROVED ? "Approved" : "Approve"}
              </Button>
            </>
          ) : undefined
        }
      />
      <DetailLayout
        asideLabel="Request details"
        aside={
          <Card variant="framed" title="Details" size="sm">
            <Detail>
              <DetailLabel>Environment</DetailLabel>
              <DetailValue>{environment}</DetailValue>
              <DetailLabel>Path</DetailLabel>
              <DetailValue>
                <code>{request.secretPath}</code>
              </DetailValue>
              <DetailLabel>Policy</DetailLabel>
              <DetailValue>{request.policy.name}</DetailValue>
              <DetailLabel>Approvals</DetailLabel>
              <DetailValue>{`${approvals} of ${request.policy.approvals} required`}</DetailValue>
              <DetailLabel>Opened</DetailLabel>
              <DetailValue>{new Date(request.createdAt).toLocaleString("en-US")}</DetailValue>
            </Detail>
          </Card>
        }
      >
        <Stack gap={24}>
          <Card variant="framed" title="Changes" flush>
            <DataTable
              label="Secret changes"
              rows={request.commits}
              columns={changeColumns}
              getRowId={(commit) => commit.id}
              rowLabel={(commit) => commit.secretKey}
            />
          </Card>
          <Card variant="framed" title="Reviewers" flush>
            <DataTable
              label="Reviewers"
              rows={request.policy.approvers}
              columns={reviewerColumns}
              getRowId={(approver) => approver.userId}
              rowLabel={approverName}
            />
          </Card>
          {open && (
            <Inline gap={8}>
              <Button
                disabled={Boolean(mergeBlock)}
                title={mergeBlock}
                onClick={() =>
                  act(
                    () =>
                      merge.mutateAsync({
                        id: request.id,
                        projectId,
                        environment: request.environment,
                        secretPath: request.secretPath
                      }),
                    "Merged the change request"
                  )
                }
              >
                Merge
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  act(
                    () => updateStatus.mutateAsync({ id: request.id, projectId, status: "close" }),
                    "Closed the change request"
                  )
                }
              >
                Close request
              </Button>
            </Inline>
          )}
        </Stack>
      </DetailLayout>
    </Stack>
  );
};

const ChangeRequests = ({
  projectId,
  environmentName,
  hrefFor,
  onView
}: {
  projectId: string;
  environmentName: (slug: string) => string;
  hrefFor: (id: string) => string;
  onView: (id: string) => void;
}) => {
  const secrets = useV4Adapter("secrets");
  const { user } = useV4Session();
  const { data, isPending } = secrets.useApprovalRequests({
    projectId,
    status: "open",
    limit: 100
  });
  const review = secrets.useReviewApprovalRequest();
  const [working, setWorking] = useState<string>();
  const [failures, setFailures] = useState<Record<string, string>>({});
  if (isPending) return <Loader label="Loading change requests" />;
  const approve = async (id: string) => {
    setWorking(id);
    setFailures(({ [id]: _cleared, ...rest }) => rest);
    try {
      await review.mutateAsync({ id, projectId, status: ApprovalStatus.APPROVED });
    } catch (error) {
      setFailures((current) => ({
        ...current,
        [id]: error instanceof Error ? error.message : "The approval failed."
      }));
    } finally {
      setWorking(undefined);
    }
  };
  const waiting = (data?.approvals ?? []).filter(
    (request) =>
      !request.reviewers.some(
        (reviewer) => reviewer.email === user.email && reviewer.status === ApprovalStatus.APPROVED
      )
  );
  const requests: ApprovalRequest[] = waiting.map((request) => {
    const base = {
      id: request.id,
      object: request.commits[0]?.secretKey ?? request.slug,
      title: <RequestTitle request={request} environment={environmentName(request.environment)} />,
      description: describe(request),
      age: ageOf(request.createdAt),
      href: hrefFor(request.id)
    };
    if (failures[request.id]) return { ...base, state: "failed", error: failures[request.id] };
    return { ...base, state: working === request.id ? "pending" : "new" };
  });
  return (
    <ApprovalQueue requests={requests} onApprove={approve} onView={onView} onRetry={approve} />
  );
};

export const SecretApprovalsPage = () => {
  const { orgId, projectId } = useParams({ from: ROUTE });
  const { selectedTab, requestId } = useSearch({ from: ROUTE });
  const navigate = useNavigate({ from: ROUTE });
  const secrets = useV4Adapter("secrets");
  const { data: count } = secrets.useApprovalRequestCount({ projectId });
  const { data: project } = secrets.useProject(projectId);
  const tab = selectedTab || TabSection.SecretApprovalRequests;
  const base = orgHref(orgId, `/projects/secret-management/${projectId}/approval`);
  const approvalSearch = (nextTab: string, nextRequestId: string) =>
    withoutDefaults(
      { selectedTab: nextTab, requestId: nextRequestId },
      { selectedTab: TabSection.SecretApprovalRequests, requestId: "" }
    );
  const hrefFor = (id: string) =>
    `${base}?${new URLSearchParams(approvalSearch(TabSection.SecretApprovalRequests, id))}`;
  const environmentName = (slug: string) =>
    project?.environments.find((environment) => environment.slug === slug)?.name ?? slug;
  if (tab === TabSection.SecretApprovalRequests && requestId)
    return (
      <RequestDetail
        projectId={projectId}
        requestId={requestId}
        environmentName={environmentName}
        listHref={`${base}?selectedTab=${TabSection.SecretApprovalRequests}`}
      />
    );
  const notPorted = (
    <EmptyState
      icon="inbox"
      title="Not available in v4 yet"
      description="Use the current app for this section."
    />
  );
  return (
    <Stack gap={24}>
      <PageHeader
        title="Approval workflows"
        description="Require review before secrets change in sensitive environments and folders."
        tabs={
          <Tabs
            label="Approval sections"
            value={tab}
            onValueChange={(next) => navigate({ search: approvalSearch(next, "") })}
            tabs={[
              {
                value: TabSection.SecretApprovalRequests,
                label: "Change requests",
                count: count?.open || undefined
              },
              { value: TabSection.ResourceApprovalRequests, label: "Access requests" },
              { value: TabSection.Policies, label: "Policies" }
            ]}
          />
        }
      />
      {tab === TabSection.SecretApprovalRequests ? (
        <ChangeRequests
          projectId={projectId}
          environmentName={environmentName}
          hrefFor={hrefFor}
          onView={(id) =>
            navigate({
              search: approvalSearch(TabSection.SecretApprovalRequests, id)
            })
          }
        />
      ) : (
        notPorted
      )}
    </Stack>
  );
};
