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
  FieldDescription,
  FieldLabel,
  Label,
  RadioGroup,
  RadioGroupItem,
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
    "Adds your approving review to each request. Requests you can't review are reported below.",
  [BulkChangeRequestAction.Reject]:
    "Adds your rejecting review to each request. Requests you can't review are reported below.",
  [BulkChangeRequestAction.Merge]:
    "Merges each request that has its required approvals. Requests that would need a policy bypass are reported below and must be merged individually."
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
  const [action, setAction] = useState(initialAction);
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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Review Change Requests</DialogTitle>
        <DialogDescription>
          Apply one action to {requests.length} selected change request
          {requests.length === 1 ? "" : "s"}. Each request is checked against its own policy and
          your permissions.
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-72 min-h-0 overflow-y-auto rounded-md border border-border">
        <Table>
          <TableHeader>
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
                  <TableCell title={request.policy.secretPath}>
                    {request.policy.secretPath}
                  </TableCell>
                  {!results && (
                    <TableCell>
                      {getApprovedCount(request)}/{request.policy.approvals}
                    </TableCell>
                  )}
                  <TableCell isWrappable>{renderResult(request.id)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {failedResults.length > 0 && (
        <p className="text-sm text-muted">
          Failed requests stay selected so you can open them individually or try again.
        </p>
      )}
      {!results && (
        <div className="flex shrink-0 flex-col gap-4">
          <Field>
            <FieldLabel>Action</FieldLabel>
            <RadioGroup
              value={action}
              onValueChange={(value) => setAction(value as BulkChangeRequestAction)}
              className="grid-cols-3"
              disabled={isPending}
            >
              {ACTION_OPTIONS.map(({ value, label, icon: Icon, variant }) => {
                const id = `bulk-change-request-action-${value}`;
                return (
                  <Button key={value} variant={variant} asChild isFullWidth>
                    <Label htmlFor={id} className="justify-start">
                      <RadioGroupItem id={id} value={value} />
                      <Icon />
                      {label}
                    </Label>
                  </Button>
                );
              })}
            </RadioGroup>
            <FieldDescription>{ACTION_DESCRIPTIONS[action]}</FieldDescription>
          </Field>
          {action !== BulkChangeRequestAction.Merge && (
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
        </div>
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
