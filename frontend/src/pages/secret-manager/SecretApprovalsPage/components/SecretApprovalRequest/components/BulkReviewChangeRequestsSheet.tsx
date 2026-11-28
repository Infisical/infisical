import { useEffect, useMemo, useRef, useState } from "react";
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleXIcon,
  GitMergeIcon,
  TriangleAlertIcon,
  XIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldLabel,
  IconButton,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Spinner,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useOrganization, useUser } from "@app/context";
import {
  useBulkActOnSecretApprovalRequests,
  useGetSecretApprovalRequestDetailsList
} from "@app/hooks/api";
import {
  BulkChangeRequestAction,
  TBulkChangeRequestResult,
  TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";
import { ApprovalStatus } from "@app/hooks/api/types";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";
import { formatReservedPaths } from "@app/lib/fn/string";

import {
  doesChangeRequestNeedUserReview,
  isChangeRequestMergeable
} from "./changeRequestReviewState";
import { SecretApprovalRequestChangeItem } from "./SecretApprovalRequestChangeItem";
import { generateCommitText } from "./SecretApprovalRequestChanges";

type Decision = "approve" | "reject";

type Outcome =
  | { status: "merged"; reviewError?: string }
  | { status: "rejected" }
  | { status: "awaiting" }
  | { status: "approved" }
  | { status: "unmerged"; message: string }
  | { status: "failed"; message: string };

const PENDING_APPROVALS_PATTERN = /needs \d+ approval\(s\)/;

type Conflict = { secretKey: string; slug: string; mergesFirst: boolean };

const getApprovedCount = ({ policy, reviewers }: TSecretApprovalRequest) =>
  policy.approvers.filter(({ userId }) =>
    reviewers.some(
      (reviewer) => reviewer.userId === userId && reviewer.status === ApprovalStatus.APPROVED
    )
  ).length;

const getExistingDecision = (
  request: TSecretApprovalRequest,
  userId: string
): Decision | undefined => {
  const ownReview = request.reviewers.find((reviewer) => reviewer.userId === userId);
  if (ownReview?.status === ApprovalStatus.APPROVED) return "approve";
  if (ownReview?.status === ApprovalStatus.REJECTED) return "reject";
  if (!doesChangeRequestNeedUserReview(request, userId) && isChangeRequestMergeable(request))
    return "approve";
  return undefined;
};

const getAuthorName = ({ committerUser, committerIdentity }: TSecretApprovalRequest) =>
  committerUser?.username ?? committerIdentity?.name ?? "Deleted User";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  requests: TSecretApprovalRequest[];
  environmentNamesBySlug: Record<string, string>;
  onComplete: (results: TBulkChangeRequestResult[]) => void;
  onOutcomeUnknown: () => void;
};

type ContentProps = Omit<Props, "isOpen" | "onOpenChange"> & {
  onClose: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (isSubmitting: boolean) => void;
};

const BulkReviewChangeRequestsSheetContent = ({
  projectId,
  requests: selectedRequests,
  environmentNamesBySlug,
  onComplete,
  onOutcomeUnknown,
  onClose,
  isSubmitting,
  setIsSubmitting
}: ContentProps) => {
  const [requests] = useState(() =>
    [...selectedRequests].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  );
  const { user } = useUser();
  const [existingDecisions, setExistingDecisions] = useState<Record<string, Decision>>({});
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const hasSeededDecisions = useRef(false);
  const [comment, setComment] = useState("");
  const [outcomes, setOutcomes] = useState<Record<string, Outcome> | null>(null);

  const { currentOrg } = useOrganization();
  const { mutateAsync: bulkAct } = useBulkActOnSecretApprovalRequests();
  const detailQueries = useGetSecretApprovalRequestDetailsList({
    ids: requests.map(({ id }) => id)
  });
  const detailsById = Object.fromEntries(
    requests.map(({ id }, index) => [id, detailQueries[index]?.data])
  );
  const isLoadingDetails = detailQueries.some(({ isPending }) => isPending);
  const hasAllDetails = detailQueries.every(({ data }) => Boolean(data));
  const hasFreshDetails = detailQueries.every(({ data, isFetching }) => data && !isFetching);

  useEffect(() => {
    if (!hasFreshDetails || hasSeededDecisions.current) return;
    hasSeededDecisions.current = true;
    const baseline = Object.fromEntries(
      requests.flatMap((request) => {
        const decision = getExistingDecision(detailsById[request.id] ?? request, user.id);
        return decision ? [[request.id, decision] as const] : [];
      })
    );
    setExistingDecisions(baseline);
    setDecisions((prev) => ({ ...baseline, ...prev }));
    setCollapsed((prev) => ({
      ...Object.fromEntries(Object.keys(baseline).map((id) => [id, true])),
      ...prev
    }));
  }, [hasFreshDetails]);

  const groups = useMemo(() => {
    const byLocation = new Map<string, TSecretApprovalRequest[]>();
    requests.forEach((request) => {
      const key = `${request.environment}|${request.folderId}`;
      byLocation.set(key, [...(byLocation.get(key) ?? []), request]);
    });
    return [...byLocation.values()];
  }, [requests]);

  const conflictsById = useMemo(() => {
    const touchedBy = new Map<string, { secretKey: string; requests: TSecretApprovalRequest[] }>();
    requests.forEach((request) => {
      const secretKeys = new Set(
        (detailsById[request.id]?.commits ?? []).flatMap((commit) => [
          commit.secretKey,
          commit.secretVersion?.secretKey
        ])
      );
      secretKeys.forEach((secretKey) => {
        if (!secretKey) return;
        const locationKey = `${request.environment}|${request.folderId}|${secretKey}`;
        const entry = touchedBy.get(locationKey) ?? { secretKey, requests: [] };
        touchedBy.set(locationKey, { secretKey, requests: [...entry.requests, request] });
      });
    });

    const result: Record<string, Conflict[]> = {};
    touchedBy.forEach(({ secretKey, requests: touching }) => {
      if (touching.length < 2) return;
      touching.forEach((request, index) => {
        touching.forEach((other, otherIndex) => {
          if (other.id === request.id) return;
          result[request.id] = [
            ...(result[request.id] ?? []),
            { secretKey, slug: other.slug, mergesFirst: otherIndex < index }
          ];
        });
      });
    });
    return result;
  }, [requests, isLoadingDetails]);

  const decidedCount = requests.filter(({ id }) => decisions[id]).length;
  const approveCount = requests.filter(({ id }) => decisions[id] === "approve").length;
  const isReadyToSubmit = hasAllDetails && decidedCount === requests.length;
  const changedCount = requests.filter(
    ({ id }) => decisions[id] && decisions[id] !== existingDecisions[id]
  ).length;

  const decide = (requestId: string, decision: Decision) => {
    setDecisions((prev) => ({ ...prev, [requestId]: decision }));
    setCollapsed((prev) => ({ ...prev, [requestId]: true }));
  };

  const remainingCount = requests.length - decidedCount;

  const decideAll = (decision: Decision, { onlyRemaining }: { onlyRemaining: boolean }) => {
    setDecisions((prev) =>
      Object.fromEntries(
        requests.map(({ id }) => [id, onlyRemaining ? (prev[id] ?? decision) : decision])
      )
    );
  };

  const handleSubmit = async (shouldMerge: boolean) => {
    if (!isReadyToSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const reviewComment = comment.trim() || undefined;
      const idsFor = (decision: Decision, { isUnchanged }: { isUnchanged: boolean }) =>
        requests
          .filter(
            ({ id }) =>
              decisions[id] === decision && (existingDecisions[id] === decision) === isUnchanged
          )
          .map(({ id }) => id);
      const approveIds = idsFor("approve", { isUnchanged: false });
      const rejectIds = idsFor("reject", { isUnchanged: false });
      const unchangedResults = (decision: Decision) =>
        idsFor(decision, { isUnchanged: true }).map((id) => ({ id, isSuccess: true }));
      const mergeIds = requests.filter(({ id }) => decisions[id] === "approve").map(({ id }) => id);

      [
        { decision: "approved" as const, count: approveIds.length },
        { decision: "rejected" as const, count: rejectIds.length }
      ]
        .filter(({ count }) => count > 0)
        .forEach(({ decision, count }) =>
          analytics.captureForOrganization(
            AnalyticsEvent.SecretApprovalReviewSubmitted,
            currentOrg.id,
            {
              projectId,
              mode: "bulk",
              decision,
              requestCount: count,
              entryPoint: "bulk-review-sheet",
              mergeRequested: decision === "approved" && shouldMerge
            }
          )
        );

      let approveResults: TBulkChangeRequestResult[];
      let rejectResults: TBulkChangeRequestResult[];
      let mergeResults: TBulkChangeRequestResult[];
      try {
        approveResults = [
          ...unchangedResults("approve"),
          ...(approveIds.length
            ? await bulkAct({
                projectId,
                action: BulkChangeRequestAction.Approve,
                comment: reviewComment,
                requestIds: approveIds
              })
            : [])
        ];
        rejectResults = [
          ...unchangedResults("reject"),
          ...(rejectIds.length
            ? await bulkAct({
                projectId,
                action: BulkChangeRequestAction.Reject,
                comment: reviewComment,
                requestIds: rejectIds
              })
            : [])
        ];
        mergeResults =
          shouldMerge && mergeIds.length
            ? await bulkAct({
                projectId,
                action: BulkChangeRequestAction.Merge,
                requestIds: mergeIds
              })
            : [];
      } catch {
        onOutcomeUnknown();
        return;
      }

      const nextOutcomes: Record<string, Outcome> = {};
      rejectResults.forEach(({ id, isSuccess, errorMessage }) => {
        nextOutcomes[id] = isSuccess
          ? { status: "rejected" }
          : { status: "failed", message: errorMessage ?? "Review failed" };
      });
      if (!shouldMerge)
        approveResults.forEach(({ id, isSuccess, errorMessage }) => {
          nextOutcomes[id] = isSuccess
            ? { status: "approved" }
            : { status: "failed", message: errorMessage ?? "Review failed" };
        });
      mergeResults.forEach(({ id, isSuccess, errorMessage }) => {
        const review = approveResults.find((result) => result.id === id);
        if (isSuccess) {
          nextOutcomes[id] = {
            status: "merged",
            reviewError: review?.isSuccess ? undefined : review?.errorMessage
          };
          return;
        }
        if (review?.isSuccess && PENDING_APPROVALS_PATTERN.test(errorMessage ?? "")) {
          nextOutcomes[id] = { status: "awaiting" };
          return;
        }
        nextOutcomes[id] = review?.isSuccess
          ? { status: "unmerged", message: errorMessage ?? "Could not be merged" }
          : { status: "failed", message: review?.errorMessage ?? errorMessage ?? "Review failed" };
      });
      setOutcomes(nextOutcomes);

      const listResults: TBulkChangeRequestResult[] = requests.map(({ id }) => {
        const outcome = nextOutcomes[id];
        if (outcome.status === "unmerged" || outcome.status === "failed")
          return {
            id,
            isSuccess: false,
            errorMessage:
              outcome.status === "unmerged"
                ? `Approved, but not merged: ${outcome.message}`
                : outcome.message
          };
        return { id, isSuccess: true };
      });
      onComplete(listResults);

      const pendingCount = listResults.filter(({ isSuccess }) => !isSuccess).length;
      createNotification({
        type: pendingCount ? "warning" : "success",
        text: pendingCount
          ? `${requests.length - pendingCount} of ${requests.length} change requests completed. The rest stay selected.`
          : `${requests.length} change request${requests.length === 1 ? "" : "s"} reviewed`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderOutcome = (requestId: string) => {
    const outcome = outcomes?.[requestId];
    if (!outcome) return <Spinner size="xs" />;

    if (outcome.status === "approved")
      return (
        <span className="inline-flex items-center gap-1.5 text-sm text-success">
          <CheckIcon className="size-4" />
          Approved
        </span>
      );

    if (outcome.status === "awaiting")
      return (
        <span className="inline-flex items-center gap-1.5 text-sm text-success">
          <CheckIcon className="size-4" />
          Approved
          <span className="text-muted">Awaiting other reviewers</span>
        </span>
      );

    if (outcome.status === "merged" || outcome.status === "rejected")
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm",
            outcome.status === "merged" ? "text-success" : "text-danger"
          )}
        >
          {outcome.status === "merged" ? (
            <GitMergeIcon className="size-4" />
          ) : (
            <BanIcon className="size-4" />
          )}
          {outcome.status === "merged" ? "Merged" : "Rejected"}
          {outcome.status === "merged" && outcome.reviewError && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="img"
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so keyboard users can reveal the reason
                  tabIndex={0}
                  aria-label={`Your review wasn't saved: ${outcome.reviewError}`}
                  className="inline-flex rounded-sm text-warning outline-0 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TriangleAlertIcon className="size-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                Merged, but your review wasn&apos;t saved: {outcome.reviewError}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
      );

    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-sm",
          outcome.status === "unmerged" ? "text-warning" : "text-danger"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="img"
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so keyboard users can reveal the reason
              tabIndex={0}
              aria-label={outcome.message}
              className="inline-flex rounded-sm outline-0 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {outcome.status === "unmerged" ? (
                <TriangleAlertIcon className="size-4" />
              ) : (
                <CircleXIcon className="size-4" />
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{outcome.message}</TooltipContent>
        </Tooltip>
        {outcome.status === "unmerged" ? "Approved, Not Merged" : "Failed"}
      </span>
    );
  };

  const renderConflicts = (requestId: string) => {
    const conflicts = conflictsById[requestId];
    if (!conflicts?.length) return null;
    const secretKeys = [...new Set(conflicts.map(({ secretKey }) => secretKey))];
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so keyboard users can reveal the conflict details
            tabIndex={0}
            aria-label={`Overlaps another selected request on ${secretKeys.join(", ")}`}
            className="inline-flex items-center gap-1 rounded-sm text-xs text-warning outline-0 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <TriangleAlertIcon className="size-3.5" />
            Overlaps on {secretKeys.length === 1 ? secretKeys[0] : `${secretKeys.length} secrets`}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="flex flex-col gap-1">
            {conflicts.map(({ secretKey, slug, mergesFirst }) => (
              <span key={`${secretKey}-${slug}`}>
                {secretKey} is also changed in #{slug}, which merges{" "}
                {mergesFirst ? "before" : "after"} this request.
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  const outcomeValues = Object.values(outcomes ?? {});
  const summary = (
    [
      ["merged", "merged"],
      ["approved", "approved"],
      ["awaiting", "approved and awaiting other reviewers"],
      ["unmerged", "approved but not merged"],
      ["rejected", "rejected"],
      ["failed", "failed"]
    ] as const
  )
    .map(([status, label]) => ({
      label,
      count: outcomeValues.filter((outcome) => outcome.status === status).length
    }))
    .filter(({ count }) => count)
    .map(({ count, label }) => `${count} ${label}`)
    .join(", ");
  const hasUnfinished = outcomeValues.some(
    ({ status }) => status === "unmerged" || status === "failed"
  );

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>
          Review {requests.length} Change Request{requests.length === 1 ? "" : "s"}
        </SheetTitle>
      </SheetHeader>

      <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-6 overflow-y-auto p-4">
        {groups.map((group) => {
          const [{ id, environment, folderId, policy }] = group;
          const folderPath = detailsById[id]?.secretPath ?? policy.secretPath ?? "/";
          return (
            <section key={`${environment}-${folderId}`} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">
                  {environmentNamesBySlug[environment] ?? environment}
                </span>
                <span className="text-muted">{formatReservedPaths(folderPath)}</span>
              </div>
              {group.map((request) => {
                const details = detailsById[request.id];
                const detailQuery = detailQueries[requests.indexOf(request)];
                const decision = decisions[request.id];
                const isCollapsed = Boolean(collapsed[request.id]);
                return (
                  <div
                    key={request.id}
                    className="overflow-clip rounded-md border border-border bg-container"
                  >
                    <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <IconButton
                        variant="ghost"
                        size="xs"
                        aria-label={isCollapsed ? "Expand changes" : "Collapse changes"}
                        onClick={() =>
                          setCollapsed((prev) => ({ ...prev, [request.id]: !isCollapsed }))
                        }
                      >
                        {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                      </IconButton>
                      {generateCommitText(
                        details?.commits ?? request.commits,
                        request.isReplicated
                      )}
                      <span className="text-sm text-muted">#{request.slug}</span>
                      <span className="text-sm text-foreground">{getAuthorName(request)}</span>
                      <span className="text-sm text-muted">
                        {getApprovedCount(details ?? request)}/
                        {(details ?? request).policy.approvals} approvals
                      </span>
                      {renderConflicts(request.id)}
                      <div className="ml-auto flex items-center gap-2">
                        {!outcomes &&
                          !isSubmitting &&
                          decision &&
                          decision === existingDecisions[request.id] && (
                            <span className="text-sm text-muted">
                              Already {decision === "approve" ? "approved" : "rejected"}
                            </span>
                          )}
                        {outcomes || isSubmitting ? (
                          renderOutcome(request.id)
                        ) : (
                          <ButtonGroup>
                            <Button
                              size="xs"
                              variant={decision === "approve" ? "success" : "outline"}
                              aria-pressed={decision === "approve"}
                              onClick={() => decide(request.id, "approve")}
                            >
                              <CheckIcon />
                              Approve
                            </Button>
                            <Button
                              size="xs"
                              variant={decision === "reject" ? "danger" : "outline"}
                              aria-pressed={decision === "reject"}
                              onClick={() => decide(request.id, "reject")}
                            >
                              <XIcon />
                              Reject
                            </Button>
                          </ButtonGroup>
                        )}
                      </div>
                    </div>
                    {!isCollapsed && (
                      <div className="flex flex-col gap-2 border-t border-border p-3">
                        {details &&
                          details.commits.map(
                            ({ op, secretVersion, secret, ...newVersion }, index) => (
                              <SecretApprovalRequestChangeItem
                                key={`${op}-${index + 1}-${secretVersion?.id}`}
                                op={op}
                                conflicts={details.conflicts}
                                hasMerged={details.hasMerged}
                                secretVersion={secretVersion}
                                presentSecretVersionNumber={secret?.version || 0}
                                newVersion={newVersion}
                              />
                            )
                          )}
                        {!details && detailQuery?.isError && (
                          <div className="flex items-center gap-3 text-sm text-danger">
                            <CircleXIcon className="size-4" />
                            <span className="flex-1">
                              Could not load this request&apos;s changes.
                            </span>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => detailQuery.refetch()}
                            >
                              Retry
                            </Button>
                          </div>
                        )}
                        {!details && !detailQuery?.isError && <Skeleton className="h-16 w-full" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <SheetFooter className="border-t">
        <div className="flex w-full flex-col gap-2">
          {outcomes ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm text-muted">
                {summary}.
                {hasUnfinished &&
                  " Unfinished requests stay selected so you can open them individually."}
              </p>
              <Button variant="project" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="bulk-review-comment">Comment (optional)</FieldLabel>
                <TextArea
                  id="bulk-review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Added to each review..."
                  maxLength={1000}
                  rows={2}
                  disabled={isSubmitting}
                />
              </Field>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <p className="flex-1 text-sm whitespace-nowrap text-muted">
                  {decidedCount} of {requests.length} reviewed
                </p>
                <Button variant="ghost" size="sm" isDisabled={isSubmitting} onClick={onClose}>
                  Cancel
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={isSubmitting}>
                    <Button variant="outline" size="sm">
                      Decide All
                      <ChevronDownIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuItem
                      variant="success"
                      isDisabled={!remainingCount}
                      onClick={() => decideAll("approve", { onlyRemaining: true })}
                    >
                      <CheckIcon className="mt-0.5 self-start" />
                      <div className="flex flex-col">
                        <span className="font-medium">Approve Remaining ({remainingCount})</span>
                        <span className="text-xs text-accent">
                          Keeps the decisions you already made.
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="danger"
                      isDisabled={!remainingCount}
                      onClick={() => decideAll("reject", { onlyRemaining: true })}
                    >
                      <XIcon className="mt-0.5 self-start" />
                      <div className="flex flex-col">
                        <span className="font-medium">Reject Remaining ({remainingCount})</span>
                        <span className="text-xs text-accent">
                          Keeps the decisions you already made.
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="success"
                      onClick={() => decideAll("approve", { onlyRemaining: false })}
                    >
                      <CheckIcon className="mt-0.5 self-start" />
                      <div className="flex flex-col">
                        <span className="font-medium">Approve All {requests.length}</span>
                        <span className="text-xs text-accent">
                          Replaces every decision, including rejections.
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="danger"
                      onClick={() => decideAll("reject", { onlyRemaining: false })}
                    >
                      <XIcon className="mt-0.5 self-start" />
                      <div className="flex flex-col">
                        <span className="font-medium">Reject All {requests.length}</span>
                        <span className="text-xs text-accent">
                          Replaces every decision, including approvals.
                        </span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={!isReadyToSubmit || isSubmitting}>
                    <Button variant="project" size="sm" isPending={isSubmitting}>
                      <span className="tabular-nums opacity-70">
                        {approveCount}/{requests.length} Approved
                      </span>
                      <span aria-hidden className="h-3.5 w-px bg-current opacity-30" />
                      Submit
                      <ChevronDownIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuItem
                      isDisabled={!changedCount}
                      onClick={() => handleSubmit(false)}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">Submit Reviews</span>
                        <span className="text-xs text-accent">
                          Record your approvals and rejections without merging.
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem isDisabled={!approveCount} onClick={() => handleSubmit(true)}>
                      <div className="flex flex-col">
                        <span className="font-medium">Submit & Merge</span>
                        <span className="text-xs text-accent">
                          Also merge approved requests that meet their policy.
                        </span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </SheetFooter>
    </>
  );
};

export const BulkReviewChangeRequestsSheet = ({ isOpen, onOpenChange, ...contentProps }: Props) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && isSubmitting) return;
        onOpenChange(open);
      }}
    >
      <SheetContent
        size="wide"
        aria-describedby={undefined}
        className="flex h-full flex-col gap-0 overflow-hidden"
      >
        {isOpen && (
          <BulkReviewChangeRequestsSheetContent
            {...contentProps}
            onClose={() => onOpenChange(false)}
            isSubmitting={isSubmitting}
            setIsSubmitting={setIsSubmitting}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
