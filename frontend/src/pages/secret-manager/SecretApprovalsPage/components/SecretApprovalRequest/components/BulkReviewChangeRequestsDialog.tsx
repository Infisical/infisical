import { useState } from "react";
import { CheckIcon, CircleXIcon, GitMergeIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextArea
} from "@app/components/v3";
import { useBulkActOnSecretApprovalRequests } from "@app/hooks/api";
import {
  BulkChangeRequestAction,
  TBulkChangeRequestResult,
  TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";
import { ApprovalStatus } from "@app/hooks/api/types";

import { generateCommitText } from "./SecretApprovalRequestChanges";

const ACTION_OPTIONS = [
  {
    value: BulkChangeRequestAction.Approve,
    label: "Approve",
    icon: CheckIcon,
    variant: "success"
  },
  {
    value: BulkChangeRequestAction.Reject,
    label: "Reject",
    icon: XIcon,
    variant: "danger"
  },
  {
    value: BulkChangeRequestAction.Merge,
    label: "Merge",
    icon: GitMergeIcon,
    variant: "project"
  }
] as const;

const ACTION_DESCRIPTIONS: Record<BulkChangeRequestAction, string> = {
  [BulkChangeRequestAction.Approve]:
    "Adds your approving review to each request. Each request is checked against its own policy and your permissions.",
  [BulkChangeRequestAction.Reject]:
    "Adds your rejecting review to each request. Each request is checked against its own policy and your permissions.",
  [BulkChangeRequestAction.Merge]:
    "Merges each request that has its required approvals. Requests that would need a policy bypass are reported and must be merged individually."
};

const ACTION_RESULT_LABELS: Record<BulkChangeRequestAction, string> = {
  [BulkChangeRequestAction.Approve]: "Approved",
  [BulkChangeRequestAction.Reject]: "Rejected",
  [BulkChangeRequestAction.Merge]: "Merged"
};

const getApprovedCount = ({ policy, reviewers }: TSecretApprovalRequest) =>
  policy.approvers.filter(({ userId }) =>
    reviewers.some(
      (reviewer) => reviewer.userId === userId && reviewer.status === ApprovalStatus.APPROVED
    )
  ).length;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  requests: TSecretApprovalRequest[];
  initialAction: BulkChangeRequestAction;
  environmentNamesBySlug: Record<string, string>;
  onComplete: (results: TBulkChangeRequestResult[]) => void;
};

type ContentProps = Omit<Props, "isOpen" | "onOpenChange"> & {
  bulkAct: ReturnType<typeof useBulkActOnSecretApprovalRequests>["mutateAsync"];
  isPending: boolean;
};

const BulkReviewChangeRequestsDialogContent = ({
  projectId,
  requests: selectedRequests,
  initialAction,
  environmentNamesBySlug,
  onComplete,
  bulkAct,
  isPending
}: ContentProps) => {
  const [requests] = useState(selectedRequests);
  const action = initialAction;
  const [comment, setComment] = useState("");
  const [results, setResults] = useState<Record<string, TBulkChangeRequestResult> | null>(null);

  const handleSubmit = async () => {
    const allResults = await bulkAct({
      projectId,
      action,
      comment: action === BulkChangeRequestAction.Merge ? undefined : comment.trim() || undefined,
      requestIds: requests.map(({ id }) => id)
    });

    setResults(Object.fromEntries(allResults.map((result) => [result.id, result])));
    onComplete(allResults);

    const successCount = allResults.filter(({ isSuccess }) => isSuccess).length;
    const failedCount = allResults.length - successCount;
    const actionLabel = ACTION_RESULT_LABELS[action].toLowerCase();

    if (!failedCount) {
      createNotification({
        type: "success",
        text: `${successCount} change request${successCount === 1 ? "" : "s"} ${actionLabel}`
      });
    } else if (successCount) {
      createNotification({
        type: "warning",
        text: `${successCount} change request${successCount === 1 ? "" : "s"} ${actionLabel}, ${failedCount} failed. Failed requests stay selected.`
      });
    } else {
      createNotification({
        type: "error",
        text: `None of the selected change requests could be ${actionLabel}`
      });
    }
  };

  const renderResult = (requestId: string) => {
    if (isPending) return <Spinner size="xs" />;

    const result = results?.[requestId];
    if (!result) return <span className="text-muted">Pending</span>;

    if (result.isSuccess)
      return (
        <Badge variant="success">
          <CheckIcon />
          {ACTION_RESULT_LABELS[action]}
        </Badge>
      );

    return (
      <div className="flex flex-col items-start gap-1 py-1">
        <Badge variant="danger">
          <CircleXIcon />
          Failed
        </Badge>
        <span className="text-xs text-muted">{result.errorMessage}</span>
      </div>
    );
  };

  const selectedOption = ACTION_OPTIONS.find(({ value }) => value === action) ?? ACTION_OPTIONS[0];
  const failedResults = Object.values(results ?? {}).filter(({ isSuccess }) => !isSuccess);
  const succeededCount = Object.keys(results ?? {}).length - failedResults.length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
      <DialogHeader>
        <DialogTitle>
          {selectedOption.label} {requests.length} Change Request
          {requests.length === 1 ? "" : "s"}
        </DialogTitle>
        <DialogDescription>{ACTION_DESCRIPTIONS[action]}</DialogDescription>
      </DialogHeader>
      {results && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="success">
            <CheckIcon />
            {succeededCount} {ACTION_RESULT_LABELS[action].toLowerCase()}
          </Badge>
          {failedResults.length > 0 && (
            <Badge variant="danger">
              <CircleXIcon />
              {failedResults.length} failed
            </Badge>
          )}
          {failedResults.length > 0 && (
            <span className="text-muted">
              Failed requests stay selected so you can open them individually or try again.
            </span>
          )}
        </div>
      )}
      <Table containerClassName="max-h-72 overflow-y-auto">
        <TableHeader sticky>
          <TableRow>
            <TableHead>Change</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead>Secret Path</TableHead>
            {!results && <TableHead>Approvals</TableHead>}
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => {
            const environmentName =
              environmentNamesBySlug[request.environment] ?? request.environment;
            return (
              <TableRow key={request.id}>
                <TableCell>
                  {generateCommitText(request.commits, request.isReplicated, true)}
                </TableCell>
                <TableCell title={environmentName}>{environmentName}</TableCell>
                <TableCell title={request.policy.secretPath}>{request.policy.secretPath}</TableCell>
                {!results && (
                  <TableCell>
                    {getApprovedCount(request)}/{request.policy.approvals}
                  </TableCell>
                )}
                <TableCell isWrappable className="max-w-80">
                  {renderResult(request.id)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!results && action !== BulkChangeRequestAction.Merge && (
        <Field>
          <FieldLabel htmlFor="bulk-change-request-comment">Comment (optional)</FieldLabel>
          <TextArea
            id="bulk-change-request-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Leave a comment on each review..."
            maxLength={1000}
            rows={3}
            disabled={isPending}
          />
        </Field>
      )}
      <DialogFooter>
        {results ? (
          <DialogClose asChild>
            <Button variant="project" size="sm">
              Done
            </Button>
          </DialogClose>
        ) : (
          <>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" isDisabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant={selectedOption.variant}
              size="sm"
              isPending={isPending}
              onClick={handleSubmit}
            >
              {selectedOption.label} {requests.length} Request{requests.length === 1 ? "" : "s"}
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
};

export const BulkReviewChangeRequestsDialog = ({
  isOpen,
  onOpenChange,
  ...contentProps
}: Props) => {
  const { mutateAsync: bulkAct, isPending } = useBulkActOnSecretApprovalRequests();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && isPending) return;
        onOpenChange(open);
      }}
    >
      {isOpen && (
        <DialogContent
          className="max-w-3xl [&>*]:min-w-0"
          isPending={isPending}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <BulkReviewChangeRequestsDialogContent
            {...contentProps}
            bulkAct={bulkAct}
            isPending={isPending}
          />
        </DialogContent>
      )}
    </Dialog>
  );
};
