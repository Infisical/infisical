import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
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
import {
  SecretScanningFindingStatus,
  TSecretScanningFinding,
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

  useEffect(() => {
    if (isOpen) reset({ comment: "" });
  }, [isOpen, reset]);

  if (!status) return null;

  const { name, description } = SECRET_SCANNING_FINDING_STATUS_MAP[status];
  const isBulk = findings.length > 1;
  const hasExistingComment = findings.some((finding) => Boolean(finding.triageComment));

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
              isPending={updateFindings.isPending}
              isDisabled={updateFindings.isPending}
            >
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
