import { useMemo, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { Field } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Separator } from "@infisical/cipher/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Meta, StatusText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { ChevronUpIcon } from "lucide-react";

import {
  ApprovalStatus,
  BulkChangeRequestAction,
  type TBulkChangeRequestResult
} from "@app/hooks/api/secretApprovalRequest/types";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";
import { formatReservedPaths } from "@app/lib/fn/string";

import { toast } from "../../../access/toast";
import { useV4Adapter, useV4Mode } from "../../../data/adapters";
import { useV4Session } from "../../../data/session/contract";
import { ChangeItem } from "./ChangeItem";
import { approvedCount, authorName, type ChangeRequest, changeTitle, plural } from "./parts";

import styles from "./bulk-review.module.css";

type Decision = "approve" | "reject";
type Outcome =
  | { status: "merged"; reviewError?: string }
  | { status: "reviewed" }
  | { status: "rejected" }
  | { status: "awaiting" }
  | { status: "approved"; message: string }
  | { status: "failed"; message: string };
type Overlap = { secretKey: string; slug: string; mergesFirst: boolean };

const PENDING_APPROVALS = /needs \d+ approval\(s\)/;

const existingDecisionOf = (request: ChangeRequest, userId: string): Decision | undefined => {
  const ownReview = request.reviewers.find((reviewer) => reviewer.userId === userId);
  if (ownReview?.status === ApprovalStatus.APPROVED) return "approve";
  if (ownReview?.status === ApprovalStatus.REJECTED) return "reject";
  const needsMyReview =
    !ownReview && request.policy.approvers.some((approver) => approver.userId === userId);
  if (!needsMyReview && approvedCount(request) >= request.policy.approvals) return "approve";
  return undefined;
};

const OutcomeText = ({ outcome }: { outcome?: Outcome }) => {
  if (!outcome) return <Meta mono={false}>Working</Meta>;
  if (outcome.status === "reviewed")
    return (
      <StatusText tone="ok" icon="check-c">
        Approved
      </StatusText>
    );
  if (outcome.status === "awaiting")
    return (
      <StatusText tone="ok" icon="check-c">
        Approved, awaiting other reviewers
      </StatusText>
    );
  if (outcome.status === "rejected")
    return (
      <StatusText tone="bad" icon="x">
        Rejected
      </StatusText>
    );
  if (outcome.status === "merged") {
    const merged = (
      <StatusText tone={outcome.reviewError ? "warn" : "ok"} icon="check-c" tabIndex={0}>
        Merged
      </StatusText>
    );
    return outcome.reviewError ? (
      <Tooltip content={`Merged, but your review was not saved: ${outcome.reviewError}`}>
        {merged}
      </Tooltip>
    ) : (
      merged
    );
  }
  return (
    <Tooltip content={outcome.message}>
      <StatusText tone={outcome.status === "approved" ? "warn" : "bad"} icon="alert-c" tabIndex={0}>
        {outcome.status === "approved" ? "Approved, not merged" : "Failed"}
      </StatusText>
    </Tooltip>
  );
};

const ReviewContent = ({
  projectId,
  requests: selected,
  environmentName,
  onComplete,
  onOutcomeUnknown,
  onClose,
  submitting,
  setSubmitting
}: {
  projectId: string;
  requests: ChangeRequest[];
  environmentName: (slug: string) => string;
  onComplete: (results: TBulkChangeRequestResult[]) => void;
  onOutcomeUnknown: () => void;
  onClose: () => void;
  submitting: boolean;
  setSubmitting: (submitting: boolean) => void;
}) => {
  const secrets = useV4Adapter("secrets");
  const mode = useV4Mode();
  const { user, organization } = useV4Session();
  const bulkAct = secrets.useBulkActOnApprovalRequests();
  const [requests] = useState(() =>
    [...selected].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  );
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");
  const [outcomes, setOutcomes] = useState<Record<string, Outcome> | null>(null);
  const detailQueries = secrets.useApprovalRequestDetailsList(requests.map(({ id }) => id));
  const details = Object.fromEntries(
    requests.map(({ id }, index) => [id, detailQueries[index]?.data])
  );
  const hasAllDetails = detailQueries.every(({ data }) => Boolean(data));
  const hasFreshDetails = detailQueries.every(({ data, isFetching }) => data && !isFetching);
  const [existing, setExisting] = useState<Record<string, Decision>>();
  if (!existing && hasFreshDetails) {
    const baseline = Object.fromEntries(
      requests.flatMap((request) => {
        const decision = existingDecisionOf(details[request.id] ?? request, user.id);
        return decision ? [[request.id, decision] as const] : [];
      })
    );
    setExisting(baseline);
    setDecisions((current) => ({ ...baseline, ...current }));
    setCollapsed((current) => ({
      ...Object.fromEntries(Object.keys(baseline).map((id) => [id, true])),
      ...current
    }));
  }

  const groups = useMemo(() => {
    const byLocation = new Map<string, ChangeRequest[]>();
    requests.forEach((request) => {
      const key = `${request.environment}|${request.folderId}`;
      byLocation.set(key, [...(byLocation.get(key) ?? []), request]);
    });
    return [...byLocation.values()];
  }, [requests]);

  const overlaps = (() => {
    const touchedBy = new Map<string, { secretKey: string; requests: ChangeRequest[] }>();
    requests.forEach((request) => {
      const keys = new Set(
        (details[request.id]?.commits ?? []).flatMap((commit) => [
          commit.secretKey,
          commit.secretVersion?.secretKey
        ])
      );
      keys.forEach((secretKey) => {
        if (!secretKey) return;
        const key = `${request.environment}|${request.folderId}|${secretKey}`;
        const entry = touchedBy.get(key) ?? { secretKey, requests: [] };
        touchedBy.set(key, { secretKey, requests: [...entry.requests, request] });
      });
    });
    const result: Record<string, Overlap[]> = {};
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
  })();

  const decided = requests.filter(({ id }) => decisions[id]).length;
  const approveCount = requests.filter(({ id }) => decisions[id] === "approve").length;
  const remaining = requests.length - decided;
  const changedCount = requests.filter(
    ({ id }) => decisions[id] && decisions[id] !== existing?.[id]
  ).length;
  let submitBlocked: string | undefined;
  if (!hasAllDetails || !existing) submitBlocked = "Wait for every request's changes to load";
  else if (decided < requests.length) submitBlocked = "Approve or reject every request first";

  const decideAll = (decision: Decision, onlyRemaining: boolean) =>
    setDecisions((current) =>
      Object.fromEntries(
        requests.map(({ id }) => [id, onlyRemaining ? (current[id] ?? decision) : decision])
      )
    );

  const submit = async (shouldMerge: boolean) => {
    setSubmitting(true);
    try {
      const reviewComment = comment.trim() || undefined;
      const idsFor = (decision: Decision, unchanged: boolean) =>
        requests
          .filter(
            ({ id }) => decisions[id] === decision && (existing?.[id] === decision) === unchanged
          )
          .map(({ id }) => id);
      const unchangedResults = (decision: Decision): TBulkChangeRequestResult[] =>
        idsFor(decision, true).map((id) => ({ id, isSuccess: true }));
      const approveIds = idsFor("approve", false);
      const rejectIds = idsFor("reject", false);
      const mergeIds = requests.filter(({ id }) => decisions[id] === "approve").map(({ id }) => id);
      if (mode === "live")
        [
          { decision: "approved" as const, count: approveIds.length },
          { decision: "rejected" as const, count: rejectIds.length }
        ]
          .filter(({ count }) => count > 0)
          .forEach(({ decision, count }) =>
            analytics.captureForOrganization(
              AnalyticsEvent.SecretApprovalReviewSubmitted,
              organization.id,
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
      const approveResults = [
        ...unchangedResults("approve"),
        ...(approveIds.length
          ? await bulkAct.mutateAsync({
              projectId,
              action: BulkChangeRequestAction.Approve,
              comment: reviewComment,
              requestIds: approveIds
            })
          : [])
      ];
      const rejectResults = [
        ...unchangedResults("reject"),
        ...(rejectIds.length
          ? await bulkAct.mutateAsync({
              projectId,
              action: BulkChangeRequestAction.Reject,
              comment: reviewComment,
              requestIds: rejectIds
            })
          : [])
      ];
      const mergeResults =
        shouldMerge && mergeIds.length
          ? await bulkAct.mutateAsync({
              projectId,
              action: BulkChangeRequestAction.Merge,
              requestIds: mergeIds
            })
          : [];

      const next: Record<string, Outcome> = {};
      rejectResults.forEach(({ id, isSuccess, errorMessage }) => {
        next[id] = isSuccess
          ? { status: "rejected" }
          : { status: "failed", message: errorMessage ?? "Review failed" };
      });
      if (!shouldMerge)
        approveResults.forEach(({ id, isSuccess, errorMessage }) => {
          next[id] = isSuccess
            ? { status: "reviewed" }
            : { status: "failed", message: errorMessage ?? "Review failed" };
        });
      mergeResults.forEach(({ id, isSuccess, errorMessage }) => {
        const review = approveResults.find((result) => result.id === id);
        if (isSuccess) {
          next[id] = {
            status: "merged",
            reviewError: review?.isSuccess ? undefined : review?.errorMessage
          };
          return;
        }
        if (review?.isSuccess && PENDING_APPROVALS.test(errorMessage ?? "")) {
          next[id] = { status: "awaiting" };
          return;
        }
        next[id] = review?.isSuccess
          ? { status: "approved", message: errorMessage ?? "Could not be merged" }
          : { status: "failed", message: review?.errorMessage ?? errorMessage ?? "Review failed" };
      });
      setOutcomes(next);

      const results: TBulkChangeRequestResult[] = requests.map(({ id }) => {
        const outcome = next[id];
        if (outcome.status === "approved")
          return {
            id,
            isSuccess: false,
            errorMessage: `Approved, but not merged: ${outcome.message}`
          };
        if (outcome.status === "failed")
          return { id, isSuccess: false, errorMessage: outcome.message };
        return { id, isSuccess: true };
      });
      onComplete(results);
      const unfinished = results.filter(({ isSuccess }) => !isSuccess).length;
      toast(
        unfinished
          ? {
              tone: "neutral",
              title: `${requests.length - unfinished} of ${requests.length} change requests completed`,
              description: "Unfinished requests stay selected so you can open them individually."
            }
          : { tone: "ok", title: `${plural(requests.length, "change request")} reviewed` }
      );
    } catch {
      toast({
        tone: "bad",
        title: "Couldn't confirm the review results",
        description: "Some requests may have changed. Check the list before reviewing again."
      });
      onOutcomeUnknown();
    } finally {
      setSubmitting(false);
    }
  };

  const overlapNote = (requestId: string) => {
    const found = overlaps[requestId];
    if (!found?.length) return null;
    const keys = [...new Set(found.map(({ secretKey }) => secretKey))];
    return (
      <Tooltip
        content={found
          .map(
            ({ secretKey, slug, mergesFirst }) =>
              `${secretKey} is also changed in #${slug}, which merges ${mergesFirst ? "before" : "after"} this request.`
          )
          .join(" ")}
      >
        <StatusText tone="warn" icon="alert" tabIndex={0}>
          {`Overlaps on ${keys.length === 1 ? keys[0] : `${keys.length} secrets`}`}
        </StatusText>
      </Tooltip>
    );
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{`Review ${plural(requests.length, "change request")}`}</SheetTitle>
      </SheetHeader>
      <SheetBody>
        <Stack gap={24}>
          {groups.map((group) => {
            const [{ id, environment, folderId, policy }] = group;
            const folderPath = details[id]?.secretPath ?? policy.secretPath ?? "/";
            return (
              <Stack key={`${environment}-${folderId}`} gap={12}>
                <Inline gap={8}>
                  <strong>{environmentName(environment)}</strong>
                  {formatReservedPaths(folderPath) !== "/" && (
                    <Meta>{formatReservedPaths(folderPath)}</Meta>
                  )}
                </Inline>
                {group.map((request, index) => {
                  const detail = details[request.id];
                  const query = detailQueries[requests.indexOf(request)];
                  const isCollapsed = Boolean(collapsed[request.id]);
                  const source = detail ?? request;
                  return (
                    <Stack key={request.id} gap={8}>
                      {index > 0 && <Separator />}
                      <div className={styles.requestHead}>
                        <div className={styles.requestText}>
                          <span className={styles.requestTitle}>{changeTitle(source)}</span>
                          <span className={styles.requestMeta}>
                            <span>{authorName(request)}</span>
                            <span>
                              {`${approvedCount(source)} of ${source.policy.approvals} approvals`}
                            </span>
                            <span className={styles.slug}>{`#${request.slug}`}</span>
                            {overlapNote(request.id)}
                          </span>
                        </div>
                        <span className={styles.requestActions}>
                          {outcomes || submitting ? (
                            <OutcomeText outcome={outcomes?.[request.id]} />
                          ) : (
                            <ToggleGroup
                              type="single"
                              size="sm"
                              aria-label={`Decision for change request #${request.slug}`}
                              value={decisions[request.id] ?? ""}
                              onValueChange={(next) => {
                                if (!next) return;
                                setDecisions((current) => ({
                                  ...current,
                                  [request.id]: next as Decision
                                }));
                                setCollapsed((current) => ({ ...current, [request.id]: true }));
                              }}
                            >
                              <ToggleGroupItem value="approve">Approve</ToggleGroupItem>
                              <ToggleGroupItem value="reject">Reject</ToggleGroupItem>
                            </ToggleGroup>
                          )}
                          {!outcomes &&
                            !submitting &&
                            decisions[request.id] &&
                            decisions[request.id] === existing?.[request.id] && (
                              <Meta mono={false}>
                                {decisions[request.id] === "approve"
                                  ? "Already approved"
                                  : "Already rejected"}
                              </Meta>
                            )}
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            iconOnly
                            icon={isCollapsed ? "chev-down" : ChevronUpIcon}
                            onClick={() =>
                              setCollapsed((current) => ({
                                ...current,
                                [request.id]: !isCollapsed
                              }))
                            }
                          >
                            {isCollapsed ? "Show changes" : "Hide changes"}
                          </Button>
                        </span>
                      </div>
                      {!isCollapsed && detail && (
                        <Stack gap={8}>
                          {detail.commits.map((commit) => (
                            <ChangeItem
                              key={commit.id}
                              commit={commit}
                              conflicts={detail.conflicts}
                              hasMerged={detail.hasMerged}
                            />
                          ))}
                        </Stack>
                      )}
                      {!isCollapsed && !detail && query?.isError && (
                        <Inline gap={8}>
                          <StatusText tone="bad" icon="alert-c">
                            Could not load this request&apos;s changes.
                          </StatusText>
                          <Button variant="outline" size="xs" onClick={() => query.refetch()}>
                            Retry
                          </Button>
                        </Inline>
                      )}
                      {!isCollapsed && !detail && !query?.isError && (
                        <Skeleton style={{ height: 64 }} />
                      )}
                    </Stack>
                  );
                })}
              </Stack>
            );
          })}
        </Stack>
      </SheetBody>
      <SheetFooter>
        {outcomes ? (
          <Inline gap={8} justify="end" style={{ width: "100%" }}>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </Inline>
        ) : (
          <Stack gap={12} style={{ width: "100%" }}>
            <Field label="Comment" optional description="Added to each review.">
              <Textarea
                rows={2}
                maxLength={1000}
                value={comment}
                disabled={submitting}
                onChange={(event) => setComment(event.target.value)}
              />
            </Field>
            <Inline gap={8}>
              <Meta mono={false} role="status" style={{ marginInlineEnd: "auto" }}>
                {`${decided} of ${requests.length} reviewed`}
              </Meta>
              <Button variant="ghost" disabled={submitting} onClick={onClose}>
                Cancel
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    layout="trigger"
                    variant="outline"
                    disabled={submitting}
                    disabledReason={
                      existing ? undefined : "Wait for every request's changes to load"
                    }
                  >
                    Decide all
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabledReason={remaining ? undefined : "Every request has a decision"}
                    description="Keeps the decisions you already made."
                    onSelect={() => decideAll("approve", true)}
                  >
                    {`Approve remaining (${remaining})`}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabledReason={remaining ? undefined : "Every request has a decision"}
                    description="Keeps the decisions you already made."
                    onSelect={() => decideAll("reject", true)}
                  >
                    {`Reject remaining (${remaining})`}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    description="Replaces every decision, including rejections."
                    onSelect={() => decideAll("approve", false)}
                  >
                    {`Approve all ${requests.length}`}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    description="Replaces every decision, including approvals."
                    onSelect={() => decideAll("reject", false)}
                  >
                    {`Reject all ${requests.length}`}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                loading={submitting}
                disabledReason={
                  submitBlocked ??
                  (changedCount ? undefined : "You already reviewed these requests")
                }
                onClick={() => submit(false)}
              >
                Submit reviews
              </Button>
              <Button
                variant="primary"
                loading={submitting}
                disabledReason={
                  submitBlocked ?? (approveCount ? undefined : "Approve a request to merge it")
                }
                onClick={() => submit(true)}
              >
                {`Submit and merge ${approveCount}`}
              </Button>
            </Inline>
          </Stack>
        )}
      </SheetFooter>
    </>
  );
};

export const BulkReviewSheet = ({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  requests: ChangeRequest[];
  environmentName: (slug: string) => string;
  onComplete: (results: TBulkChangeRequestResult[]) => void;
  onOutcomeUnknown: () => void;
}) => {
  const [submitting, setSubmitting] = useState(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" pending={submitting} className={styles.sheet}>
        {open && (
          <ReviewContent
            {...props}
            onClose={() => onOpenChange(false)}
            submitting={submitting}
            setSubmitting={setSubmitting}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
