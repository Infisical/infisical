import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  FieldError,
  FieldLabel,
  TextArea
} from "@app/components/v3";
import { SECRET_SCANNING_FINDING_STATUS_MAP } from "@app/helpers/secretScanningV2";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningFindingOrderBy,
  SecretScanningFindingStatus,
  TSecretScanningFinding,
  useListSecretScanningFindings,
  useUpdateMultipleSecretScanningFinding
} from "@app/hooks/api/secretScanningV2";

const formSchema = z.object({
  comment: z.string().trim().max(1024, "Comment cannot exceed 1024 characters")
});

type TFormData = z.infer<typeof formSchema>;

type Props = {
  findings: TSecretScanningFinding[];
  status: SecretScanningFindingStatus | null;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: (result: {
    status: SecretScanningFindingStatus;
    triageComment: string | null;
  }) => void;
};

export const FindingStatusDialog = ({ findings, status, onOpenChange, onComplete }: Props) => {
  const updateFindings = useUpdateMultipleSecretScanningFinding();

  const { control, handleSubmit, reset } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { comment: "" }
  });

  const isOpen = Boolean(status && findings.length);
  // closing a finding also closes the project's other unresolved findings with the same secret value
  const isClosing = Boolean(status && status !== SecretScanningFindingStatus.Unresolved);

  const {
    data: sameValueData,
    isLoading: isLoadingSameValue,
    isError: isSameValueError
  } = useListSecretScanningFindings(
    {
      projectId: findings[0]?.projectId ?? "",
      status: SecretScanningFindingStatus.Unresolved,
      sameValueAs: findings.map((finding) => finding.id),
      orderBy: SecretScanningFindingOrderBy.ResourceName,
      orderDirection: OrderByDirection.ASC,
      offset: 0,
      limit: 100
    },
    { enabled: isOpen && isClosing, placeholderData: undefined }
  );

  useEffect(() => {
    if (isOpen) reset({ comment: "" });
  }, [isOpen, reset]);

  if (!status) return null;

  const { name, description } = SECRET_SCANNING_FINDING_STATUS_MAP[status];
  const isBulk = findings.length > 1;
  const hasExistingComment = findings.some((finding) => Boolean(finding.triageComment));
  const sameValueFindings = isClosing ? (sameValueData?.findings ?? []) : [];
  const sameValueCount = isClosing ? (sameValueData?.totalCount ?? 0) : 0;
  const unlistedCount = sameValueCount - sameValueFindings.length;
  // the warning is only useful if it is seen before confirming, so confirming waits for the check
  const isCheckingSameValue = isClosing && isLoadingSameValue;
  const hasSameValueError = isClosing && isSameValueError;

  const onSubmit = ({ comment }: TFormData) => {
    const triageComment = comment || null;

    updateFindings.mutate(
      findings.map((finding) => ({
        findingId: finding.id,
        projectId: finding.projectId,
        status,
        triageComment
      })),
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            text: isBulk
              ? `${findings.length} findings marked as ${name}`
              : `Finding marked as ${name}`
          });
          onOpenChange(false);
          onComplete?.({ status, triageComment });
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isBulk ? `Mark ${findings.length} Findings as ${name}` : `Mark as ${name}`}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {hasSameValueError && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>Could not check for findings with the same secret value</AlertTitle>
              <AlertDescription>
                Other unresolved findings with the same secret value may also be marked as {name}.
              </AlertDescription>
            </Alert>
          )}
          {!hasSameValueError && sameValueCount > 0 && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>
                Also marks {sameValueCount} other {sameValueCount === 1 ? "finding" : "findings"} as{" "}
                {name}
              </AlertTitle>
              <AlertDescription>
                <p>
                  {sameValueCount === 1 ? "It has" : "They have"} the same secret value as{" "}
                  {isBulk ? "the selected findings" : "this finding"} and{" "}
                  {sameValueCount === 1 ? "is" : "are"} still unresolved.
                </p>
                <ul className="flex max-h-40 w-full flex-col gap-1 overflow-y-auto">
                  {sameValueFindings.map((finding) => (
                    <li key={finding.id} className="min-w-0">
                      <p className="truncate text-foreground">{finding.resourceName}</p>
                      <p className="truncate text-xs text-muted">
                        {finding.details.file}:{finding.details.startLine}
                      </p>
                    </li>
                  ))}
                </ul>
                {unlistedCount > 0 && <p>And {unlistedCount} more.</p>}
              </AlertDescription>
            </Alert>
          )}
          <Controller
            control={control}
            name="comment"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="finding-status-comment">Comment (Optional)</FieldLabel>
                <TextArea
                  {...field}
                  id="finding-status-comment"
                  rows={3}
                  placeholder="Explain why, e.g. rotated in the provider and redeployed."
                  isError={Boolean(error)}
                />
                <FieldDescription isOpen={hasExistingComment}>
                  Leave blank to remove the current {isBulk ? "comments" : "comment"}.
                </FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="ss"
              type="submit"
              isPending={updateFindings.isPending || isCheckingSameValue}
              isDisabled={updateFindings.isPending || isCheckingSameValue}
            >
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
