import { useMemo, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { Field } from "@infisical/cipher/ui/field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@infisical/cipher/ui/hover-card";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, List, ListRow } from "@infisical/cipher/ui/list";
import { Popover, PopoverContent, PopoverTrigger } from "@infisical/cipher/ui/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Heading, Meta, StatusText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import ms from "ms";
import picomatch from "picomatch";

import {
  PermissionConditionOperators,
  ProjectPermissionActions,
  ProjectPermissionApprovalRequestActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  ApproverType,
  type TAccessApprovalPolicy,
  type TAccessApprovalRequest
} from "@app/hooks/api/accessApproval/types";
import { DelegatedApprovalRequestStatus } from "@app/hooks/api/delegatedApprovals/enums";
import type { Project } from "@app/hooks/api/projects/types";
import { ApprovalStatus } from "@app/hooks/api/secretApprovalRequest/types";
import {
  canModifyByGrantConditions,
  getMemberAssignPrivilegesConditions
} from "@app/lib/fn/permission";
import {
  getActionLabelsForSubject,
  PROJECT_PERMISSION_OBJECT
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";
import { getAccessDurationLabel } from "@app/pages/secret-manager/SecretApprovalsPage/components/AccessApprovalRequest/AccessApprovalRequest.utils";

import { useProjectPermission } from "../../../access/permissions";
import { failed, toast } from "../../../access/toast";
import type { AccessRequestMember } from "../../../data/access-approvals/contract";
import { useV4Adapter } from "../../../data/adapters";
import { useV4Session } from "../../../data/session/contract";
import { canBypassPolicy, isAccessExpired, isSoftEnforced, personName, stamp } from "./model";

const ACTION_LABEL_OVERRIDES: Record<string, string> = {
  read: "Read",
  create: "Create",
  edit: "Edit",
  delete: "Delete"
};

const humanize = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const subjectLabel = (subject: string) =>
  subject === "all"
    ? "All resources"
    : (PROJECT_PERMISSION_OBJECT[subject as ProjectPermissionSub]?.title ?? humanize(subject));

const actionLabel = (subject: string, action: string) =>
  ACTION_LABEL_OVERRIDES[action] ??
  getActionLabelsForSubject(subject as ProjectPermissionSub)[action] ??
  humanize(action);

const CONDITION_FIELDS: Record<string, string> = {
  environment: "Environment",
  secretPath: "Secret path",
  secretName: "Secret name",
  secretTags: "Secret tags",
  identityId: "Identity",
  metadata: "Metadata"
};

const CONDITION_OPERATORS: Record<string, string> = {
  [PermissionConditionOperators.$EQ]: "is",
  [PermissionConditionOperators.$NEQ]: "is not",
  [PermissionConditionOperators.$IN]: "is any of",
  [PermissionConditionOperators.$ALL]: "includes all of",
  [PermissionConditionOperators.$GLOB]: "matches",
  [PermissionConditionOperators.$REGEX]: "matches regex",
  [PermissionConditionOperators.$ELEMENTMATCH]: "has element matching"
};

type Condition = { field: string; operator: string; value: string };

const conditionValue = (value: unknown) =>
  Array.isArray(value) ? value.join(", ") : String(value);

const formatConditions = (conditions: Record<string, unknown>): Condition[] =>
  Object.entries(conditions).flatMap(([field, raw]) => {
    const label = CONDITION_FIELDS[field] ?? humanize(field);
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
      return [{ field: label, operator: "is", value: conditionValue(raw) }];
    return Object.entries(raw as Record<string, unknown>).map(([operator, value]) => ({
      field: label,
      operator: CONDITION_OPERATORS[operator] ?? operator,
      value: conditionValue(value)
    }));
  });

type PermissionGroup = {
  key: string;
  label: string;
  inverted: boolean;
  actions: { value: string; label: string }[];
  conditions: Condition[];
};

const groupPermissions = (request: TAccessApprovalRequest): PermissionGroup[] => {
  const groups = new Map<
    string,
    {
      subject: string;
      inverted: boolean;
      conditions?: Record<string, unknown>;
      actions: Set<string>;
    }
  >();
  (request.permissions ?? []).forEach((rule) => {
    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    const inverted = Boolean(rule.inverted);
    const conditions =
      rule.conditions && Object.keys(rule.conditions).length ? rule.conditions : undefined;
    subjects.forEach((raw) => {
      const subject = raw || "all";
      const key = `${subject}::${inverted ? "deny" : "allow"}::${conditions ? JSON.stringify(conditions) : ""}`;
      const group = groups.get(key) ?? {
        subject,
        inverted,
        conditions,
        actions: new Set<string>()
      };
      groups.set(key, group);
      actions.forEach((action) => action && group.actions.add(action));
    });
  });
  return [...groups.entries()].map(([key, group]) => ({
    key,
    label: subjectLabel(group.subject),
    inverted: group.inverted,
    actions: [...group.actions].map((value) => ({
      value,
      label: actionLabel(group.subject, value)
    })),
    conditions: group.conditions ? formatConditions(group.conditions) : []
  }));
};

const permissionColumns: DataTableColumn<PermissionGroup>[] = [
  {
    id: "resource",
    header: "Resource",
    primary: true,
    width: 180,
    text: (group) => group.label,
    render: (group) => (
      <Inline gap={8} align="center" wrap={false}>
        <span>{group.label}</span>
        {group.inverted && <Badge tone="bad">Deny</Badge>}
      </Inline>
    )
  },
  {
    id: "permissions",
    header: "Permissions",
    grow: true,
    text: (group) => group.actions.map((action) => action.label).join(", "),
    render: (group) => group.actions.map((action) => action.label).join(", ")
  },
  {
    id: "conditions",
    header: "Conditions",
    width: 140,
    render: (group) =>
      group.conditions.length ? (
        <HoverCard openDelay={100} closeDelay={100}>
          <HoverCardTrigger asChild>
            <Button variant="link" underline="hover" size="sm">
              {`${group.conditions.length} ${group.conditions.length === 1 ? "condition" : "conditions"}`}
            </Button>
          </HoverCardTrigger>
          <HoverCardContent align="end">
            <Stack gap={4}>
              {group.conditions.map((condition, index) => (
                <span key={`${group.key}-${index + 1}`}>
                  <Meta mono={false}>{condition.field}</Meta> {condition.operator}{" "}
                  <code>{condition.value}</code>
                </span>
              ))}
            </Stack>
          </HoverCardContent>
        </HoverCard>
      ) : (
        <Meta mono={false}>None</Meta>
      )
  }
];

const DELEGATED_STATUS: Record<DelegatedApprovalRequestStatus, (name: string) => string> = {
  [DelegatedApprovalRequestStatus.PendingDispatch]: (name) => `Sending this request to ${name}.`,
  [DelegatedApprovalRequestStatus.WaitingApproval]: (name) => `Awaiting review in ${name}.`,
  [DelegatedApprovalRequestStatus.FailedDispatch]: (name) => `This request did not reach ${name}.`,
  [DelegatedApprovalRequestStatus.Approved]: (name) => `Approved in ${name}.`,
  [DelegatedApprovalRequestStatus.Rejected]: (name) => `Rejected in ${name}.`,
  [DelegatedApprovalRequestStatus.Failed]: (name) =>
    `This request could not be completed in ${name}.`
};

const REVIEW_STATUS: Record<
  string,
  { label: string; tone: "ok" | "bad" | "warn"; icon: "check-c" | "x" | "clock" }
> = {
  [ApprovalStatus.APPROVED]: { label: "Approved", tone: "ok", icon: "check-c" },
  [ApprovalStatus.REJECTED]: { label: "Rejected", tone: "bad", icon: "x" }
};
const PENDING_REVIEW = { label: "Pending", tone: "warn" as const, icon: "clock" as const };

export const ReviewRequestSheet = ({
  project,
  request,
  policies,
  members,
  requester,
  delegatedName: delegatedOptionName,
  isRetrying,
  onClose
}: {
  project: Project;
  request: TAccessApprovalRequest;
  policies: TAccessApprovalPolicy[];
  members: AccessRequestMember[];
  requester?: { firstName?: string | null; lastName?: string | null; email?: string | null };
  delegatedName?: string;
  isRetrying: boolean;
  onClose: () => void;
}) => {
  const approvals = useV4Adapter("accessApprovals");
  const { user } = useV4Session();
  const { permission } = useProjectPermission(project.id);
  const { data: groups = [] } = approvals.useGroups(project.id);
  const review = approvals.useReviewRequest();
  const revoke = approvals.useRevokeRequest();
  const retry = approvals.useRetryDispatch();
  const cancel = approvals.useCancelRequest();
  const [working, setWorking] = useState<
    "approved" | "rejected" | "revoked" | "retry" | "cancel"
  >();
  const [bypass, setBypass] = useState(false);
  const [bypassReason, setBypassReason] = useState("");
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  const projectSlug = project.slug;
  const delegatedName = delegatedOptionName ?? "the external approval system";
  const isRequestedByMe = request.requestedByUserId === user.id;
  const isApprover = request.policy.approvers.some((approver) => approver.userId === user.id);
  const canBypass = canBypassPolicy(request, user.id);
  const softEnforced = isSoftEnforced(request);
  const canReadMembers = permission.can(
    ProjectPermissionMemberActions.Read,
    ProjectPermissionSub.Member
  );

  const canRevoke = useMemo(() => {
    if (isApprover) return true;
    if (
      !permission.can(
        ProjectPermissionMemberActions.AssignAdditionalPrivileges,
        ProjectPermissionSub.Member
      )
    )
      return false;
    const email = requester?.email;
    if (!email) return false;
    const conditions = getMemberAssignPrivilegesConditions(permission);
    return canModifyByGrantConditions({
      targetValue: email,
      allowed: conditions?.emails,
      forbidden: conditions?.forbiddenEmails,
      isMatch: (value, pattern) => picomatch.isMatch(value, pattern, { nocase: true })
    });
  }, [permission, isApprover, requester?.email]);

  const steps = useMemo(() => {
    const policy = policies.find((entry) => entry.id === request.policy.id);
    const chains = (policy?.approvers ?? []).reduce<
      { sequence: number; approvals: number; users: string[]; groups: string[] }[]
    >((acc, approver) => {
      const last = acc[acc.length - 1];
      const sequence = approver.sequence || 1;
      if (last && last.sequence === sequence) {
        (approver.type === ApproverType.User ? last.users : last.groups).push(approver.id);
        return acc;
      }
      acc.push({
        sequence,
        approvals: approver.approvalsRequired || policy?.approvals || 1,
        users: approver.type === ApproverType.User ? [approver.id] : [],
        groups: approver.type === ApproverType.Group ? [approver.id] : []
      });
      return acc;
    }, []);
    return chains.map((chain) => {
      const reviewers = request.policy.approvers
        .filter((approver) => (approver.sequence || 1) === chain.sequence)
        .map((approver) => ({
          ...approver,
          status: request.reviewers.find((reviewer) => reviewer.userId === approver.userId)?.status
        }));
      return {
        ...chain,
        reviewers,
        hasApproved:
          reviewers.filter((reviewer) => reviewer.status === ApprovalStatus.APPROVED).length >=
          chain.approvals,
        hasRejected: reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED)
      };
    });
  }, [policies, request]);
  const currentStep = steps.find((step) => !step.hasApproved);
  const currentSequence = currentStep?.sequence ?? (steps[steps.length - 1]?.sequence ?? 1) + 1;
  const myTurn = currentStep?.reviewers.some((reviewer) => reviewer.userId === user.id);

  const hasRejected = request.status === ApprovalStatus.REJECTED;
  const hasApproved = request.status === ApprovalStatus.APPROVED;
  const hasRevoked = request.status === ApprovalStatus.REVOKED;
  const hasExpired =
    !hasApproved &&
    !hasRejected &&
    !hasRevoked &&
    Boolean(request.expiresAt && new Date(request.expiresAt) < new Date());
  const accessExpired = isAccessExpired(request);
  const reviewedByMe = request.reviewers.some((reviewer) => reviewer.userId === user.id);
  const isDelegated = Boolean(request.delegatedApproval);
  const isDelegatedOpen =
    isDelegated && request.status === ApprovalStatus.PENDING && !request.policy.deletedAt;
  const isDelegatedPending = isDelegatedOpen && !hasExpired;
  const isClosed = isDelegated || hasRejected || hasApproved || hasRevoked || hasExpired;
  const reviewBlocked = isClosed || reviewedByMe || (!myTurn && !canBypass);

  const showRetry =
    !isRetrying &&
    isDelegatedPending &&
    request.delegatedApproval?.status === DelegatedApprovalRequestStatus.FailedDispatch;
  const canRetry =
    isRequestedByMe ||
    permission.can(
      ProjectPermissionApprovalRequestActions.Read,
      ProjectPermissionSub.ApprovalRequests
    );
  const canCancel =
    isRequestedByMe ||
    permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);

  const banner = (() => {
    if (!reviewBlocked || isDelegatedPending) return undefined;
    if (hasExpired)
      return {
        tone: "bad" as const,
        title: "This request has expired.",
        description: request.expiresAt ? `Expired on ${stamp(request.expiresAt)}` : undefined
      };
    if (hasRejected)
      return {
        tone: "bad" as const,
        title: "This request has been rejected.",
        description: `Rejected on ${stamp(request.updatedAt)}`
      };
    if (hasRevoked) {
      const parts = [
        request.approvedAt && `Approved on ${stamp(request.approvedAt)}`,
        request.revokedAt && `Revoked on ${stamp(request.revokedAt)}`
      ].filter(Boolean);
      const by = request.revokedByUser?.email;
      return {
        tone: "bad" as const,
        title: `This access has been revoked${by ? ` by ${by}` : ""}.`,
        description: parts.length ? parts.join(". ") : undefined
      };
    }
    const approvedAt = `Approved on ${stamp(request.approvedAt || request.updatedAt)}`;
    if (accessExpired)
      return {
        tone: "bad" as const,
        title: "This request's access has expired.",
        description: request.privilege?.temporaryAccessEndTime
          ? `${approvedAt}. Expired on ${stamp(request.privilege.temporaryAccessEndTime)}`
          : approvedAt
      };
    if (hasApproved && request.bypassReason)
      return {
        tone: "warn" as const,
        title: "This request was approved via bypass.",
        description: approvedAt,
        reason: request.bypassReason
      };
    if (hasApproved)
      return {
        tone: "ok" as const,
        title: "This request has been approved.",
        description: approvedAt
      };
    if (reviewedByMe) return { tone: "info" as const, title: "You have reviewed this request." };
    return { tone: "info" as const, title: "You are not the reviewer in this step." };
  })();

  const run = async (
    action: NonNullable<typeof working>,
    task: () => Promise<unknown>,
    done: string,
    failure: string
  ) => {
    setWorking(action);
    try {
      await task();
      toast({ tone: "ok", title: done });
      onClose();
    } catch (error) {
      failed(failure, error);
      setWorking(undefined);
    }
  };

  const reviewAs = (status: "approved" | "rejected") => {
    if (bypass && bypassReason.length < 10) {
      toast({
        tone: "bad",
        title: "Failed to bypass approval",
        description: "Reason must be 10 characters or longer"
      });
      return;
    }
    run(
      status,
      () =>
        review.mutateAsync({
          requestId: request.id,
          status,
          projectSlug,
          bypassReason: bypass ? bypassReason : undefined
        }),
      status === "approved" ? "Request approved" : "Request rejected",
      status === "approved" ? "Failed to approve the request" : "Failed to reject the request"
    );
  };

  let rejectBlock: string | undefined;
  if (!isRequestedByMe && !isApprover && !bypass)
    rejectBlock = "You are not an approver on this policy";
  let approveBlock: string | undefined;
  if (!bypass) {
    if (!isApprover) approveBlock = "You are not an approver on this policy";
    else if (isRequestedByMe && !request.policy.allowedSelfApprovals)
      approveBlock = "This policy does not allow approving your own request";
  }
  let stepBlock: string | undefined;
  if (reviewedByMe) stepBlock = "You have reviewed this request";
  else if (!myTurn && !canBypass) stepBlock = "You are not the reviewer in this step";

  const environment =
    project.environments.find((env) => env.slug === request.environmentName)?.name ??
    request.environmentName;
  const requesterName = personName(requester);
  const requesterDisplay =
    requester?.email && requesterName !== requester.email
      ? `${requesterName} (${requester.email})`
      : requesterName;
  const permissionGroups = groupPermissions(request);
  const requestExpires =
    request.expiresAt &&
    request.status === ApprovalStatus.PENDING &&
    new Date(request.expiresAt) > new Date()
      ? `In ${ms(new Date(request.expiresAt).getTime() - Date.now(), { long: true })}`
      : undefined;

  const approverNames = (step: (typeof steps)[number]) => {
    const users = [...step.users].sort(
      (first, second) => Number(second === user.id) - Number(first === user.id)
    );
    return (
      <Inline gap={12} align="center">
        {users.map((id) => {
          if (id === user.id) return <strong key={id}>You</strong>;
          const member = members.find((entry) => entry.id === id);
          const policyApprover = request.policy.approvers.find(
            (approver) => approver.userId === id
          );
          const name = member?.username ?? policyApprover?.email ?? policyApprover?.username ?? id;
          let mark: { label: string; reason: string } | undefined;
          if (member && !member.isOrgMembershipActive)
            mark = {
              label: "Inactive",
              reason:
                "This user has been deactivated and no longer has an active organization membership."
            };
          else if (!member && canReadMembers)
            mark = { label: "Removed", reason: "This user has been removed from the project." };
          else if (!member && policyApprover && !policyApprover.isOrgMembershipActive)
            mark = {
              label: "Inactive",
              reason:
                "This user has been deactivated and no longer has an active organization membership."
            };
          return (
            <Inline key={id} gap={4} align="center" wrap={false}>
              <span>{name}</span>
              {mark && (
                <Tooltip content={mark.reason}>
                  <Badge tone="soft" tabIndex={0}>
                    {mark.label}
                  </Badge>
                </Tooltip>
              )}
            </Inline>
          );
        })}
        {step.groups.map((id) => (
          <span key={id}>{groups.find((group) => group.id === id)?.name ?? id}</span>
        ))}
      </Inline>
    );
  };

  const stepStatus = (step: (typeof steps)[number]) => {
    if (step.hasRejected) return REVIEW_STATUS[ApprovalStatus.REJECTED];
    if (step.hasApproved) return REVIEW_STATUS[ApprovalStatus.APPROVED];
    if (currentSequence === step.sequence && !hasExpired) return PENDING_REVIEW;
    return undefined;
  };

  const showFooter = !isClosed || isDelegatedOpen || hasApproved;

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          size="md"
          pending={Boolean(working)}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>Review request</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <Stack gap={24}>
              {banner && (
                <Alert tone={banner.tone} title={banner.title}>
                  {banner.description}
                  {banner.reason && <p>{`Reason: ${banner.reason}`}</p>}
                </Alert>
              )}
              <Stack gap={8}>
                <span>{`${requesterDisplay || "A user"} requested access to the following resource:`}</span>
                <DataList
                  variant="props"
                  density="compact"
                  items={[
                    [`Environment`, environment, { span: "half" }],
                    [
                      "Secret path",
                      <code key="path">{request.policy.secretPath}</code>,
                      { span: "half" }
                    ],
                    [
                      "Access duration",
                      getAccessDurationLabel(request.isTemporary, request.temporaryRange),
                      { span: "half" }
                    ],
                    ...(requestExpires
                      ? ([["Request expires", requestExpires, { span: "half" }]] as const)
                      : []),
                    ...(request.note ? ([["Note", request.note]] as const) : [])
                  ]}
                />
              </Stack>
              <Stack gap={8}>
                <Heading level={3}>Requested permissions</Heading>
                <DataTable
                  label="Requested permissions"
                  rows={permissionGroups}
                  columns={permissionColumns}
                  getRowId={(group) => group.key}
                  rowLabel={(group) => group.label}
                  empty={<Meta mono={false}>No permissions specified</Meta>}
                />
              </Stack>
              {isDelegated ? (
                <>
                  {isDelegatedPending && (
                    <Alert tone="info" title={`This request is reviewed in ${delegatedName}.`}>
                      {`It cannot be approved here. Infisical grants access once ${delegatedName} approves it.`}
                    </Alert>
                  )}
                  {(isRetrying || request.delegatedApproval) && (
                    <Stack gap={8}>
                      <Heading level={3}>Status</Heading>
                      <List label="Delegated approval status">
                        <ListRow
                          value="status"
                          label="Delegated approval status"
                          title={
                            <StatusText
                              tone="neutral"
                              icon="sync"
                              loading={
                                isRetrying ||
                                request.delegatedApproval?.status ===
                                  DelegatedApprovalRequestStatus.PendingDispatch
                              }
                            >
                              {isRetrying
                                ? `Retrying the submission to ${delegatedName}.`
                                : DELEGATED_STATUS[request.delegatedApproval!.status](
                                    delegatedName
                                  )}
                            </StatusText>
                          }
                          description={
                            <Stack gap={4}>
                              {request.delegatedApproval?.provider?.recordNumber && (
                                <span>
                                  {`${delegatedName} request `}
                                  <code>{request.delegatedApproval.provider.recordNumber}</code>
                                </span>
                              )}
                              {!isRetrying && request.delegatedApproval?.statusReason && (
                                <span>{request.delegatedApproval.statusReason}</span>
                              )}
                              <Meta mono={false}>{`Requested ${stamp(request.createdAt)}`}</Meta>
                            </Stack>
                          }
                          actions={
                            showRetry ? (
                              <Button
                                variant="outline"
                                icon="sync"
                                loading={working === "retry"}
                                disabledReason={
                                  canRetry
                                    ? undefined
                                    : "Only the requester or an approval request reader can retry"
                                }
                                onClick={() =>
                                  run(
                                    "retry",
                                    () => retry.mutateAsync({ requestId: request.id, projectSlug }),
                                    `Request sent to ${delegatedName} again`,
                                    "Failed to retry the submission"
                                  )
                                }
                              >
                                Retry
                              </Button>
                            ) : undefined
                          }
                        />
                      </List>
                    </Stack>
                  )}
                </>
              ) : (
                <Stack gap={8}>
                  <Heading level={3}>Approvers</Heading>
                  <List label="Approval steps">
                    {steps.map((step, index) => {
                      const status = stepStatus(step);
                      return (
                        <ListRow
                          key={step.sequence}
                          value={String(step.sequence)}
                          label={`Approval step ${index + 1}`}
                          title={approverNames(step)}
                          description={`${steps.length > 1 ? `Step ${index + 1}. ` : ""}${step.approvals} approval${step.approvals === 1 ? "" : "s"} required`}
                          actions={
                            status ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Reviewer progress for approval step ${index + 1}`}
                                  >
                                    <StatusText tone={status.tone} icon={status.icon}>
                                      {status.label}
                                    </StatusText>
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" style={{ width: 288 }}>
                                  <Stack gap={8}>
                                    <strong>Reviewer progress</strong>
                                    {step.reviewers.map((reviewer) => {
                                      const reviewStatus =
                                        REVIEW_STATUS[reviewer.status ?? ""] ?? PENDING_REVIEW;
                                      return (
                                        <Inline
                                          key={reviewer.userId}
                                          gap={12}
                                          align="center"
                                          justify="between"
                                          wrap={false}
                                        >
                                          <span>
                                            {reviewer.userId === user.id
                                              ? "You"
                                              : reviewer.username ||
                                                reviewer.email ||
                                                reviewer.userId}
                                            {!reviewer.isOrgMembershipActive && " (inactive)"}
                                          </span>
                                          <StatusText
                                            tone={reviewStatus.tone}
                                            icon={reviewStatus.icon}
                                          >
                                            {reviewStatus.label}
                                          </StatusText>
                                        </Inline>
                                      );
                                    })}
                                  </Stack>
                                </PopoverContent>
                              </Popover>
                            ) : undefined
                          }
                        />
                      );
                    })}
                  </List>
                </Stack>
              )}
            </Stack>
          </SheetBody>
          {showFooter && (
            <SheetFooter>
              {!isClosed && softEnforced && isRequestedByMe && canBypass && !stepBlock && (
                <Stack gap={8}>
                  <Checkbox
                    label="Approve without waiting for requirements to be met (bypass policy protection)"
                    checked={bypass}
                    onChange={setBypass}
                  />
                  {bypass && (
                    <Field label="Reason for bypass">
                      <Textarea
                        rows={3}
                        value={bypassReason}
                        placeholder="Enter reason for bypass (min 10 chars)"
                        onChange={(event) => setBypassReason(event.target.value)}
                      />
                    </Field>
                  )}
                </Stack>
              )}
              {!isClosed && (
                <Inline gap={8} justify="end">
                  <Button
                    variant="outline"
                    icon="x"
                    loading={working === "rejected"}
                    disabledReason={stepBlock ?? rejectBlock}
                    onClick={() => reviewAs("rejected")}
                  >
                    Reject request
                  </Button>
                  <Button
                    variant={!isApprover && softEnforced ? "destructive" : "primary"}
                    icon="check"
                    loading={working === "approved"}
                    disabledReason={stepBlock ?? approveBlock}
                    onClick={() => reviewAs("approved")}
                  >
                    Approve request
                  </Button>
                </Inline>
              )}
              {isDelegatedOpen && (
                <Inline gap={8} justify="end">
                  <Button
                    variant="destructive"
                    loading={working === "cancel"}
                    disabledReason={
                      canCancel
                        ? undefined
                        : "Only the requester or a policy editor can cancel this request"
                    }
                    onClick={() =>
                      run(
                        "cancel",
                        () => cancel.mutateAsync({ requestId: request.id, projectSlug }),
                        "Request cancelled",
                        "Failed to cancel the request"
                      )
                    }
                  >
                    Cancel request
                  </Button>
                </Inline>
              )}
              {hasApproved && (
                <Inline gap={8} justify="end">
                  <Button
                    variant="destructive"
                    disabledReason={
                      canRevoke ? undefined : "You don't have permission to revoke this access"
                    }
                    onClick={() => setConfirmingRevoke(true)}
                  >
                    Revoke access
                  </Button>
                </Inline>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirmingRevoke} onOpenChange={setConfirmingRevoke}>
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the privilege granted by this request right away and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                run(
                  "revoked",
                  () => revoke.mutateAsync({ requestId: request.id, projectSlug }),
                  "Access revoked",
                  "Failed to revoke access"
                )
              }
            >
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
