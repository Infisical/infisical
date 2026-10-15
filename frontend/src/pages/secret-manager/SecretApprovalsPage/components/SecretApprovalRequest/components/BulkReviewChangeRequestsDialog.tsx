import { useState } from "react";
import { CheckIcon, CircleXIcon, GitMergeIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
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
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
    const result = results?.[requestId];
    if (!result) return <Spinner size="xs" />;

    if (result.isSuccess)
      return (
        <span className="inline-flex items-center gap-1.5 text-success">
          <CheckIcon className="size-4" />
          {ACTION_RESULT_LABELS[action]}
        </span>
      );

    return (
      <span className="inline-flex items-center gap-1.5 text-danger">
        <Tooltip>
          <TooltipTrigger asChild>
            <span role="img" aria-label={result.errorMessage} className="inline-flex">
              <CircleXIcon className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{result.errorMessage}</TooltipContent>
        </Tooltip>
        Failed
      </span>
    );
  };

  const selectedOption = ACTION_OPTIONS.find(({ value }) => value === action) ?? ACTION_OPTIONS[0];
  const failedResults = Object.values(results ?? {}).filter(({ isSuccess }) => !isSuccess);
  const succeededCount = Object.keys(results ?? {}).length - failedResults.length;
  const showResults = isPending || Boolean(results);
  const ActionIcon = selectedOption.icon;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
      <DialogHeader>
        <DialogTitle>
          {selectedOption.label} {requests.length} Change Request
          {requests.length === 1 ? "" : "s"}
        </DialogTitle>
      </DialogHeader>
      <Table containerClassName="max-h-72 overflow-y-auto">
        <TableHeader sticky>
          <TableRow>
            <TableHead>Change</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead>Secret Path</TableHead>
            {showResults ? <TableHead>Result</TableHead> : <TableHead>Approvals</TableHead>}
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
                <TableCell>
                  {showResults
                    ? renderResult(request.id)
                    : `${getApprovedCount(request)}/${request.policy.approvals}`}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {results && (
        <p className="text-sm text-muted">
          {succeededCount} {ACTION_RESULT_LABELS[action].toLowerCase()}
          {failedResults.length > 0 &&
            `, ${failedResults.length} failed. Failed requests stay selected so you can open them individually or try again.`}
        </p>
      )}
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
              <ActionIcon />
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
          aria-describedby={undefined}
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
