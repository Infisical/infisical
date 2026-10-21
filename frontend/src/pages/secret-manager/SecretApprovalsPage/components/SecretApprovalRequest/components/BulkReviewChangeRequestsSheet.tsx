import { useMemo, useState } from "react";
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
  Field,
  FieldLabel,
  IconButton,
  Sheet,
  SheetContent,
  SheetDescription,
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
import { formatReservedPaths } from "@app/lib/fn/string";

import { SecretApprovalRequestChangeItem } from "./SecretApprovalRequestChangeItem";
import { generateCommitText } from "./SecretApprovalRequestChanges";

type Decision = "approve" | "reject";

type Outcome =
  | { status: "merged"; reviewError?: string }
  | { status: "rejected" }
  | { status: "awaiting" }
  | { status: "approved"; message: string }
  | { status: "failed"; message: string };

const PENDING_APPROVALS_PATTERN = /needs \d+ approval\(s\)/;

type Conflict = { secretKey: string; slug: string; mergesFirst: boolean };

const getApprovedCount = ({ policy, reviewers }: TSecretApprovalRequest) =>
  policy.approvers.filter(({ userId }) =>
    reviewers.some(
      (reviewer) => reviewer.userId === userId && reviewer.status === ApprovalStatus.APPROVED
    )
  ).length;

const getAuthorName = ({ committerUser, committerIdentity }: TSecretApprovalRequest) =>
  committerUser?.username ?? committerIdentity?.name ?? "Deleted User";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  requests: TSecretApprovalRequest[];
  environmentNamesBySlug: Record<string, string>;
  onComplete: (results: TBulkChangeRequestResult[]) => void;
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
  onClose,
  isSubmitting,
  setIsSubmitting
}: ContentProps) => {
  const [requests] = useState(() =>
    [...selectedRequests].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  );
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");
  const [outcomes, setOutcomes] = useState<Record<string, Outcome> | null>(null);

  const { mutateAsync: bulkAct } = useBulkActOnSecretApprovalRequests();
  const detailQueries = useGetSecretApprovalRequestDetailsList({
    ids: requests.map(({ id }) => id)
  });
  const detailsById = Object.fromEntries(
    requests.map(({ id }, index) => [id, detailQueries[index]?.data])
  );
  const isLoadingDetails = detailQueries.some(({ isPending }) => isPending);
  const hasAllDetails = detailQueries.every(({ data }) => Boolean(data));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, isLoadingDetails]);

  const decidedCount = requests.filter(({ id }) => decisions[id]).length;
  const approveCount = requests.filter(({ id }) => decisions[id] === "approve").length;
  const isReadyToSubmit = hasAllDetails && decidedCount === requests.length;

  const decide = (requestId: string, decision: Decision) => {
    setDecisions((prev) => ({ ...prev, [requestId]: decision }));
    setCollapsed((prev) => ({ ...prev, [requestId]: true }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const reviewComment = comment.trim() || undefined;
      const idsFor = (decision: Decision) =>
        requests.filter(({ id }) => decisions[id] === decision).map(({ id }) => id);
      const approveIds = idsFor("approve");
      const rejectIds = idsFor("reject");

      const approveResults = approveIds.length
        ? await bulkAct({
            projectId,
            action: BulkChangeRequestAction.Approve,
            comment: reviewComment,
            requestIds: approveIds
          })
        : [];
      const rejectResults = rejectIds.length
        ? await bulkAct({
            projectId,
            action: BulkChangeRequestAction.Reject,
            comment: reviewComment,
            requestIds: rejectIds
          })
        : [];
      const mergeResults = approveIds.length
        ? await bulkAct({
            projectId,
            action: BulkChangeRequestAction.Merge,
            requestIds: approveIds
          })
        : [];

      const nextOutcomes: Record<string, Outcome> = {};
      rejectResults.forEach(({ id, isSuccess, errorMessage }) => {
        nextOutcomes[id] = isSuccess
          ? { status: "rejected" }
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
          ? { status: "approved", message: errorMessage ?? "Could not be merged" }
          : { status: "failed", message: review?.errorMessage ?? errorMessage ?? "Review failed" };
      });
      setOutcomes(nextOutcomes);

      const listResults: TBulkChangeRequestResult[] = requests.map(({ id }) => {
        const outcome = nextOutcomes[id];
        if (outcome.status === "approved" || outcome.status === "failed")
          return {
            id,
            isSuccess: false,
            errorMessage:
              outcome.status === "approved"
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
          outcome.status === "approved" ? "text-warning" : "text-danger"
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
              {outcome.status === "approved" ? (
                <TriangleAlertIcon className="size-4" />
              ) : (
                <CircleXIcon className="size-4" />
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{outcome.message}</TooltipContent>
        </Tooltip>
        {outcome.status === "approved" ? "Approved, Not Merged" : "Failed"}
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
      ["awaiting", "approved and awaiting other reviewers"],
      ["approved", "approved but not merged"],
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
    ({ status }) => status === "approved" || status === "failed"
  );

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>
          Review {requests.length} Change Request{requests.length === 1 ? "" : "s"}
        </SheetTitle>
        <SheetDescription>
          Approve or reject each request. Approved requests merge once they meet their policy.
        </SheetDescription>
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
              <div className="flex items-center gap-3">
                <p className="flex-1 text-sm text-muted">
                  {decidedCount} of {requests.length} reviewed
                </p>
                <Button variant="ghost" size="sm" isDisabled={isSubmitting} onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="project"
                  size="sm"
                  isDisabled={!isReadyToSubmit}
                  isPending={isSubmitting}
                  onClick={handleSubmit}
                >
                  <GitMergeIcon />
                  {approveCount ? `Submit & Merge ${approveCount}` : "Submit Reviews"}
                </Button>
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
      <SheetContent size="wide" className="flex h-full flex-col gap-0 overflow-hidden">
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
