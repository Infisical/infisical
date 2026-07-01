import { Fragment, ReactNode, useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  BanIcon,
  CheckIcon,
  ClipboardCheckIcon,
  FilterIcon,
  HourglassIcon,
  InfoIcon,
  ShieldAlertIcon,
  SquarePenIcon,
  TimerIcon,
  TriangleAlertIcon,
  UserIcon,
  UsersIcon,
  UserXIcon
} from "lucide-react";
import ms from "ms";
import picomatch from "picomatch";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Detail,
  DetailLabel,
  DetailValue,
  Field,
  FieldLabel,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  Label,
  ProjectIcon,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useUser
} from "@app/context";
import { PermissionConditionOperators } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  useListWorkspaceGroups,
  useReviewAccessRequest,
  useRevokeAccessRequest
} from "@app/hooks/api";
import {
  Approver,
  ApproverType,
  TAccessApprovalPolicy,
  TAccessApprovalRequest
} from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel } from "@app/hooks/api/policies/enums";
import { ApprovalStatus, TWorkspaceUser } from "@app/hooks/api/types";
import { groupBy } from "@app/lib/fn/array";
import {
  canModifyByGrantConditions,
  getMemberAssignPrivilegesConditions
} from "@app/lib/fn/permission";
import {
  getActionLabelsForSubject,
  PROJECT_PERMISSION_OBJECT
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";
import { EditAccessRequestModal } from "@app/pages/secret-manager/SecretApprovalsPage/components/AccessApprovalRequest/components/EditAccessRequestModal";

const getReviewedStatusSymbol = (status?: ApprovalStatus, isOrgMembershipActive?: boolean) => {
  if (status === ApprovalStatus.APPROVED)
    return (
      <Badge variant="success">
        <CheckIcon />
      </Badge>
    );
  if (status === ApprovalStatus.REJECTED)
    return (
      <Badge variant="danger">
        <BanIcon />
      </Badge>
    );

  if (!isOrgMembershipActive) {
    return (
      // Can't do a tooltip here because nested tooltips doesn't work properly as of yet.
      // TODO(daniel): Fix nested tooltips in the future.

      <Badge variant="neutral">
        <UserXIcon />
      </Badge>
    );
  }
  return (
    <Badge variant="warning">
      <HourglassIcon />
    </Badge>
  );
};

// The four basic CRUD actions render with clean labels rather than the role editor's
// granular secret labels (e.g. "read" maps to "Read (legacy)" there), so existing
// secret requests keep reading naturally.
const ACTION_LABEL_OVERRIDES: Record<string, string> = {
  read: "Read",
  create: "Create",
  edit: "Edit",
  delete: "Delete"
};

const humanizeSlug = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const getSubjectLabel = (subject: string) => {
  if (subject === "all") return "All Resources";
  return PROJECT_PERMISSION_OBJECT[subject as ProjectPermissionSub]?.title ?? humanizeSlug(subject);
};

const getActionLabel = (subject: string, action: string) => {
  if (ACTION_LABEL_OVERRIDES[action]) return ACTION_LABEL_OVERRIDES[action];
  return getActionLabelsForSubject(subject as ProjectPermissionSub)[action] ?? humanizeSlug(action);
};

const CONDITION_FIELD_LABELS: Record<string, string> = {
  environment: "Environment",
  secretPath: "Secret Path",
  secretName: "Secret Name",
  secretTags: "Secret Tags",
  identityId: "Identity",
  metadata: "Metadata"
};

const CONDITION_OPERATOR_LABELS: Record<string, string> = {
  [PermissionConditionOperators.$EQ]: "is",
  [PermissionConditionOperators.$NEQ]: "is not",
  [PermissionConditionOperators.$IN]: "is any of",
  [PermissionConditionOperators.$ALL]: "includes all of",
  [PermissionConditionOperators.$GLOB]: "matches",
  [PermissionConditionOperators.$REGEX]: "matches regex",
  [PermissionConditionOperators.$ELEMENTMATCH]: "has element matching"
};

type FormattedCondition = { field: string; operator: string; value: string };

const formatConditionValue = (value: unknown) =>
  Array.isArray(value) ? value.join(", ") : String(value);

// Flatten a CASL conditions object into readable "field operator value" rows. A plain
// value is treated as equality; an operator object ({ $glob, $in, ... }) expands per operator.
const formatConditions = (conditions: Record<string, unknown>): FormattedCondition[] =>
  Object.entries(conditions).flatMap(([field, raw]) => {
    const fieldLabel = CONDITION_FIELD_LABELS[field] ?? humanizeSlug(field);

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return [{ field: fieldLabel, operator: "is", value: formatConditionValue(raw) }];
    }

    return Object.entries(raw as Record<string, unknown>).map(([operator, value]) => ({
      field: fieldLabel,
      operator: CONDITION_OPERATOR_LABELS[operator] ?? operator,
      value: formatConditionValue(value)
    }));
  });

export const ReviewAccessRequestModal = ({
  isOpen,
  onOpenChange,
  request,
  projectSlug,
  canBypass,
  policies = [],
  members = [],
  onUpdate
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  request: TAccessApprovalRequest & {
    user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
    isRequestedByCurrentUser: boolean;
    isSelfApproveAllowed: boolean;
    isApprover: boolean;
  };
  projectSlug: string;
  canBypass: boolean;
  policies: TAccessApprovalPolicy[];
  members: TWorkspaceUser[];
  onUpdate: (request: TAccessApprovalRequest) => void;
}) => {
  const [isLoading, setIsLoading] = useState<"approved" | "rejected" | "revoked" | null>(null);
  const [bypassApproval, setBypassApproval] = useState(false);

  const [bypassReason, setBypassReason] = useState("");
  const [revokeConfirmText, setRevokeConfirmText] = useState("");
  const { currentProject } = useProject();
  const { data: groupMemberships = [] } = useListWorkspaceGroups(currentProject?.id || "");
  const { user } = useUser();
  const { permission } = useProjectPermission();

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "editRequest",
    "revokeConfirm"
  ] as const);

  const isSoftEnforcement = request.policy.enforcementLevel === EnforcementLevel.Soft;

  const assignPrivilegesConditions = useMemo(
    () => getMemberAssignPrivilegesConditions(permission),
    [permission]
  );

  const canRevokeAccess = useMemo(() => {
    if (request.isApprover) return true;

    const hasBasePermission = permission.can(
      ProjectPermissionMemberActions.AssignAdditionalPrivileges,
      ProjectPermissionSub.Member
    );
    if (!hasBasePermission) return false;

    const targetEmail = request.user?.email;
    if (!targetEmail) return false;

    return canModifyByGrantConditions({
      targetValue: targetEmail,
      allowed: assignPrivilegesConditions?.emails,
      forbidden: assignPrivilegesConditions?.forbiddenEmails,
      isMatch: (value, pattern) => picomatch.isMatch(value, pattern, { nocase: true })
    });
  }, [permission, assignPrivilegesConditions, request.user?.email, request.isApprover]);

  const accessDetails = {
    env:
      currentProject?.environments.find((env) => env.slug === request.environmentName)?.name ??
      request.environmentName,
    // secret path will be inside $glob operator
    secretPath: request.policy.secretPath,
    temporaryAccess: {
      isTemporary: request.isTemporary,
      temporaryRange: request.temporaryRange
    }
  };

  // Collapse the details grid to a single column when the environment name or secret
  // path is long enough that two side-by-side columns would feel cramped.
  const DETAILS_COLLAPSE_THRESHOLD = 30;
  const shouldCollapseDetails =
    (accessDetails.env?.length ?? 0) > DETAILS_COLLAPSE_THRESHOLD ||
    (accessDetails.secretPath?.length ?? 0) > DETAILS_COLLAPSE_THRESHOLD;

  const permissionGroups = useMemo(() => {
    // Group rules by subject + effect (allow/deny) + conditions: rules that differ only in
    // action collapse into one row, while a different scope or effect stays on its own row.
    // Every rule is surfaced (including deny rules and unknown subjects) so nothing a request
    // carries can be hidden from the reviewer.
    const groups = new Map<
      string,
      {
        key: string;
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
      const conditionKey = conditions ? JSON.stringify(conditions) : "";

      subjects.forEach((rawSubject) => {
        const subject = rawSubject || "all";
        const key = `${subject}::${inverted ? "deny" : "allow"}::${conditionKey}`;
        let group = groups.get(key);
        if (!group) {
          group = { key, subject, inverted, conditions, actions: new Set<string>() };
          groups.set(key, group);
        }
        actions.forEach((action) => action && group.actions.add(action));
      });
    });

    return Array.from(groups.values()).map((group) => ({
      key: group.key,
      label: getSubjectLabel(group.subject),
      inverted: group.inverted,
      actions: Array.from(group.actions).map((action) => ({
        value: action,
        label: getActionLabel(group.subject, action)
      })),
      conditions: group.conditions ? formatConditions(group.conditions) : []
    }));
  }, [request.permissions]);

  const getAccessLabel = () => {
    if (!accessDetails.temporaryAccess.isTemporary || !accessDetails.temporaryAccess.temporaryRange)
      return "Permanent";

    return `Valid for ${ms(ms(accessDetails.temporaryAccess.temporaryRange), {
      long: true
    })} after approval`;
  };

  const reviewAccessRequest = useReviewAccessRequest();
  const revokeAccessRequest = useRevokeAccessRequest();

  const handleReview = useCallback(
    async (status: "approved" | "rejected") => {
      if (bypassApproval && bypassReason.length < 10) {
        createNotification({
          title: "Failed to bypass approval",
          text: "Reason must be 10 characters or longer",
          type: "error"
        });
        return;
      }

      setIsLoading(status);
      try {
        await reviewAccessRequest.mutateAsync({
          requestId: request.id,
          status,
          projectSlug,
          bypassReason: bypassApproval ? bypassReason : undefined
        });

        createNotification({
          title: `Request ${status}`,
          text: `The request has been ${status}`,
          type: status === "approved" ? "success" : "info"
        });
      } catch {
        setIsLoading(null);
        return;
      }

      setIsLoading(null);
      onOpenChange(false);
    },
    [bypassApproval, bypassReason, reviewAccessRequest, request, onOpenChange]
  );

  const handleRevoke = useCallback(async () => {
    setIsLoading("revoked");
    try {
      await revokeAccessRequest.mutateAsync({
        requestId: request.id,
        projectSlug
      });
      createNotification({
        title: "Access revoked",
        text: "The access has been successfully revoked",
        type: "success"
      });
    } catch {
      setIsLoading(null);
      return;
    }
    setIsLoading(null);
    onOpenChange(false);
  }, [revokeAccessRequest, request, projectSlug, onOpenChange]);

  const approverSequence = useMemo(() => {
    const policy = policies.find((el) => el.id === request.policy.id);
    const reviewesGroupById = groupBy(request.reviewers, (i) => i.userId);
    const membersGroupById = groupBy(members, (i) => i.user.id);
    const projectGroupsGroupById = groupBy(groupMemberships, (i) => i.group.id);
    const approversBySequence = policy?.approvers?.reduce(
      (acc, curr) => {
        if (acc.length && acc[acc.length - 1].sequence === curr.sequence) {
          acc[acc.length - 1][curr.type]?.push(curr);

          return acc;
        }

        const approvals = curr.approvalsRequired || policy.approvals;
        const sequence = curr.sequence || 1;

        acc.push(
          curr.type === ApproverType.User
            ? { user: [curr], group: [], sequence, approvals }
            : { group: [curr], user: [], sequence, approvals }
        );

        return acc;
      },
      [] as {
        user: Approver[];
        group: Approver[];
        sequence?: number;
        approvals?: number;
      }[]
    );

    const approvers = approversBySequence?.map((approverChain) => {
      const reviewers = request.policy.approvers
        .filter((el) => (el.sequence || 1) === approverChain.sequence)
        .map((el) => ({
          ...el,
          status: reviewesGroupById?.[el.userId]?.[0]?.status
        }));
      const hasApproved =
        reviewers.filter((el) => el.status === "approved").length >=
        (approverChain?.approvals || 1);

      const hasRejected = reviewers.filter((el) => el.status === ApprovalStatus.REJECTED).length;
      return { ...approverChain, reviewers, hasApproved, hasRejected };
    });
    const currentSequenceApprover = approvers?.find((el) => !el.hasApproved);
    const currentSequence =
      currentSequenceApprover?.sequence ?? (approvers?.[approvers.length - 1]?.sequence ?? 1) + 1;
    const isMyReviewInThisSequence = currentSequenceApprover?.reviewers.find(
      (i) => i.userId === user.id
    );

    return {
      approvers,
      membersGroupById,
      projectGroupsGroupById,
      currentSequence,
      isMyReviewInThisSequence
    };
  }, [request, policies, members, groupMemberships, user]);

  const hasRejected = request.status === ApprovalStatus.REJECTED;
  const hasApproved = request.status === ApprovalStatus.APPROVED;
  const hasRevoked = request.status === ApprovalStatus.REVOKED;
  const hasExpired =
    !hasApproved &&
    !hasRejected &&
    !hasRevoked &&
    request.expiresAt &&
    new Date(request.expiresAt) < new Date();
  const hasAccessExpired =
    request.privilege &&
    request.isApproved &&
    new Date() > new Date(request.privilege.temporaryAccessEndTime || ("" as string));
  const isReviewedByMe = request.reviewers.find((i) => i.userId === user.id);

  const shouldBlockRequestActions =
    hasRejected ||
    hasApproved ||
    hasRevoked ||
    hasExpired ||
    isReviewedByMe ||
    (!approverSequence?.isMyReviewInThisSequence && !canBypass);

  const renderCompletedMessages = () => {
    if (hasExpired) return "This request has expired.";
    if (hasRejected) return "This request has been rejected.";
    if (hasRevoked) {
      const revokedByEmail = request.revokedByUser?.email;
      return `This access has been revoked${revokedByEmail ? ` by ${revokedByEmail}` : ""}.`;
    }
    if (hasAccessExpired) return "This request's access has expired.";
    if (hasApproved && request.bypassReason) return "This request was approved via bypass.";
    if (hasApproved) return "This request has been approved.";
    if (isReviewedByMe) return "You have reviewed this request.";
    return "You are not the reviewer in this step.";
  };

  const renderCompletedDescription = () => {
    if (hasExpired && request.expiresAt)
      return `Expired on ${format(new Date(request.expiresAt), "MMM d, yyyy h:mm aa")}`;
    if (hasRejected)
      return `Rejected on ${format(new Date(request.updatedAt), "MMM d, yyyy h:mm aa")}`;
    if (hasRevoked) {
      const timestamps = [
        request.approvedAt &&
          `Approved on ${format(new Date(request.approvedAt), "MMM d, yyyy h:mm aa")}`,
        request.revokedAt &&
          `Revoked on ${format(new Date(request.revokedAt), "MMM d, yyyy h:mm aa")}`
      ].filter(Boolean);
      return timestamps.length ? timestamps.join(" · ") : null;
    }
    if (hasAccessExpired) {
      const approvedAt = format(
        new Date(request.approvedAt || request.updatedAt),
        "MMM d, yyyy h:mm aa"
      );
      const endTime = request.privilege?.temporaryAccessEndTime;
      const expiredAt = endTime ? format(new Date(endTime), "MMM d, yyyy h:mm aa") : null;
      return expiredAt
        ? `Approved on ${approvedAt} · Expired on ${expiredAt}`
        : `Approved on ${approvedAt}`;
    }
    if (hasApproved) {
      const approvedAt = format(
        new Date(request.approvedAt || request.updatedAt),
        "MMM d, yyyy h:mm aa"
      );
      return `Approved on ${approvedAt}`;
    }
    return null;
  };

  const getBannerVariant = () => {
    if (hasRejected || hasRevoked || hasExpired || hasAccessExpired) return "danger";
    if (hasApproved) return request.bypassReason ? "warning" : "success";
    return "info";
  };
  const completedMessageVariant = getBannerVariant();
  const completedDescription = renderCompletedDescription();

  const renderBannerIcon = () => {
    if (hasExpired || hasAccessExpired) return <TimerIcon />;
    if (hasApproved && request.bypassReason) return <ShieldAlertIcon />;
    if (completedMessageVariant === "danger") return <TriangleAlertIcon />;
    if (completedMessageVariant === "success") return <CheckIcon />;
    return <InfoIcon />;
  };

  // users can always reject (cancel) their own request; approvers can reject others'
  // requests regardless of the self-approval setting (that only governs your own request)
  const isRejectionDisabled = request.isRequestedByCurrentUser
    ? false
    : !request.isApprover && !bypassApproval;

  const requesterFullName = [request.user?.firstName, request.user?.lastName]
    .filter(Boolean)
    .join(" ");
  const requesterDisplay =
    requesterFullName && request.user?.email
      ? `${requesterFullName} (${request.user.email})`
      : null;

  // The status banner moved to the top of the sheet, so the footer only renders when there
  // are actions to take: Approve/Reject when unblocked, or Revoke on an approved request.
  const showFooter = !shouldBlockRequestActions || (hasApproved && canRevokeAccess);

  type ApproverChain = NonNullable<typeof approverSequence.approvers>[number];

  const approvers = approverSequence?.approvers ?? [];

  const getStatusBadge = (approver: ApproverChain) => {
    if (approver.hasRejected)
      return (
        <Badge variant="danger">
          <BanIcon />
          Rejected
        </Badge>
      );
    if (approver.hasApproved)
      return (
        <Badge variant="success">
          <CheckIcon />
          Approved
        </Badge>
      );
    if (approverSequence?.currentSequence === approver.sequence && !hasExpired)
      return (
        <Badge variant="warning">
          <HourglassIcon />
          Pending
        </Badge>
      );
    return null;
  };

  const canReadMembers = permission.can(
    ProjectPermissionMemberActions.Read,
    ProjectPermissionSub.Member
  );

  const renderApproverMembers = (approver: ApproverChain) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {approver.user.map((el) => {
        const member = approverSequence?.membersGroupById?.[el.id]?.[0];

        if (!member) {
          const policyApprover = request.policy.approvers.find((a) => a.userId === el.id);
          const approverName = policyApprover?.email || policyApprover?.username || el.id;

          // We can only assert an approver was removed when we can read project members.
          // A viewer without member:read (e.g. a NoAccess requester viewing their own
          // request) gets an empty members list, so absence here means "not visible to me",
          // not "removed". Fall back to the identity carried on the request and surface only
          // org-level status, which the request payload does include.
          if (!canReadMembers) {
            if (policyApprover && !policyApprover.isOrgMembershipActive) {
              return (
                <span className="flex items-center gap-1.5 opacity-40" key={el.id}>
                  <UserIcon className="size-3.5 shrink-0 text-muted" />
                  {approverName}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="neutral">
                        <BanIcon />
                        Inactive
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      This user has been deactivated and no longer has an active organization
                      membership.
                    </TooltipContent>
                  </Tooltip>
                </span>
              );
            }

            return (
              <span className="flex items-center gap-1.5" key={el.id}>
                <UserIcon className="size-3.5 shrink-0 text-muted" />
                {approverName}
              </span>
            );
          }

          return (
            <span className="flex items-center gap-1.5 opacity-40" key={el.id}>
              <UserIcon className="size-3.5 shrink-0 text-muted" />
              {approverName}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="neutral">
                    <BanIcon />
                    Removed
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>This user has been removed from the project.</TooltipContent>
              </Tooltip>
            </span>
          );
        }

        return member.user.isOrgMembershipActive ? (
          <span className="flex items-center gap-1.5" key={member.user.id}>
            <UserIcon className="size-3.5 shrink-0 text-muted" />
            {member.user.username}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 opacity-40" key={member.user.id}>
            <UserIcon className="size-3.5 shrink-0 text-muted" />
            {member.user.username}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="neutral">
                  <BanIcon />
                  Inactive
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                This user has been deactivated and no longer has an active organization membership.
              </TooltipContent>
            </Tooltip>
          </span>
        );
      })}
      {approver.group.map((el) => (
        <span className="flex items-center gap-1.5" key={el.id}>
          <UsersIcon className="size-3.5 shrink-0 text-muted" />
          {approverSequence?.projectGroupsGroupById?.[el.id]?.[0]?.group?.name ?? el.id}
        </span>
      ))}
    </div>
  );

  const renderReviewersTooltip = (approver: ApproverChain, badge: ReactNode) => {
    if (!badge) return null;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex">{badge}</div>
        </TooltipTrigger>
        <TooltipContent className="max-w-lg">
          <div className="mb-1 text-sm text-bunker-300">Reviewers</div>
          <div className="flex max-h-64 thin-scrollbar flex-col divide-y divide-mineshaft-500 overflow-y-auto rounded-sm">
            {approver.reviewers.map((el, idx) => (
              <div
                key={`reviewer-${idx + 1}`}
                className="flex items-center gap-2 px-2 py-2 text-sm"
              >
                <div className={twMerge("flex-1", !el.isOrgMembershipActive && "opacity-40")}>
                  {el.username}
                </div>
                {getReviewedStatusSymbol(el?.status as ApprovalStatus, el.isOrgMembershipActive)}
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent className="flex h-full flex-col gap-y-0 overflow-hidden sm:max-w-2xl">
          <SheetHeader className="border-b">
            <SheetTitle>Review Request</SheetTitle>
            <SheetDescription>Review the request and approve or deny access.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 thin-scrollbar flex-1 flex-col overflow-y-auto p-4">
            {shouldBlockRequestActions && (
              <Alert variant={completedMessageVariant} className="mb-4">
                {renderBannerIcon()}
                <AlertTitle>{renderCompletedMessages()}</AlertTitle>
                {completedDescription && (
                  <AlertDescription>{completedDescription}</AlertDescription>
                )}
                {hasApproved && request.bypassReason && (
                  <AlertDescription className="mt-2 break-words">
                    <span className="font-medium text-warning">Reason:</span> {request.bypassReason}
                  </AlertDescription>
                )}
              </Alert>
            )}
            <div className="flex items-start gap-2 text-sm text-accent">
              <ProjectIcon className="mt-0.5 size-4 shrink-0 text-project" />
              <p>
                {requesterDisplay ? (
                  <span className="font-medium text-foreground">{requesterDisplay}</span>
                ) : (
                  "A user"
                )}{" "}
                requested access to the following resource:
              </p>
            </div>
            <div className="">
              <div className="mt-4 mb-2 text-mineshaft-200">
                <div
                  className={twMerge(
                    "grid gap-x-8 gap-y-4",
                    shouldCollapseDetails ? "grid-cols-1" : "grid-cols-2"
                  )}
                >
                  <Detail>
                    <DetailLabel>Environment</DetailLabel>
                    <DetailValue>{accessDetails.env}</DetailValue>
                  </Detail>
                  <Detail>
                    <DetailLabel>Secret Path</DetailLabel>
                    <DetailValue className={shouldCollapseDetails ? undefined : "truncate"}>
                      {accessDetails.secretPath}
                    </DetailValue>
                  </Detail>
                  <Detail>
                    <DetailLabel>Access Duration</DetailLabel>
                    <DetailValue>
                      <div className="flex items-center gap-1">
                        {getAccessLabel()}
                        {request.isApprover && request.status === ApprovalStatus.PENDING && (
                          <>
                            <EditAccessRequestModal
                              isOpen={popUp.editRequest.isOpen}
                              onOpenChange={(open) => handlePopUpToggle("editRequest", open)}
                              accessRequest={request}
                              onComplete={onUpdate}
                              projectSlug={projectSlug}
                            />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <IconButton
                                  onClick={() => handlePopUpOpen("editRequest")}
                                  variant="ghost"
                                  size="xs"
                                  tabIndex={-1}
                                  aria-label="Edit access duration"
                                  className="-my-1"
                                >
                                  <SquarePenIcon />
                                </IconButton>
                              </TooltipTrigger>
                              <TooltipContent>Edit Access Duration</TooltipContent>
                            </Tooltip>
                          </>
                        )}
                      </div>
                    </DetailValue>
                  </Detail>
                  {request.note && (
                    <Detail className="col-span-full">
                      <DetailLabel>Note</DetailLabel>
                      <DetailValue>{request.note}</DetailValue>
                    </Detail>
                  )}
                  {request.expiresAt &&
                    request.status === ApprovalStatus.PENDING &&
                    new Date(request.expiresAt) > new Date() && (
                      <Detail>
                        <DetailLabel>Request Expires</DetailLabel>
                        <DetailValue>
                          <span>
                            In{" "}
                            {ms(new Date(request.expiresAt).getTime() - Date.now(), {
                              long: true
                            })}
                          </span>
                        </DetailValue>
                      </Detail>
                    )}
                </div>
              </div>

              <div className="mt-4 mb-3">
                <span className="text-sm font-medium text-foreground">Requested Permissions</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Conditions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionGroups.length ? (
                    permissionGroups.map((group) => (
                      <TableRow key={group.key}>
                        <TableCell className="py-2 align-middle font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            {group.label}
                            {group.inverted && (
                              <Badge variant="danger">
                                <BanIcon />
                                Deny
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 align-middle whitespace-normal">
                          <div className="flex flex-wrap gap-1.5">
                            {group.actions.map((action) => (
                              <Badge key={action.value} variant="neutral">
                                {action.label}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 align-middle">
                          {group.conditions.length ? (
                            <HoverCard openDelay={100} closeDelay={100}>
                              <HoverCardTrigger asChild>
                                <button
                                  type="button"
                                  className="flex items-center gap-1 text-xs text-accent transition-colors hover:text-foreground"
                                >
                                  <FilterIcon className="size-3.5 shrink-0" />
                                  {group.conditions.length}{" "}
                                  {group.conditions.length === 1 ? "condition" : "conditions"}
                                </button>
                              </HoverCardTrigger>
                              <HoverCardContent align="end" className="z-[70] w-auto max-w-xs">
                                <div className="mb-1.5 text-xs font-medium text-foreground">
                                  Conditions
                                </div>
                                <div className="flex flex-col gap-1">
                                  {group.conditions.map((condition, idx) => (
                                    <div
                                      key={`${group.key}-condition-${idx + 1}`}
                                      className="text-xs text-mineshaft-200"
                                    >
                                      <span className="text-muted">{condition.field}</span>{" "}
                                      {condition.operator}{" "}
                                      <span className="font-medium text-foreground">
                                        {condition.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          ) : (
                            <span className="text-xs text-muted">None</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted">
                        No permissions specified
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="mt-4 mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Approvers</span>
                {approverSequence.isMyReviewInThisSequence &&
                  request.status === ApprovalStatus.PENDING &&
                  !hasExpired && (
                    <Badge variant="warning">
                      <ClipboardCheckIcon />
                      Awaiting Your Review
                    </Badge>
                  )}
              </div>
              {approvers.length === 1 ? (
                <ItemGroup className="gap-0 rounded-lg border border-border bg-container">
                  <Item className="flex-nowrap items-start rounded-none border-0">
                    <ItemContent className="min-w-0 gap-1.5">
                      {renderApproverMembers(approvers[0])}
                    </ItemContent>
                    <ItemActions>
                      {renderReviewersTooltip(approvers[0], getStatusBadge(approvers[0]))}
                      <span className="text-xs text-muted">
                        Min <span className="text-foreground">{approvers[0].approvals}</span>
                      </span>
                    </ItemActions>
                  </Item>
                </ItemGroup>
              ) : (
                <ItemGroup className="gap-0 rounded-lg border border-border bg-container">
                  {approvers.map((approver, index) => {
                    const isInactive =
                      approverSequence?.currentSequence < (approver.sequence ?? approvers.length);
                    const badge = getStatusBadge(approver);

                    return (
                      <Fragment key={`approval-list-${index + 1}`}>
                        {index > 0 && <ItemSeparator className="m-0" />}
                        <Item
                          className={twMerge(
                            "flex-nowrap items-start rounded-none border-0",
                            isInactive && "opacity-50"
                          )}
                        >
                          <ItemMedia>
                            <Badge variant="neutral">Step {index + 1}</Badge>
                          </ItemMedia>
                          <ItemContent className="min-w-0 gap-1.5">
                            {renderApproverMembers(approver)}
                          </ItemContent>
                          <ItemActions>
                            {renderReviewersTooltip(approver, badge)}
                            <span className="text-xs text-muted">
                              Min <span className="text-foreground">{approver.approvals}</span>
                            </span>
                          </ItemActions>
                        </Item>
                      </Fragment>
                    );
                  })}
                </ItemGroup>
              )}
            </div>
          </div>
          <SheetFooter className={twMerge("flex-col border-t", !showFooter && "hidden")}>
            {!shouldBlockRequestActions && (
              <>
                {isSoftEnforcement && request.isRequestedByCurrentUser && canBypass && (
                  <div className="mb-2 flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        onCheckedChange={(checked) => setBypassApproval(checked === true)}
                        isChecked={bypassApproval}
                        id="byPassApproval"
                        variant="warning"
                      />
                      <Label htmlFor="byPassApproval" className="text-xs font-normal text-warning">
                        Approve without waiting for requirements to be met (bypass policy
                        protection)
                      </Label>
                    </div>
                    {bypassApproval && (
                      <Field className="mt-2">
                        <FieldLabel htmlFor="bypassReason">
                          Reason for bypass
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <TriangleAlertIcon className="text-warning" />
                            </TooltipTrigger>
                            <TooltipContent>Enter a reason for bypassing the policy</TooltipContent>
                          </Tooltip>
                        </FieldLabel>
                        <TextArea
                          id="bypassReason"
                          value={bypassReason}
                          onChange={(e) => setBypassReason(e.currentTarget.value)}
                          placeholder="Enter reason for bypass (min 10 chars)"
                        />
                      </Field>
                    )}
                  </div>
                )}
                <div className="space-x-2">
                  <Button
                    isPending={isLoading === "approved"}
                    isDisabled={
                      Boolean(isLoading) ||
                      (!(
                        request.isApprover &&
                        (!request.isRequestedByCurrentUser || request.isSelfApproveAllowed)
                      ) &&
                        !bypassApproval)
                    }
                    onClick={() => handleReview("approved")}
                    size="sm"
                    variant={!request.isApprover && isSoftEnforcement ? "danger" : "project"}
                  >
                    <CheckIcon />
                    Approve Request
                  </Button>
                  <Button
                    isPending={isLoading === "rejected"}
                    isDisabled={!!isLoading || isRejectionDisabled}
                    onClick={() => handleReview("rejected")}
                    size="sm"
                    variant="danger"
                  >
                    <BanIcon />
                    Reject Request
                  </Button>
                </div>
              </>
            )}
            {hasApproved && canRevokeAccess && (
              <div>
                <Button
                  isDisabled={Boolean(isLoading)}
                  onClick={() => handlePopUpOpen("revokeConfirm")}
                  size="sm"
                  variant="danger"
                >
                  Revoke Access
                </Button>
              </div>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={popUp.revokeConfirm.isOpen}
        onOpenChange={(open) => {
          handlePopUpToggle("revokeConfirm", open);
          if (!open) setRevokeConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately remove the privilege granted by this access request. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="revoke-confirm">
              Type <span className="font-semibold text-foreground">confirm</span> to revoke
            </Label>
            <Input
              id="revoke-confirm"
              value={revokeConfirmText}
              onChange={(e) => setRevokeConfirmText(e.target.value)}
              placeholder="confirm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRevokeConfirmText("")}>Cancel</AlertDialogCancel>
            <Button
              variant="danger"
              isPending={isLoading === "revoked"}
              isDisabled={revokeConfirmText !== "confirm" || isLoading === "revoked"}
              onClick={handleRevoke}
            >
              Revoke Access
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
