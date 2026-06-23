import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
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
  Input,
  TextArea
} from "@app/components/v3";
import { useUpdateAccessRequest } from "@app/hooks/api/accessApproval/mutation";
import { accessApprovalKeys } from "@app/hooks/api/accessApproval/queries";
import { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";

type ContentProps = {
  accessRequest: TAccessApprovalRequest;
  onComplete: (request: TAccessApprovalRequest) => void;
  projectSlug: string;
};

const EditSchema = z.object({
  temporaryRange: z
    .string()
    .nonempty("Required")
    .transform((val, ctx) => {
      const parsedMs = ms(val);

      if (typeof parsedMs !== "number" || parsedMs <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Invalid time period format or value. Must be a positive duration (e.g., '1h', '30m', '2d')."
        });
        return z.NEVER;
      }
      return val;
    }),
  editNote: z.string().nonempty("Required")
});

type FormData = z.infer<typeof EditSchema>;

const Content = ({ accessRequest, onComplete, projectSlug }: ContentProps) => {
  const update = useUpdateAccessRequest();
  const queryClient = useQueryClient();
  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm({
    resolver: zodResolver(EditSchema),
    defaultValues: {
      temporaryRange: accessRequest.temporaryRange ?? "1h",
      editNote: ""
    }
  });

  const onSubmit = async (form: FormData) => {
    const request = await update.mutateAsync({
      requestId: accessRequest.id,
      projectSlug,
      ...form
    });
    await queryClient.refetchQueries({
      queryKey: accessApprovalKeys.getAccessApprovalRequestsAllForProject(projectSlug)
    });

    createNotification({
      type: "success",
      text: "Access request updated successfully."
    });
    onComplete(request);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertTitle>Updating restarts the review process</AlertTitle>
        <AlertDescription>
          All approvers will be required to re-approve this access request.
        </AlertDescription>
      </Alert>
      <Controller
        control={control}
        defaultValue="1h"
        name="temporaryRange"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="temporaryRange">
              <TtlFormLabel label="Access Duration" />
            </FieldLabel>
            <Input id="temporaryRange" {...field} isError={Boolean(error?.message)} />
            {!error && (
              <FieldDescription>
                Must be less than current access duration:{" "}
                {accessRequest.isTemporary ? accessRequest.temporaryRange : "Permanent"}
              </FieldDescription>
            )}
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="editNote"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="editNote">Reason for Editing</FieldLabel>
            <TextArea
              id="editNote"
              className="resize-none!"
              rows={4}
              {...field}
              isError={Boolean(error?.message)}
              placeholder="Provide a reason for updating this request..."
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="project" isPending={isSubmitting} isDisabled={isSubmitting}>
          Update Request
        </Button>
      </DialogFooter>
    </form>
  );
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessRequest?: TAccessApprovalRequest;
  onComplete: (request: TAccessApprovalRequest) => void;
  projectSlug: string;
};

export const EditAccessRequestModal = ({
  isOpen,
  onOpenChange,
  accessRequest,
  onComplete,
  projectSlug
}: Props) => {
  if (!accessRequest) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Access Request</DialogTitle>
          <DialogDescription>Modify this access request for re-approval.</DialogDescription>
        </DialogHeader>
        <Content
          projectSlug={projectSlug}
          accessRequest={accessRequest}
          onComplete={(request) => {
            onComplete(request);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
