import { useMemo, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Separator } from "@app/components/v4/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Meta, StatusText } from "@app/components/v4/ui/text";
import { Textarea } from "@app/components/v4/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  BulkChangeRequestAction,
  type TBulkChangeRequestResult
} from "@app/hooks/api/secretApprovalRequest/types";
import { formatReservedPaths } from "@app/lib/fn/string";

import { toast } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { ChangeItem } from "./ChangeItem";
import { approvedCount, type ChangeRequest, ChangeSummary, plural } from "./parts";

type Decision = "approve" | "reject";
type Outcome =
  | { status: "merged"; reviewError?: string }
  | { status: "rejected" }
  | { status: "awaiting" }
  | { status: "approved"; message: string }
  | { status: "failed"; message: string };
type Overlap = { secretKey: string; slug: string; mergesFirst: boolean };

const PENDING_APPROVALS = /needs \d+ approval\(s\)/;

const authorOf = ({ committerUser, committerIdentity }: ChangeRequest) =>
  committerUser?.username ?? committerIdentity?.name ?? "Deleted user";

const OutcomeText = ({ outcome }: { outcome?: Outcome }) => {
  if (!outcome) return <Meta mono={false}>Working</Meta>;
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
  onClose,
  submitting,
  setSubmitting
}: {
  projectId: string;
  requests: ChangeRequest[];
  environmentName: (slug: string) => string;
  onComplete: (results: TBulkChangeRequestResult[]) => void;
  onClose: () => void;
  submitting: boolean;
  setSubmitting: (submitting: boolean) => void;
}) => {
  const secrets = useV4Adapter("secrets");
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
  let submitBlocked: string | undefined;
  if (!hasAllDetails) submitBlocked = "Wait for every request's changes to load";
  else if (decided < requests.length) submitBlocked = "Approve or reject every request first";

  const submit = async () => {
    setSubmitting(true);
    try {
      const reviewComment = comment.trim() || undefined;
      const idsFor = (decision: Decision) =>
        requests.filter(({ id }) => decisions[id] === decision).map(({ id }) => id);
      const approveIds = idsFor("approve");
      const rejectIds = idsFor("reject");
      const approveResults = approveIds.length
        ? await bulkAct.mutateAsync({
            projectId,
            action: BulkChangeRequestAction.Approve,
            comment: reviewComment,
            requestIds: approveIds
          })
        : [];
      const rejectResults = rejectIds.length
        ? await bulkAct.mutateAsync({
            projectId,
            action: BulkChangeRequestAction.Reject,
            comment: reviewComment,
            requestIds: rejectIds
          })
        : [];
      const mergeResults = approveIds.length
        ? await bulkAct.mutateAsync({
            projectId,
            action: BulkChangeRequestAction.Merge,
            requestIds: approveIds
          })
        : [];

      const next: Record<string, Outcome> = {};
      rejectResults.forEach(({ id, isSuccess, errorMessage }) => {
        next[id] = isSuccess
          ? { status: "rejected" }
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
        <SheetDescription>Approved requests merge once they meet their policy.</SheetDescription>
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
                  <Meta>{formatReservedPaths(folderPath)}</Meta>
                </Inline>
                {group.map((request, index) => {
                  const detail = details[request.id];
                  const query = detailQueries[requests.indexOf(request)];
                  const isCollapsed = Boolean(collapsed[request.id]);
                  const source = detail ?? request;
                  return (
                    <Stack key={request.id} gap={8}>
                      {index > 0 && <Separator />}
                      <Inline gap={12}>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          iconOnly
                          icon={isCollapsed ? "chev-right" : "chev-down"}
                          onClick={() =>
                            setCollapsed((current) => ({ ...current, [request.id]: !isCollapsed }))
                          }
                        >
                          {isCollapsed ? "Expand changes" : "Collapse changes"}
                        </Button>
                        <ChangeSummary
                          commits={source.commits}
                          isReplicated={request.isReplicated}
                        />
                        <Meta>{`#${request.slug}`}</Meta>
                        <span>{authorOf(request)}</span>
                        <Meta mono={false}>
                          {`${approvedCount(source)}/${source.policy.approvals} approvals`}
                        </Meta>
                        {overlapNote(request.id)}
                        <span style={{ marginInlineStart: "auto" }}>
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
                        </span>
                      </Inline>
                      {!isCollapsed &&
                        detail?.commits.map((commit, commitIndex) => (
                          <ChangeItem
                            key={`${commit.op}-${commitIndex + 1}-${commit.secretVersion?.id}`}
                            commit={commit}
                            conflicts={detail.conflicts}
                            hasMerged={detail.hasMerged}
                          />
                        ))}
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
              <Button variant="outline" disabled={submitting} onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={submitting}
                disabledReason={submitBlocked}
                onClick={submit}
              >
                {approveCount ? `Submit and merge ${approveCount}` : "Submit reviews"}
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
}) => {
  const [submitting, setSubmitting] = useState(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" pending={submitting}>
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
